import { _electron as electron, type ElectronApplication, type Locator, type Page } from "playwright";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { defaultGreyfieldConfig } from "@greyfield/persistence/config-schema";
import { getElectronExecutablePath } from "./electron-install";

const workspaceRoot = fileURLToPath(new URL("../../..", import.meta.url));
const desktopRoot = join(workspaceRoot, "apps", "desktop");
const executablePath = await getElectronExecutablePath(desktopRoot);
const tempDir = await mkdtemp(join(tmpdir(), "greyfield-electron-memory-control-"));
const configPath = join(tempDir, "greyfield.config.json");
const sessionPath = join(tempDir, "sessions", "desktop-main-session.jsonl");
const summaryPath = join(tempDir, "memory", "summary-segments.jsonl");
const artifactDir = join(workspaceRoot, ".cache", "greyfield-memory-control", "latest");
const settingsScreenshotPath = join(artifactDir, "settings-memory-paused.png");
const otherRoleSummaryText = "Other role summary must stay isolated.";

let app: ElectronApplication | undefined;
try {
  await mkdir(join(tempDir, "memory"), { recursive: true });
  await mkdir(artifactDir, { recursive: true });
  await writeFile(
    configPath,
    `${JSON.stringify(
      {
        ...defaultGreyfieldConfig,
        ui: {
          ...defaultGreyfieldConfig.ui,
          locale: "en-US"
        },
        memory: {
          ...defaultGreyfieldConfig.memory,
          llmAtomExtractionEnabled: true
        }
      },
      null,
      2
    )}\n`,
    "utf8"
  );
  await writeFile(
    summaryPath,
    `${JSON.stringify({
      id: "summary-other-role",
      threadId: "desktop:characters-other-role-yaml",
      sessionId: "other-role-session",
      summary: otherRoleSummaryText,
      recallCues: ["isolated-other-role"],
      sourceTurnIds: [],
      sourceTurns: [],
      createdAt: "2026-06-28T00:00:00.000Z",
      disabled: false,
      updatedAt: "2026-06-28T00:00:00.000Z"
    })}\n`,
    "utf8"
  );

  app = await launchApp();
  const chat = await waitForRoleWindow(app, "chat");
  await attachRuntimeEventProbe(chat);

  await sendMessageAndWaitForNextAssistant(chat, "第一轮：我喜欢 Hiyori。");
  await sendMessageAndWaitForNextAssistant(chat, "第二轮：记住 Live2D 模型偏好。");
  await sendMessageAndWaitForNextAssistant(chat, "第三轮：继续。");
  await sendMessageAndWaitForNextAssistant(chat, "Hiyori 还是默认模型吗？");

  const sessionJsonl = await waitForFileContaining(sessionPath, [
    "第一轮：我喜欢 Hiyori。",
    "Hiyori 还是默认模型吗？"
  ]);
  const summaryJsonl = await readFile(summaryPath, "utf8");
  assertSummaryMemoryPaused(summaryJsonl);
  assertNoMemoryRuntimeEvents(await getRuntimeEvents(chat));

  const settings = await waitForRoleWindow(app, "settings");
  await settings.waitForSelector(".greyfield-shell");
  const memorySection = settings.getByLabel("How memory works", { exact: true });
  await memorySection.waitFor();
  await assertPausedMemorySettings(memorySection);
  await settings.screenshot({ path: settingsScreenshotPath, fullPage: true });

  console.log(
    JSON.stringify(
      {
        ok: true,
        sessionLines: sessionJsonl.trim().split(/\r?\n/).length,
        summaryLines: summaryJsonl.trim().split(/\r?\n/).length,
        summaryMemoryPaused: true,
        memoryRuntimeEventsAbsent: true,
        settingsMemoryPaused: true,
        settingsScreenshotPath
      },
      null,
      2
    )
  );
} finally {
  await app?.close().catch(() => undefined);
  await rm(tempDir, { recursive: true, force: true });
}

async function launchApp(): Promise<ElectronApplication> {
  const output: string[] = [];
  const launched = await electron.launch({
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
  launched.process().stdout?.on("data", (chunk) => output.push(String(chunk)));
  launched.process().stderr?.on("data", (chunk) => output.push(String(chunk)));
  try {
    await launched.firstWindow({ timeout: 10_000 });
    return launched;
  } catch (error) {
    const urls = launched.windows().map((page) => page.url());
    const spawnargs = launched.process().spawnargs;
    await launched.close().catch(() => undefined);
    throw new Error(
      `Timed out waiting for first Electron window; spawnargs=${JSON.stringify(spawnargs)}; urls=${JSON.stringify(urls)}; output=${output.join("").slice(-4000)}; cause=${String(error)}`
    );
  }
}

async function waitForRoleWindow(app: ElectronApplication, roleName: "chat" | "settings"): Promise<Page> {
  const started = Date.now();
  while (Date.now() - started < 5_000) {
    for (const page of app.windows()) {
      const role = await page.evaluate(() => new URLSearchParams(window.location.search).get("window")).catch(() => null);
      if (role === roleName) {
        await page.waitForSelector(roleName === "chat" ? ".chat-shell" : ".greyfield-shell");
        return page;
      }
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`Timed out waiting for ${roleName} window`);
}

async function attachRuntimeEventProbe(page: Page): Promise<void> {
  await page.evaluate(() => {
    const target = window as typeof window & { __greyfieldRuntimeEvents?: unknown[] };
    target.__greyfieldRuntimeEvents = [];
    window.greyfield?.on("runtime:event", (event) => {
      target.__greyfieldRuntimeEvents?.push(event);
    });
  });
}

async function getRuntimeEvents(page: Page): Promise<unknown[]> {
  return page.evaluate(() => {
    return (window as typeof window & { __greyfieldRuntimeEvents?: unknown[] }).__greyfieldRuntimeEvents ?? [];
  });
}

async function sendMessageAndWaitForNextAssistant(page: Page, text: string): Promise<void> {
  const previousCount = await page.locator(".message-list .assistant:not(.draft)").count();
  await page.getByTestId("chat-message-input").fill(text);
  await page.getByTestId("chat-send-button").click();
  await page.waitForFunction(
    (count) => document.querySelectorAll(".message-list .assistant:not(.draft)").length > count,
    previousCount,
    { timeout: 10_000 }
  );
}

async function waitForFileContaining(path: string, needles: string[]): Promise<string> {
  const started = Date.now();
  let content = "";
  while (Date.now() - started < 8_000) {
    content = await readFile(path, "utf8").catch(() => "");
    if (needles.every((needle) => content.includes(needle))) {
      return content;
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`Timed out waiting for ${path} to contain ${JSON.stringify(needles)}; content=${content}`);
}

async function assertPausedMemorySettings(memorySection: Locator): Promise<void> {
  const toggle = memorySection.getByLabel("Memory system");
  await toggle.waitFor();
  if (!(await toggle.isDisabled())) {
    throw new Error("Memory system toggle must be disabled while memory is in development");
  }
  if (await toggle.isChecked()) {
    throw new Error("Memory system toggle must stay unchecked while memory is in development");
  }
  await memorySection.locator(".memory-extraction-status--disabled", { hasText: "In development" }).waitFor();
  await memorySection.locator(".memory-extraction-status--disabled", { hasText: "Memory is paused" }).waitFor();
  const text = (await memorySection.textContent()) ?? "";
  if (/\b(accept|reject|candidate|pending)\b/i.test(text)) {
    throw new Error(`Paused memory settings exposed manual candidate review language: ${text}`);
  }
}

function assertSummaryMemoryPaused(summaryJsonl: string): void {
  if (!summaryJsonl.includes(otherRoleSummaryText)) {
    throw new Error(`Preseeded other-role summary disappeared: ${summaryJsonl}`);
  }
  for (const forbidden of ["summary-1", "desktop-main-session-1", "第一轮：我喜欢 Hiyori。"]) {
    if (summaryJsonl.includes(forbidden)) {
      throw new Error(`Paused memory unexpectedly wrote a current-role summary containing ${forbidden}: ${summaryJsonl}`);
    }
  }
}

function assertNoMemoryRuntimeEvents(events: unknown[]): void {
  const memoryEvents = events.filter((event) => {
    return (
      typeof event === "object" &&
      event !== null &&
      "type" in event &&
      typeof event.type === "string" &&
      event.type.startsWith("memory.")
    );
  });
  if (memoryEvents.length > 0) {
    throw new Error(`Paused memory emitted runtime memory events: ${JSON.stringify(memoryEvents)}`);
  }
}
