import { _electron as electron, type ElectronApplication, type Page } from "playwright";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { defaultGreyfieldConfig } from "@greyfield/persistence/config-schema";
import { getElectronExecutablePath } from "./electron-install";

const workspaceRoot = fileURLToPath(new URL("../../..", import.meta.url));
const desktopRoot = join(workspaceRoot, "apps", "desktop");
const executablePath = await getElectronExecutablePath(desktopRoot);
const tempDir = await mkdtemp(join(tmpdir(), "greyfield-electron-memory-"));
const configPath = join(tempDir, "greyfield.config.json");
const artifactDir = join(workspaceRoot, ".cache", "greyfield-memory-summary", "latest");
const settingsScreenshotPath = join(artifactDir, "settings-memory.png");

await writeFile(configPath, `${JSON.stringify(defaultGreyfieldConfig, null, 2)}\n`, "utf8");
await mkdir(artifactDir, { recursive: true });

const app = await electron.launch({
  executablePath,
  cwd: desktopRoot,
  args: [join(desktopRoot, "dist-main", "index.mjs")],
  env: {
    ...process.env,
    GREYFIELD_CONFIG_PATH: configPath,
    GREYFIELD_PROJECT_ROOT: workspaceRoot,
    GREYFIELD_USER_DATA_PATH: tempDir,
    GREYFIELD_RECENT_TURN_LIMIT: "2",
    GREYFIELD_SUMMARY_BATCH_TURN_LIMIT: "4",
    GREYFIELD_SUMMARY_MIN_TURNS: "4"
  }
});

try {
  await app.firstWindow({ timeout: 10_000 });
  const chat = await waitForRoleWindow(app, "chat");
  await chat.waitForSelector(".chat-shell");
  await chat.evaluate(() => {
    const events: unknown[] = [];
    window.greyfield?.on("runtime:event", (event) => {
      events.push(event);
    });
    (window as typeof window & { __greyfieldMemoryEvents?: unknown[] }).__greyfieldMemoryEvents = events;
  });

  await sendMessage(chat, "第一轮：我喜欢 Hiyori。");
  await waitForAssistantCount(chat, 1);
  await sendMessage(chat, "第二轮：记住 Live2D 模型偏好。");
  await waitForAssistantCount(chat, 2);
  await sendMessage(chat, "第三轮：继续。");
  await waitForAssistantCount(chat, 3);
  await sendMessage(chat, "Hiyori 还是默认模型吗？");
  await waitForAssistantCount(chat, 4);

  const sessionJsonl = await waitForFileContaining(join(tempDir, "sessions", "desktop-main-session.jsonl"), [
    "第一轮：我喜欢 Hiyori。",
    "Hiyori 还是默认模型吗？"
  ]);
  const summaryJsonl = await waitForFileContaining(join(tempDir, "memory", "summary-segments.jsonl"), [
    "第一轮：我喜欢 Hiyori。",
    "desktop-main-session-1",
    "desktop-main-session-4"
  ]);
  const events = await chat.evaluate(() => {
    return (window as typeof window & { __greyfieldMemoryEvents?: unknown[] }).__greyfieldMemoryEvents ?? [];
  });
  const summaryCreated = events.some((event) => {
    return (
      typeof event === "object" &&
      event !== null &&
      "type" in event &&
      event.type === "memory.summary.created"
    );
  });
  if (!summaryCreated) {
    throw new Error(`Missing memory.summary.created runtime event: ${JSON.stringify(events)}`);
  }
  const recallContext = events.some((event) => {
    return (
      typeof event === "object" &&
      event !== null &&
      "type" in event &&
      event.type === "memory.recall.context"
    );
  });
  if (!recallContext) {
    throw new Error(`Missing memory.recall.context runtime event: ${JSON.stringify(events)}`);
  }

  const settings = await waitForRoleWindow(app, "settings");
  await settings.waitForSelector(".greyfield-shell");
  await settings.getByRole("button", { name: "Refresh memory" }).click();
  await settings.locator(".memory-debug", { hasText: "Summaries 1" }).waitFor();
  await settings.locator(".memory-debug", { hasText: "desktop-main-session-1" }).waitFor();
  await settings.locator(".memory-debug", { hasText: "Last recall" }).waitFor();
  await settings.locator(".memory-debug", { hasText: "cue:hiyori" }).waitFor();
  await settings.screenshot({ path: settingsScreenshotPath, fullPage: true });

  console.log(
    JSON.stringify(
      {
        ok: true,
        sessionLines: sessionJsonl.trim().split(/\r?\n/).length,
        summaryLines: summaryJsonl.trim().split(/\r?\n/).length,
        summaryCreated,
        recallContext,
        settingsMemoryVisible: true,
        settingsScreenshotPath,
        summaryIncludesSourceTurns: true
      },
      null,
      2
    )
  );
} finally {
  await app.close();
  await rm(tempDir, { recursive: true, force: true });
}

async function waitForRoleWindow(app: ElectronApplication, roleName: "chat" | "settings"): Promise<Page> {
  const started = Date.now();
  while (Date.now() - started < 5_000) {
    for (const page of app.windows()) {
      const role = await page.evaluate(() => new URLSearchParams(window.location.search).get("window")).catch(() => null);
      if (role === roleName) {
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

async function waitForAssistantCount(page: Page, expected: number): Promise<void> {
  await page.waitForFunction(
    (count) => document.querySelectorAll(".message-list .assistant:not(.draft)").length >= count,
    expected,
    { timeout: 10_000 }
  );
}

async function waitForFileContaining(path: string, expectedTexts: string[]): Promise<string> {
  const started = Date.now();
  let lastContent = "";
  while (Date.now() - started < 5_000) {
    lastContent = await readFile(path, "utf8").catch(() => "");
    if (expectedTexts.every((text) => lastContent.includes(text))) {
      return lastContent;
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`Timed out waiting for ${path} to contain ${JSON.stringify(expectedTexts)}; content=${lastContent}`);
}
