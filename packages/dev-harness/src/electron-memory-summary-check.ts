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
const tempDir = await mkdtemp(join(tmpdir(), "greyfield-electron-memory-"));
const configPath = join(tempDir, "greyfield.config.json");
const sessionPath = join(tempDir, "sessions", "desktop-main-session.jsonl");
const summaryPath = join(tempDir, "memory", "summary-segments.jsonl");
const artifactDir = join(workspaceRoot, ".cache", "greyfield-memory-summary", "latest");
const settingsSourceScreenshotPath = join(artifactDir, "settings-memory-source-passages.png");
const settingsScreenshotPath = join(artifactDir, "settings-memory.png");
const providerSecret = "memory-library-provider-secret";
const summaryBoundedTail = "SUMMARY_SOURCE_PASSAGE_BOUNDARY_TAIL_SHOULD_NOT_RENDER";

let app: ElectronApplication | undefined;
try {
  await writeFile(
    configPath,
    `${JSON.stringify(
      {
        ...defaultGreyfieldConfig,
        provider: {
          ...defaultGreyfieldConfig.provider,
          apiKey: providerSecret
        }
      },
      null,
      2
    )}\n`,
    "utf8"
  );
  await mkdir(artifactDir, { recursive: true });

  app = await electron.launch({
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

  const sessionJsonl = await waitForFileContaining(sessionPath, [
    "第一轮：我喜欢 Hiyori。",
    "Hiyori 还是默认模型吗？"
  ]);
  const summaryJsonl = await waitForFileContaining(summaryPath, [
    "第一轮：我喜欢 Hiyori。",
    "desktop-main-session-1",
    "desktop-main-session-4"
  ]);
  await appendSourcePassageTail("desktop-main-session-1");
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
  const memoryLibrary = settings.locator('[data-harness="settings-memory-library"]');
  await memoryLibrary.waitFor();
  await openAdvancedDetails(memoryLibrary);
  await memoryLibrary.locator(".memory-library__lane", { hasText: "Summary" }).waitFor();
  await memoryLibrary.locator(".memory-library__lane", { hasText: "Facts" }).waitFor();
  await memoryLibrary.locator(".memory-library__lane", { hasText: "Preferences" }).waitFor();
  await memoryLibrary.locator(".memory-library__lane", { hasText: "Opinions" }).waitFor();
  await memoryLibrary.locator(".memory-library__lane", { hasText: "Relationships" }).waitFor();
  await memoryLibrary.locator(".memory-library__lane", { hasText: "Scenes" }).waitFor();
  await memoryLibrary.locator(".memory-library__stats", { hasText: "Enabled" }).waitFor();
  const summarySource = await openSourcePassage(memoryLibrary, "summary-1");
  await summarySource.getByText("Source passage").first().waitFor();
  await summarySource.getByText("From you").first().waitFor();
  await summarySource.getByText("Saved locally").first().waitFor();
  await summarySource.locator(".memory-library__source-row p", { hasText: "第一轮：我喜欢 Hiyori。" }).waitFor();
  await assertSourceStateText(summarySource, {
    includes: ["From you", "Saved from conversation", "第一轮：我喜欢 Hiyori。"],
    excludes: ["Unknown role", "desktop-main-session-1", "Turn", summaryBoundedTail]
  });
  await memoryLibrary.locator(".memory-library__block--recall", { hasText: "Last recalled memory" }).waitFor();
  await memoryLibrary.locator(".memory-library__block--recall", { hasText: 'Matched recall cue "hiyori"' }).waitFor();
  const memoryLibraryText = ((await memoryLibrary.textContent()) ?? "").toLowerCase();
  for (const forbidden of ["pending", "candidate", "approval"]) {
    if (memoryLibraryText.includes(forbidden)) {
      throw new Error(`Memory Library exposed forbidden ${forbidden} UI text: ${memoryLibraryText}`);
    }
  }
  if (memoryLibraryText.includes(providerSecret)) {
    throw new Error("Memory Library rendered the configured provider API key.");
  }
  await settings.screenshot({ path: settingsSourceScreenshotPath, fullPage: true });

  await memorySummaryText(memoryLibrary, "summary-1").fill("Edited memory: User prefers Hiyori and Sakura.");
  await memorySummaryCues(memoryLibrary, "summary-1").fill("edited-hiyori, hiyori, sakura");
  await memorySummarySave(memoryLibrary, "summary-1").click();
  await memoryLibrary.getByText("Memory summary-1 saved.").waitFor();
  const editedSummaryJsonl = await waitForFileContaining(summaryPath, [
    "Edited memory: User prefers Hiyori and Sakura.",
    "edited-hiyori"
  ]);

  await settings.getByRole("button", { name: "Export library" }).click();
  await settings.getByLabel("Memory library export").waitFor();
  const exportedMemoryText = await settings.getByLabel("Memory library export").inputValue();
  if (!exportedMemoryText.includes("Edited memory: User prefers Hiyori and Sakura.") || !exportedMemoryText.includes("第一轮：我喜欢 Hiyori。")) {
    throw new Error(`Memory export missed edited summary or raw turn: ${exportedMemoryText}`);
  }
  if (exportedMemoryText.includes(providerSecret)) {
    throw new Error("Memory export included the configured provider API key.");
  }

  await memorySummaryToggle(memoryLibrary, "summary-1").click();
  await memoryLibrary.getByText("Memory summary-1 disabled.").waitFor();
  await waitForFileContaining(summaryPath, ['"id":"summary-1"', '"disabled":true']);

  await sendMessage(chat, "edited-hiyori 这个记忆还在吗？");
  await waitForAssistantCount(chat, 5);
  const disabledRecall = await getLatestMemoryRecallEvent(chat);
  if (!disabledRecall) {
    throw new Error("Missing memory.recall.context event after disabling summary-1");
  }
  if (disabledRecall.context.items.some((item) => item.id === "summary-1")) {
    throw new Error(`Disabled summary-1 was still recalled: ${JSON.stringify(disabledRecall.context)}`);
  }
  if (!disabledRecall.context.skipped.some((item) => item.id === "summary-1" && item.reason === "disabled")) {
    throw new Error(`Disabled summary-1 was not reported as skipped: ${JSON.stringify(disabledRecall.context)}`);
  }

  await memorySummaryDelete(memoryLibrary, "summary-1").click();
  await memoryLibrary
    .getByText("Memory summary-1 deleted. Remembered source evidence was hidden from recall, source views, and exports.")
    .waitFor();
  const summaryAfterDelete = await waitForFileNotContaining(summaryPath, '"id":"summary-1"');
  const sessionAfterDelete = await waitForFileContaining(sessionPath, ["第一轮：我喜欢 Hiyori。"]);

  await sendMessage(chat, "清空前再生成一条摘要。");
  await waitForAssistantCount(chat, 6);
  await waitForFileContaining(summaryPath, ['"id":"summary-2"']);
  await settings.getByRole("button", { name: "Refresh memory" }).click();
  await memorySummaryCard(memoryLibrary, "summary-2").waitFor();
  await settings.getByRole("button", { name: "Clear summary memory" }).click();
  await memoryLibrary
    .getByText("Cleared 1 summary memory. Remembered source evidence was hidden from recall, source views, and exports.")
    .waitFor();
  await waitForFileNotContaining(summaryPath, '"id":"summary-2"');
  await settings.screenshot({ path: settingsScreenshotPath, fullPage: true });

  console.log(
    JSON.stringify(
      {
        ok: true,
        sessionLines: sessionJsonl.trim().split(/\r?\n/).length,
        summaryLines: summaryJsonl.trim().split(/\r?\n/).length,
        editedSummaryLines: editedSummaryJsonl.trim().split(/\r?\n/).length,
        summaryLinesAfterDelete: summaryAfterDelete.trim().length > 0 ? summaryAfterDelete.trim().split(/\r?\n/).length : 0,
        sessionLinesAfterDelete: sessionAfterDelete.trim().split(/\r?\n/).length,
        summaryCreated,
        recallContext,
        memoryEditVisible: true,
        memoryExportVisible: true,
        disabledMemorySkipped: true,
        deletedMemoryErasedRawSourceEvidence: true,
        clearedSummaryMemory: true,
        noPendingCandidateApprovalUi: true,
        memoryExportExcludedProviderSecret: true,
        settingsMemoryVisible: true,
        settingsSourceScreenshotPath,
        settingsScreenshotPath,
        summaryIncludesSourceTurns: true
      },
      null,
      2
    )
  );
} finally {
  await app?.close().catch(() => undefined);
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

async function openSourcePassage(memoryLibrary: Locator, id: string): Promise<Locator> {
  const card = memorySummaryCard(memoryLibrary, id);
  await card.locator('[data-harness="memory-source-open"]').click();
  const source = memoryLibrary.locator('[data-harness="memory-source-drilldown"]');
  await source.waitFor();
  return source;
}

async function openAdvancedDetails(memoryLibrary: Locator): Promise<void> {
  const details = memoryLibrary.locator('[data-harness="memory-advanced-details"]');
  await details.waitFor();
  const open = await details.evaluate((element) => element instanceof HTMLDetailsElement && element.open);
  if (!open) {
    await details.locator("summary").click();
  }
}

function memorySummaryCard(memoryLibrary: Locator, id: string): Locator {
  return memoryLibrary.locator(`[data-harness="memory-summary-card"][data-memory-id="${id}"]`);
}

function memorySummaryText(memoryLibrary: Locator, id: string): Locator {
  return memoryLibrary.locator(`[data-harness="memory-summary-text"][data-memory-id="${id}"]`);
}

function memorySummaryCues(memoryLibrary: Locator, id: string): Locator {
  return memoryLibrary.locator(`[data-harness="memory-summary-cues"][data-memory-id="${id}"]`);
}

function memorySummarySave(memoryLibrary: Locator, id: string): Locator {
  return memoryLibrary.locator(`[data-harness="memory-summary-save"][data-memory-id="${id}"]`);
}

function memorySummaryToggle(memoryLibrary: Locator, id: string): Locator {
  return memoryLibrary.locator(`[data-harness="memory-summary-toggle"][data-memory-id="${id}"]`);
}

function memorySummaryDelete(memoryLibrary: Locator, id: string): Locator {
  return memoryLibrary.locator(`[data-harness="memory-summary-delete"][data-memory-id="${id}"]`);
}

async function assertSourceStateText(
  source: Locator,
  expected: { includes: string[]; excludes: string[] }
): Promise<void> {
  const text = await source.innerText();
  for (const value of expected.includes) {
    if (!text.includes(value)) {
      throw new Error(`Source state missed ${value}: ${text}`);
    }
  }
  for (const value of expected.excludes) {
    if (text.includes(value)) {
      throw new Error(`Source state included forbidden ${value}: ${text}`);
    }
  }
}

async function sendMessage(page: Page, text: string): Promise<void> {
  await page.getByTestId("chat-message-input").fill(text);
  await page.getByTestId("chat-send-button").click();
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

async function waitForFileNotContaining(path: string, forbiddenText: string): Promise<string> {
  const started = Date.now();
  let lastContent = "";
  while (Date.now() - started < 5_000) {
    lastContent = await readFile(path, "utf8").catch(() => "");
    if (!lastContent.includes(forbiddenText)) {
      return lastContent;
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`Timed out waiting for ${path} to stop containing ${forbiddenText}; content=${lastContent}`);
}

async function appendSourcePassageTail(turnId: string): Promise<void> {
  const raw = await readFile(sessionPath, "utf8");
  const turns = raw
    .split(/\r?\n/)
    .filter(Boolean)
    .map((line) => JSON.parse(line) as { id: string; content: string });
  const next = turns.map((turn) =>
    turn.id === turnId
      ? {
          ...turn,
          content: `${turn.content}${" 这是一段用于 source passage 截断看护的普通内容。".repeat(20)}${summaryBoundedTail}`
        }
      : turn
  );
  await writeFile(sessionPath, `${next.map((turn) => JSON.stringify(turn)).join("\n")}\n`, "utf8");
}

async function getLatestMemoryRecallEvent(page: Page): Promise<
  | {
      context: {
        items: Array<{ id: string }>;
        skipped: Array<{ id: string; reason: string }>;
      };
    }
  | undefined
> {
  const events = await page.evaluate(() => {
    return (window as typeof window & { __greyfieldMemoryEvents?: unknown[] }).__greyfieldMemoryEvents ?? [];
  });
  return events
    .filter((event): event is { type: "memory.recall.context"; context: { items: Array<{ id: string }>; skipped: Array<{ id: string; reason: string }> } } => {
      return typeof event === "object" && event !== null && "type" in event && event.type === "memory.recall.context";
    })
    .at(-1);
}
