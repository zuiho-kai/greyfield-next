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
const tempDir = await mkdtemp(join(tmpdir(), "greyfield-active-chat-test-"));
const configPath = join(tempDir, "greyfield.config.json");
let requestCount = 0;
let activeResponse: ServerResponse | undefined;

const server = createServer((_request: IncomingMessage, response: ServerResponse) => {
  requestCount += 1;
  activeResponse = response;
  response.writeHead(200, {
    "content-type": "text/event-stream",
    "cache-control": "no-cache"
  });
  response.write('data: {"choices":[{"delta":{"content":"正在长回复，设置页测试应被拒绝。"}}]}\n\n');
});

await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
const port = (server.address() as AddressInfo).port;

await writeFile(
  configPath,
  `${JSON.stringify(
    {
      ...defaultGreyfieldConfig,
      provider: {
        ...defaultGreyfieldConfig.provider,
        llm: "openai-compatible",
        baseUrl: `http://127.0.0.1:${port}/v1`,
        apiKey: "local-active-chat-key",
        model: "active-chat-harness-model"
      }
    },
    null,
    2
  )}\n`,
  "utf8"
);

try {
  const app = await launchApp();
  try {
    const chatWindow = await waitForRoleWindow(app, "chat");
    const settingsWindow = await waitForRoleWindow(app, "settings");
    await sendMessage(chatWindow, "请保持一段长回复。");
    await chatWindow.locator(".message-list .assistant.draft", { hasText: "正在长回复" }).waitFor({ timeout: 10_000 });

    const testLlmButton = settingsWindow.getByRole("button", { name: "Test LLM" });
    const expected =
      "LLM test is unavailable while a chat response is running. Stop the current reply or wait for it to finish, then retry.";
    await waitForDisabled(testLlmButton, 10_000);
    await settingsWindow.locator(".provider-test-result--error", { hasText: expected }).waitFor({ timeout: 10_000 });
    if (requestCount !== 1) {
      throw new Error(`Provider test during active chat sent an extra request; requestCount=${requestCount}`);
    }

    await chatWindow.getByRole("button", { name: "Stop" }).click();
    await chatWindow.locator(".status-pill", { hasText: "Stopped" }).waitFor({ timeout: 10_000 });

    console.log(
      JSON.stringify(
        {
          ok: true,
          activeChatTestRejected: true,
          requestCount,
          guidanceVisible: true
        },
        null,
        2
      )
    );
  } finally {
    await app.close();
  }
} finally {
  activeResponse?.destroy();
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
      `Timed out waiting for first Electron window; spawnargs=${JSON.stringify(spawnargs)}; urls=${JSON.stringify(urls)}; output=${output.join("").slice(-4000)}; cause=${String(error)}`
    );
  }
  return app;
}

async function waitForRoleWindow(app: ElectronApplication, roleName: "settings" | "chat"): Promise<Page> {
  const started = Date.now();
  while (Date.now() - started < 5_000) {
    for (const page of app.windows()) {
      const role = await page.evaluate(() => new URLSearchParams(window.location.search).get("window")).catch(() => null);
      if (role === roleName) {
        await page.waitForSelector(roleName === "settings" ? ".greyfield-shell" : ".chat-shell");
        return page;
      }
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`Timed out waiting for ${roleName} window`);
}

async function sendMessage(page: Page, text: string): Promise<void> {
  await page.getByLabel("Message").fill(text);
  await page.getByRole("button", { name: "Send" }).click();
}

async function waitForDisabled(button: ReturnType<Page["getByRole"]>, timeoutMs: number): Promise<void> {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    if (await button.isDisabled()) {
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error("Timed out waiting for Test LLM to become disabled");
}
