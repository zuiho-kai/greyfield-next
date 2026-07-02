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
    await settingsWindow.locator(".provider-status--preview", { hasText: /Preview|预览模式/ }).waitFor({ timeout: 10_000 });
    await settingsWindow.locator(".provider-status--preview", { hasText: /Fake provider is active|本地假服务/ }).waitFor();
    const providerSelect = settingsWindow.locator('[data-settings-section="provider"] select').first();
    if ((await providerSelect.inputValue()) !== "fake") {
      throw new Error("Settings did not start in fake provider preview mode");
    }
    await settingsWindow.getByRole("button", { name: /^(Test LLM|测试 LLM)$/ }).click();
    await settingsWindow.locator(".provider-test-result--success", { hasText: /Test succeeded|测试成功/ }).waitFor({ timeout: 10_000 });

    await settingsWindow.getByLabel("Base URL").fill("");
    await settingsWindow.getByLabel("API Key").fill("");
    await settingsWindow.getByLabel(/^(Chat reply|聊天回复)$/, { exact: true }).fill("");
    await providerSelect.selectOption("openai-compatible");
    await settingsWindow.locator(".provider-status--blocked", { hasText: /Needs Base URL|需要 Base URL/ }).waitFor();
    await expectTestLlmBlocked(settingsWindow, /OpenAI-compatible chat needs a Base URL|Base URL/);
    assertProviderRequestCount(0, "missing Base URL");

    await providerSelect.selectOption("fake");
    await settingsWindow.locator(".provider-status--preview", { hasText: /Preview|预览模式/ }).waitFor();
    await settingsWindow.getByLabel("Base URL").fill(`http://127.0.0.1:${port}/v1`);
    await waitForSelectValue(providerSelect, "openai-compatible");
    await settingsWindow.locator(".provider-status--blocked", { hasText: /Needs API key|需要 API key/ }).waitFor();
    await expectTestLlmBlocked(settingsWindow, /Add an API key before testing|API key/);
    assertProviderRequestCount(0, "missing API key");

    await settingsWindow.getByLabel("API Key").fill("local-settings-key");
    await settingsWindow.locator(".provider-status--blocked", { hasText: /Needs model|需要模型/ }).waitFor();
    await expectTestLlmBlocked(settingsWindow, /Choose the provider model name|模型名称/);
    assertProviderRequestCount(0, "missing model");

    await settingsWindow.getByLabel(/^(Chat reply|聊天回复)$/, { exact: true }).fill("settings-provider-test-model");
    await settingsWindow.locator(".provider-status--ready", { hasText: /Ready to test|可以测试/ }).waitFor();
    const testButton = settingsWindow.getByRole("button", { name: /^(Test LLM|测试 LLM)$/ });
    if (!(await testButton.isEnabled())) {
      throw new Error("Test LLM stayed disabled after provider settings were complete");
    }

    responseMode = "success";
    await testButton.click();
    await settingsWindow.getByRole("button", { name: /^(Testing\.\.\.|测试中\.\.\.)$/ }).waitFor();
    await settingsWindow.locator(".provider-test-result--testing", { hasText: /Testing LLM|正在测试 LLM/ }).waitFor();
    await settingsWindow.locator(".provider-test-result--success", { hasText: /Received first token: pong|收到首个 token：pong/ }).waitFor({
      timeout: 10_000
    });

    responseMode = "failure";
    await settingsWindow.getByRole("button", { name: /^(Test LLM|测试 LLM)$/ }).click();
    await settingsWindow.locator(".provider-test-result--error", { hasText: /Test failed|测试失败/ }).waitFor({ timeout: 10_000 });
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
          realConfigFieldsSwitchProviderMode: true,
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

async function expectTestLlmBlocked(page: Page, message: RegExp): Promise<void> {
  const button = page.getByRole("button", { name: /^(Test LLM|测试 LLM)$/ });
  if (!(await button.isDisabled())) {
    throw new Error(`Test LLM was not disabled for blocked provider state: ${message}`);
  }
  await page.locator(".provider-test-result--error", { hasText: message }).first().waitFor({ timeout: 10_000 });
}

function assertProviderRequestCount(expected: number, label: string): void {
  if (requestCount !== expected) {
    throw new Error(`Unexpected provider request count for ${label}; expected=${expected}, actual=${requestCount}`);
  }
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForSelectValue(select: ReturnType<Page["getByLabel"]>, value: string): Promise<void> {
  const started = Date.now();
  while (Date.now() - started < 5_000) {
    if ((await select.inputValue()) === value) {
      return;
    }
    await delay(100);
  }
  throw new Error(`Timed out waiting for provider select to become ${value}`);
}
