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
const tempDir = await mkdtemp(join(tmpdir(), "greyfield-provider-abort-"));
const configPath = join(tempDir, "greyfield.config.json");
let requestCount = 0;
let requestClosed = false;
let response: ServerResponse | undefined;

const server = createServer((_request: IncomingMessage, nextResponse: ServerResponse) => {
  requestCount += 1;
  response = nextResponse;
  nextResponse.writeHead(200, {
    "content-type": "text/event-stream",
    "cache-control": "no-cache"
  });
  nextResponse.write('data: {"choices":[{"delta":{"content":"开始长回复。"}}]}\n\n');
  nextResponse.on("close", () => {
    requestClosed = true;
  });
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
        apiKey: "local-abort-key",
        model: "abort-harness-model"
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
    await sendMessage(chatWindow, "请开始一段长回复，我会马上停止。");
    await chatWindow.locator(".message-list .assistant.draft", { hasText: "开始长回复。" }).waitFor({ timeout: 10_000 });
    const stopButton = chatWindow.getByTestId("chat-stop-button");
    if (!(await stopButton.isEnabled())) {
      throw new Error("Stop button was not clickable while provider response was streaming");
    }
    await stopButton.click();
    await chatWindow.locator('[data-testid="chat-status"][data-status-tone="stopped"], [data-testid="chat-status"][data-status-tone="waiting"]').waitFor({ timeout: 10_000 });
    await waitForRequestClose();
    const stopState = await chatWindow.evaluate(() => ({
      status: document.querySelector(".status-badge, .status-pill")?.textContent?.trim() ?? "",
      error: document.querySelector(".chat-error-box, .chat-error")?.textContent?.trim() ?? "",
      assistantDraftCount: document.querySelectorAll(".message-list .message-item.assistant.draft").length,
      assistantFinalCount: document.querySelectorAll(".message-list .message-item.assistant:not(.draft)").length
    }));
    if (stopState.error.length > 0) {
      throw new Error(`Stop surfaced an error in chat UI: ${stopState.error}`);
    }
    if (stopState.assistantDraftCount !== 0 || stopState.assistantFinalCount !== 0) {
      throw new Error(`Stop left an old assistant reply in chat UI: ${JSON.stringify(stopState)}`);
    }
    console.log(
      JSON.stringify(
        {
          ok: true,
          requestCount,
          providerRequestAborted: requestClosed,
          stopButtonClickable: true,
          stopStatus: stopState.status,
          stoppedWithoutOldAssistantReply: true
        },
        null,
        2
      )
    );
  } finally {
    await app.close();
  }
} finally {
  response?.destroy();
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

async function waitForRoleWindow(app: ElectronApplication, roleName: "chat"): Promise<Page> {
  const started = Date.now();
  while (Date.now() - started < 5_000) {
    for (const page of app.windows()) {
      const role = await page.evaluate(() => new URLSearchParams(window.location.search).get("window")).catch(() => null);
      if (role === roleName) {
        await page.waitForSelector(".chat-shell");
        return page;
      }
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`Timed out waiting for ${roleName} window`);
}

async function sendMessage(page: Page, text: string): Promise<void> {
  await page.getByTestId("chat-message-input").fill(text);
  await page.getByTestId("chat-send-button").click();
}

async function waitForRequestClose(): Promise<void> {
  const started = Date.now();
  while (Date.now() - started < 10_000) {
    if (requestClosed) {
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error("Provider request did not close after Stop");
}
