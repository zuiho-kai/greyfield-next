import { _electron as electron, type ElectronApplication, type Page } from "playwright";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { defaultGreyfieldConfig } from "@greyfield/persistence/config-schema";

const workspaceRoot = fileURLToPath(new URL("../../..", import.meta.url));
const desktopRoot = join(workspaceRoot, "apps", "desktop");
const tempDir = await mkdtemp(join(tmpdir(), "greyfield-settings-provider-test-"));
const configPath = join(tempDir, "greyfield.config.json");
let requestCount = 0;
let responseMode: "success" | "failure" = "success";

const server = createServer(async (_request: IncomingMessage, response: ServerResponse) => {
  requestCount += 1;
  await delay(250);
  if (responseMode === "failure") {
    response.statusMessage = "Unauthorized";
    response.writeHead(401, { "content-type": "application/json" });
    response.end(JSON.stringify({ error: "bad key" }));
    return;
  }
  response.writeHead(200, {
    "content-type": "text/event-stream",
    "cache-control": "no-cache"
  });
  response.write('data: {"choices":[{"delta":{"content":"pong"}}]}\n\n');
  response.write("data: [DONE]\n\n");
  response.end();
});

await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
const port = (server.address() as AddressInfo).port;

await writeFile(configPath, `${JSON.stringify(defaultGreyfieldConfig, null, 2)}\n`, "utf8");

try {
  const app = await launchApp();
  try {
    const settingsWindow = await waitForRoleWindow(app, "settings");
    await settingsWindow.locator(".provider-status--preview", { hasText: "Preview" }).waitFor({ timeout: 10_000 });
    await settingsWindow.locator(".provider-status--preview", { hasText: "Fake provider is active" }).waitFor();
    await settingsWindow.getByRole("button", { name: "Test LLM" }).click();
    await settingsWindow.locator(".provider-test-result--success", { hasText: "Test succeeded" }).waitFor({ timeout: 10_000 });

    await settingsWindow.getByLabel("LLM").fill("openai-compatible");
    await settingsWindow.getByLabel("Base URL").fill("");
    await settingsWindow.getByLabel("API Key").fill("");
    await settingsWindow.getByLabel("Model", { exact: true }).fill("");
    await settingsWindow.locator(".provider-status--blocked", { hasText: "Needs Base URL" }).waitFor();
    await expectTestLlmBlocked(settingsWindow, "OpenAI-compatible chat needs a Base URL");
    assertProviderRequestCount(0, "missing Base URL");

    await settingsWindow.getByLabel("Base URL").fill(`http://127.0.0.1:${port}/v1`);
    await settingsWindow.locator(".provider-status--blocked", { hasText: "Needs API key" }).waitFor();
    await expectTestLlmBlocked(settingsWindow, "Add an API key before testing");
    assertProviderRequestCount(0, "missing API key");

    await settingsWindow.getByLabel("API Key").fill("local-settings-key");
    await settingsWindow.locator(".provider-status--blocked", { hasText: "Needs model" }).waitFor();
    await expectTestLlmBlocked(settingsWindow, "Choose the provider model name");
    assertProviderRequestCount(0, "missing model");

    await settingsWindow.getByLabel("Model", { exact: true }).fill("settings-provider-test-model");
    await settingsWindow.locator(".provider-status--ready", { hasText: "Ready to test" }).waitFor();
    const testButton = settingsWindow.getByRole("button", { name: "Test LLM" });
    if (!(await testButton.isEnabled())) {
      throw new Error("Test LLM stayed disabled after provider settings were complete");
    }

    responseMode = "success";
    await testButton.click();
    await settingsWindow.getByRole("button", { name: "Testing..." }).waitFor();
    await settingsWindow.locator(".provider-test-result--testing", { hasText: "Testing LLM" }).waitFor();
    await settingsWindow.locator(".provider-test-result--success", { hasText: "Received first token: pong" }).waitFor({
      timeout: 10_000
    });

    responseMode = "failure";
    await settingsWindow.getByRole("button", { name: "Test LLM" }).click();
    await settingsWindow.locator(".provider-test-result--error", { hasText: "Test failed" }).waitFor({ timeout: 10_000 });
    await settingsWindow.locator(".provider-test-result--error", { hasText: "401" }).waitFor();
    assertProviderRequestCount(2, "success plus failure tests");

    console.log(
      JSON.stringify(
        {
          ok: true,
          fakePreviewVisible: true,
          missingBaseUrlBlocked: true,
          missingApiKeyBlocked: true,
          missingModelBlocked: true,
          testLlmTestingVisible: true,
          testLlmSuccessVisible: true,
          testLlmFailureVisible: true,
          blockedStatesSentNoProviderRequests: true,
          providerRequests: requestCount
        },
        null,
        2
      )
    );
  } finally {
    await app.close();
  }
} finally {
  server.closeAllConnections?.();
  server.close();
  await rm(tempDir, { recursive: true, force: true });
}

async function launchApp(): Promise<ElectronApplication> {
  const output: string[] = [];
  const app = await electron.launch({
    cwd: desktopRoot,
    args: [join(desktopRoot, "dist-main", "index.mjs")],
    env: {
      ...process.env,
      GREYFIELD_CONFIG_PATH: configPath,
      GREYFIELD_PROJECT_ROOT: workspaceRoot,
      GREYFIELD_USER_DATA_PATH: tempDir
    }
  });
  app.process().stdout?.on("data", (chunk) => output.push(String(chunk)));
  app.process().stderr?.on("data", (chunk) => output.push(String(chunk)));
  try {
    await app.firstWindow({ timeout: 10_000 });
  } catch (error) {
    const urls = app.windows().map((page) => page.url());
    const spawnargs = app.process().spawnargs;
    await app.close().catch(() => undefined);
    throw new Error(
      `Timed out waiting for first Electron window; spawnargs=${JSON.stringify(spawnargs)}; urls=${JSON.stringify(
        urls
      )}; output=${output.join("").slice(-4000)}; cause=${String(error)}`
    );
  }
  return app;
}

async function waitForRoleWindow(app: ElectronApplication, roleName: "settings"): Promise<Page> {
  const started = Date.now();
  while (Date.now() - started < 5_000) {
    for (const page of app.windows()) {
      const role = await page.evaluate(() => new URLSearchParams(window.location.search).get("window")).catch(() => null);
      if (role === roleName) {
        await page.waitForSelector(".greyfield-shell");
        return page;
      }
    }
    await delay(100);
  }
  throw new Error(`Timed out waiting for ${roleName} window`);
}

async function expectTestLlmBlocked(page: Page, message: string): Promise<void> {
  const button = page.getByRole("button", { name: "Test LLM" });
  if (!(await button.isDisabled())) {
    throw new Error(`Test LLM was not disabled for blocked provider state: ${message}`);
  }
  await page.locator(".provider-test-result--error", { hasText: message }).waitFor({ timeout: 10_000 });
}

function assertProviderRequestCount(expected: number, label: string): void {
  if (requestCount !== expected) {
    throw new Error(`Unexpected provider request count for ${label}; expected=${expected}, actual=${requestCount}`);
  }
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
