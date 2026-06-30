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
const settingsSourceScreenshotPath = join(artifactDir, "settings-memory-source-passages.png");
const settingsReloadedScreenshotPath = join(artifactDir, "settings-memory-reloaded.png");
const settingsScreenshotPath = join(artifactDir, "settings-memory-after-clear.png");
const providerSecret = "memory-library-provider-secret";
const summaryBoundedTail = "SUMMARY_SOURCE_PASSAGE_BOUNDARY_TAIL_SHOULD_NOT_RENDER";
const currentRoleCharacterFile = "characters/greyfield.yaml";
const currentThreadId = "desktop:characters-greyfield-yaml";
const otherRoleCharacterFile = "characters/other-role.yaml";
const otherThreadId = "desktop:characters-other-role-yaml";
const otherRoleSummaryText = "Other role summary must stay isolated.";
const memoryLibrarySelector = '[data-harness="settings-memory-library"]';
const memorySourceDrilldownSelector = '[data-harness="memory-source-drilldown"]';

let app: ElectronApplication | undefined;
try {
  await mkdir(join(tempDir, "memory"), { recursive: true });
  await mkdir(artifactDir, { recursive: true });
  await writeFile(
    configPath,
    `${JSON.stringify(
      {
        ...defaultGreyfieldConfig,
        characterFile: currentRoleCharacterFile,
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
  await writeFile(
    summaryPath,
    `${JSON.stringify({
      id: "summary-other-role",
      threadId: otherThreadId,
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
  let chat = await waitForRoleWindow(app, "chat");
  await attachMemoryEventProbe(chat);

  await sendMessageAndWaitForNextAssistant(chat, "第一轮：我喜欢 Hiyori。");
  await sendMessageAndWaitForNextAssistant(chat, "第二轮：记住 Live2D 模型偏好。");
  await sendMessageAndWaitForNextAssistant(chat, "第三轮：继续。");
  await sendMessageAndWaitForNextAssistant(chat, "Hiyori 还是默认模型吗？");

  const sessionJsonl = await waitForFileContaining(sessionPath, [
    "第一轮：我喜欢 Hiyori。",
    "Hiyori 还是默认模型吗？"
  ]);
  const summaryJsonl = await waitForFileContaining(summaryPath, [
    "第一轮：我喜欢 Hiyori。",
    "desktop-main-session-1",
    "desktop-main-session-4",
    otherRoleSummaryText
  ]);
  await appendSourcePassageTail("desktop-main-session-1");
  const events = await getMemoryEvents(chat);
  const summaryCreated = events.some(isSummaryCreatedEvent);
  if (!summaryCreated) {
    throw new Error(`Missing memory.summary.created runtime event: ${JSON.stringify(events)}`);
  }
  const recallContext = events.some(isMemoryRecallEvent);
  if (!recallContext) {
    throw new Error(`Missing memory.recall.context runtime event: ${JSON.stringify(events)}`);
  }

  let settings = await waitForRoleWindow(app, "settings");
  await settings.waitForSelector(".greyfield-shell");
  await settings.getByRole("button", { name: "Refresh memory" }).click();
  let memoryLibrary = settings.locator(memoryLibrarySelector);
  await waitForCurrentSummary(memoryLibrary);
  await assertMemoryPrivacyCopy(memoryLibrary);
  await assertOtherRoleSummaryHidden(memoryLibrary);
  await memoryLibrary.locator(".memory-library__lane", { hasText: "Summary" }).waitFor();
  await memoryLibrary.locator(".memory-library__lane", { hasText: "Facts" }).waitFor();
  await memoryLibrary.locator(".memory-library__lane", { hasText: "Preferences" }).waitFor();
  await memoryLibrary.locator(".memory-library__lane", { hasText: "Opinions" }).waitFor();
  await memoryLibrary.locator(".memory-library__lane", { hasText: "Relationships" }).waitFor();
  await memoryLibrary.locator(".memory-library__lane", { hasText: "Scenes" }).waitFor();
  await memoryLibrary.locator(".memory-library__stats", { hasText: "Enabled" }).waitFor();
  await memoryLibrary.locator(".memory-library__source-link", { hasText: "source passages ready" }).waitFor();
  const summarySource = await openSourceDrilldown(memoryLibrary, "summary-1");
  await summarySource.getByText("From you").first().waitFor();
  await summarySource.getByText("Saved locally").first().waitFor();
  await summarySource.locator(".memory-library__source-row p", { hasText: "第一轮：我喜欢 Hiyori。" }).waitFor();
  await assertSourceStateText(summarySource, {
    includes: ["From you", "Saved from conversation", "第一轮：我喜欢 Hiyori。"],
    excludes: ["Unknown role", "desktop-main-session-1", "Turn", summaryBoundedTail]
  });
  await assertNoHorizontalOverflow(settings, memorySourceDrilldownSelector);
  await settings.screenshot({ path: settingsSourceScreenshotPath, fullPage: true });
  await closeSourceDrilldown(memoryLibrary);
  await memoryLibrary.locator(".memory-library__block--recall", { hasText: "Last recalled memory" }).waitFor();
  await memoryLibrary.locator(".memory-library__block--recall", { hasText: 'Matched recall cue "hiyori"' }).waitFor();
  await assertMemoryLibraryTextSafe(memoryLibrary);

  await memorySummaryText(memoryLibrary, "summary-1").fill("Edited memory: User prefers Hiyori and Sakura.");
  await memorySummaryCues(memoryLibrary, "summary-1").fill("edited-hiyori, hiyori, sakura");
  await memorySummarySave(memoryLibrary, "summary-1").click();
  await memoryLibrary.getByText("Memory summary-1 saved.").waitFor();
  const editedSummaryJsonl = await waitForFileContaining(summaryPath, [
    "Edited memory: User prefers Hiyori and Sakura.",
    "edited-hiyori"
  ]);

  await memoryLibrary.locator('[data-harness="memory-library-export"]').click();
  await settings.locator('[data-harness="memory-library-export-text"]').waitFor();
  const exportedMemoryText = await settings.locator('[data-harness="memory-library-export-text"]').inputValue();
  if (
    !exportedMemoryText.includes("Edited memory: User prefers Hiyori and Sakura.") ||
    !exportedMemoryText.includes("第一轮：我喜欢 Hiyori。")
  ) {
    throw new Error(`Memory export missed edited summary or raw turn: ${exportedMemoryText}`);
  }
  if (exportedMemoryText.includes(providerSecret) || exportedMemoryText.includes(otherRoleSummaryText)) {
    throw new Error(`Memory export leaked a provider secret or other-role summary: ${exportedMemoryText}`);
  }

  await memorySummaryToggle(memoryLibrary, "summary-1").click();
  await memoryLibrary.getByText("Memory summary-1 disabled.").waitFor();
  await waitForFileContaining(summaryPath, ['"id":"summary-1"', '"disabled":true']);

  await resetMemoryEvents(chat);
  await sendMessageAndWaitForNextAssistant(chat, "edited-hiyori 这个记忆还在吗？");
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

  await memorySummaryToggle(memoryLibrary, "summary-1").click();
  await waitForFileContaining(summaryPath, ['"id":"summary-1"', '"disabled":false']);
  await resetMemoryEvents(chat);
  await sendMessageAndWaitForNextAssistant(chat, "edited-hiyori 重新启用后应该能想起吗？");
  const enabledRecall = await getLatestMemoryRecallEvent(chat);
  if (!enabledRecall?.context.items.some((item) => item.id === "summary-1")) {
    throw new Error(`Re-enabled summary-1 was not recalled: ${JSON.stringify(enabledRecall?.context)}`);
  }

  await app.close();
  app = await launchApp();
  chat = await waitForRoleWindow(app, "chat");
  await attachMemoryEventProbe(chat);
  settings = await waitForRoleWindow(app, "settings");
  await settings.waitForSelector(".greyfield-shell");
  await settings.getByRole("button", { name: "Refresh memory" }).click();
  memoryLibrary = settings.locator(memoryLibrarySelector);
  await waitForCurrentSummary(memoryLibrary);
  await memoryLibrary.getByText("Edited memory: User prefers Hiyori and Sakura.").waitFor();
  const reloadedCueValue = await memorySummaryCues(memoryLibrary, "summary-1").inputValue();
  if (reloadedCueValue !== "edited-hiyori, hiyori, sakura") {
    throw new Error(`Reloaded summary cues were not persisted: ${reloadedCueValue}`);
  }
  await assertMemoryPrivacyCopy(memoryLibrary);
  await assertOtherRoleSummaryHidden(memoryLibrary);
  await settings.screenshot({ path: settingsReloadedScreenshotPath, fullPage: true });

  await switchCharacter(settings, otherRoleCharacterFile);
  await memorySummaryCard(memoryLibrary, "summary-other-role").filter({ hasText: otherRoleSummaryText }).waitFor();
  if (((await memoryLibrary.textContent()) ?? "").includes("Edited memory: User prefers Hiyori and Sakura.")) {
    throw new Error("Role-B Memory Library rendered role-A summary.");
  }
  await switchCharacter(settings, currentRoleCharacterFile);
  await waitForCurrentSummary(memoryLibrary);
  await assertOtherRoleSummaryHidden(memoryLibrary);

  await memorySummaryDelete(memoryLibrary, "summary-1").click();
  await memoryLibrary
    .getByText("Memory summary-1 deleted. Remembered source evidence was hidden from recall, source views, and exports.")
    .waitFor();
  const summaryAfterDelete = await waitForFileNotContaining(summaryPath, '"id":"summary-1"');
  const sessionAfterDelete = await waitForFileContaining(sessionPath, ["第一轮：我喜欢 Hiyori。"]);
  await resetMemoryEvents(chat);
  await sendMessageAndWaitForNextAssistant(chat, "edited-hiyori 删除后不应该再召回。");
  const recallAfterDelete = await getLatestMemoryRecallEvent(chat);
  if (recallAfterDelete?.context.items.some((item) => item.id === "summary-1")) {
    throw new Error(`Deleted summary-1 was still recalled: ${JSON.stringify(recallAfterDelete.context)}`);
  }

  await memoryLibrary.locator('[data-harness="memory-library-export"]').click();
  const exportAfterDelete = await waitForMemoryExportValue(settings, (value) => {
    return (
      !value.includes("Edited memory: User prefers Hiyori and Sakura.") &&
      !value.includes(otherRoleSummaryText) &&
      !value.includes("第一轮：我喜欢 Hiyori。")
    );
  });
  if (exportAfterDelete.includes("第一轮：我喜欢 Hiyori。")) {
    throw new Error(`Memory export after delete still included erased raw source turns: ${exportAfterDelete}`);
  }

  await waitForFileContaining(summaryPath, [`"threadId":"${currentThreadId}"`]);
  await settings.getByRole("button", { name: "Refresh memory" }).click();
  await memoryLibrary.locator(".memory-library__segment").first().waitFor();
  await settings.getByRole("button", { name: "Clear summary memory" }).click();
  await memoryLibrary.locator(".provider-test-result", { hasText: "Remembered source evidence was hidden" }).waitFor();
  const summaryAfterClear = await waitForNoCurrentRoleSummaries(summaryPath);
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
        summaryLinesAfterClear: summaryAfterClear.trim().split(/\r?\n/).length,
        summaryCreated,
        recallContext,
        memoryEditVisible: true,
        memoryExportVisible: true,
        disabledMemorySkipped: true,
        enabledMemoryRecalled: true,
        deletedMemoryNotRecalled: true,
        deletedMemoryErasedRawSourceEvidence: true,
        clearedSummaryMemory: true,
        roleBMemoryIsolated: true,
        reloadPersistence: true,
        sourceDrilldownOpened: true,
        sourceDrilldownClosed: true,
        sourceDrilldownNoOverflow: true,
        noPendingCandidateApprovalUi: true,
        memoryExportExcludedProviderSecret: true,
        rawChatRetentionCopyVisible: true,
        settingsMemoryVisible: true,
        settingsSourceScreenshotPath,
        settingsReloadedScreenshotPath,
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

async function attachMemoryEventProbe(page: Page): Promise<void> {
  await page.evaluate(() => {
    const target = window as typeof window & { __greyfieldMemoryEvents?: unknown[] };
    target.__greyfieldMemoryEvents = [];
    window.greyfield?.on("runtime:event", (event) => {
      target.__greyfieldMemoryEvents?.push(event);
    });
  });
}

async function resetMemoryEvents(page: Page): Promise<void> {
  await page.evaluate(() => {
    (window as typeof window & { __greyfieldMemoryEvents?: unknown[] }).__greyfieldMemoryEvents = [];
  });
}

async function getMemoryEvents(page: Page): Promise<unknown[]> {
  return page.evaluate(() => {
    return (window as typeof window & { __greyfieldMemoryEvents?: unknown[] }).__greyfieldMemoryEvents ?? [];
  });
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
  return (await getMemoryEvents(page)).filter(isMemoryRecallEvent).at(-1);
}

function isSummaryCreatedEvent(event: unknown): boolean {
  return typeof event === "object" && event !== null && "type" in event && event.type === "memory.summary.created";
}

function isMemoryRecallEvent(
  event: unknown
): event is { type: "memory.recall.context"; context: { items: Array<{ id: string }>; skipped: Array<{ id: string; reason: string }> } } {
  return typeof event === "object" && event !== null && "type" in event && event.type === "memory.recall.context";
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

async function openSourceDrilldown(memoryLibrary: Locator, id: string): Promise<Locator> {
  const card = memorySummaryCard(memoryLibrary, id);
  await card.locator('[data-harness="memory-source-open"]').click();
  const source = memoryLibrary.locator(memorySourceDrilldownSelector);
  await source.waitFor();
  return source;
}

async function closeSourceDrilldown(memoryLibrary: Locator): Promise<void> {
  const source = memoryLibrary.locator(memorySourceDrilldownSelector);
  await source.locator('[data-harness="memory-source-close"]').click();
  await source.waitFor({ state: "detached" });
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

async function switchCharacter(settings: Page, characterFile: string): Promise<void> {
  await settings.getByLabel("Character").fill(characterFile);
  await settings.waitForTimeout(250);
  await settings.getByRole("button", { name: "Refresh memory" }).click();
}

async function waitForCurrentSummary(memoryLibrary: Locator): Promise<void> {
  await memorySummaryCard(memoryLibrary, "summary-1").waitFor();
}

async function assertOtherRoleSummaryHidden(memoryLibrary: Locator): Promise<void> {
  const text = (await memoryLibrary.textContent()) ?? "";
  if (text.includes(otherRoleSummaryText)) {
    throw new Error("Memory Library rendered another role's summary.");
  }
}

async function assertMemoryPrivacyCopy(memoryLibrary: Locator): Promise<void> {
  await memoryLibrary.locator(".memory-library__privacy", { hasText: "not raw chat history" }).waitFor();
  await memoryLibrary.locator(".memory-library__privacy", { hasText: "provider credentials stay out" }).waitFor();
}

async function assertMemoryLibraryTextSafe(memoryLibrary: Locator): Promise<void> {
  const text = ((await memoryLibrary.textContent()) ?? "").toLowerCase();
  for (const forbidden of ["pending", "candidate", "approval", providerSecret.toLowerCase()]) {
    if (text.includes(forbidden)) {
      throw new Error(`Memory Library exposed forbidden ${forbidden} UI text: ${text}`);
    }
  }
  if (text.includes(summaryBoundedTail.toLowerCase())) {
    throw new Error("Memory Library rendered source text beyond the bounded passage display.");
  }
  if (text.includes("desktop-main-session-")) {
    throw new Error(`Memory Library exposed raw source turn ids in visible text: ${text}`);
  }
}

async function assertNoHorizontalOverflow(page: Page, selector: string): Promise<void> {
  const overflow = await page.locator(selector).evaluateAll((elements) =>
    elements
      .map((element) => {
        const box = element.getBoundingClientRect();
        return {
          text: element.textContent ?? "",
          scrollWidth: element.scrollWidth,
          clientWidth: element.clientWidth,
          boxWidth: box.width
        };
      })
      .filter((item) => item.scrollWidth > item.clientWidth + 1 || item.boxWidth > window.innerWidth + 1)
  );
  if (overflow.length > 0) {
    throw new Error(`Memory source drilldown overflowed horizontally: ${JSON.stringify(overflow)}`);
  }
}

async function waitForMemoryExportValue(page: Page, predicate: (value: string) => boolean): Promise<string> {
  const started = Date.now();
  let lastValue = "";
  while (Date.now() - started < 5_000) {
    lastValue = await page.locator('[data-harness="memory-library-export-text"]').inputValue().catch(() => "");
    if (predicate(lastValue)) {
      return lastValue;
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`Timed out waiting for memory export value; lastValue=${lastValue}`);
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

async function waitForNoCurrentRoleSummaries(path: string): Promise<string> {
  const started = Date.now();
  let lastContent = "";
  while (Date.now() - started < 5_000) {
    lastContent = await readFile(path, "utf8").catch(() => "");
    const summaries = lastContent
      .split(/\r?\n/)
      .filter(Boolean)
      .map((line) => JSON.parse(line) as { threadId?: string });
    if (summaries.every((summary) => summary.threadId !== currentThreadId) && lastContent.includes(otherRoleSummaryText)) {
      return lastContent;
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`Timed out waiting for current-role summaries to clear; content=${lastContent}`);
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
