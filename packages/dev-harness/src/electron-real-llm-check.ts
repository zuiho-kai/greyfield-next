import { _electron as electron, type ElectronApplication, type Page } from "playwright";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { defaultGreyfieldConfig } from "@greyfield/persistence/config-schema";
import { readRealProviderEnv, redactRealProviderConfig } from "./real-provider-env";

const workspaceRoot = fileURLToPath(new URL("../../..", import.meta.url));
const desktopRoot = join(workspaceRoot, "apps", "desktop");
const tempDir = await mkdtemp(join(tmpdir(), "greyfield-electron-real-llm-"));
const configPath = join(tempDir, "greyfield.config.json");
const provider = readRealProviderEnv(process.env);

await writeFile(
  configPath,
  `${JSON.stringify(
    {
      ...defaultGreyfieldConfig,
      provider: {
        ...defaultGreyfieldConfig.provider,
        llm: "openai-compatible",
        baseUrl: provider.baseUrl,
        apiKey: provider.apiKey,
        model: provider.model
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
    await sendMessage(chatWindow, "请只回复：灰场真链路可用");
    await chatWindow.locator(".message-list .assistant, .message-list .assistant.draft").first().waitFor({ timeout: 30_000 });
    const firstAssistantText = await waitForAssistantText(chatWindow);
    await waitForSessionJsonl(["请只回复：灰场真链路可用", firstAssistantText], 30_000);

    await sendMessage(chatWindow, "请写一段较长的中文说明，至少八句，用于测试停止按钮。");
    await chatWindow.locator(".message-list .assistant.draft").waitFor({ timeout: 30_000 });
    await chatWindow.getByRole("button", { name: "Stop" }).click();
    await chatWindow.locator(".status-pill", { hasText: "Stopped" }).waitFor({ timeout: 10_000 });
    const stopState = await chatWindow.evaluate(() => ({
      status: document.querySelector(".status-pill")?.textContent?.trim() ?? "",
      error: document.querySelector(".chat-error")?.textContent?.trim() ?? ""
    }));
    if (stopState.error.length > 0) {
      throw new Error(`Stop surfaced an error in chat UI: ${stopState.error}`);
    }

    const sessionJsonl = await readFile(join(tempDir, "sessions", "desktop-main-session.jsonl"), "utf8");
    console.log(
      JSON.stringify(
        {
          ok: true,
          provider: redactRealProviderConfig(provider),
          firstAssistantText: firstAssistantText.slice(0, 80),
          persistentSessionWorked: true,
          persistedSessionLines: sessionJsonl.trim().split(/\r?\n/).length,
          stopWorked: true,
          stopStatus: stopState.status
        },
        null,
        2
      )
    );
  } finally {
    await app.close();
  }
} finally {
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
  await page.getByLabel("Message").fill(text);
  await page.getByRole("button", { name: "Send" }).click();
}

async function waitForAssistantText(page: Page): Promise<string> {
  const started = Date.now();
  while (Date.now() - started < 30_000) {
    const text = await page
      .locator(".message-list .assistant")
      .last()
      .textContent()
      .catch(() => "");
    const trimmed = text?.trim() ?? "";
    if (trimmed.length > 0) {
      return trimmed;
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error("Timed out waiting for assistant text");
}

async function waitForSessionJsonl(expectedTexts: string[], timeoutMs: number): Promise<string> {
  const path = join(tempDir, "sessions", "desktop-main-session.jsonl");
  const started = Date.now();
  let lastJsonl = "";
  while (Date.now() - started < timeoutMs) {
    lastJsonl = await readFile(path, "utf8").catch(() => "");
    if (expectedTexts.every((text) => lastJsonl.includes(text))) {
      return lastJsonl;
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`Real LLM session JSONL did not persist the expected chat turn: ${lastJsonl}`);
}
