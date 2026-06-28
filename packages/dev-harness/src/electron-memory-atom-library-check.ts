import { _electron as electron, type ElectronApplication, type Locator, type Page } from "playwright";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import type { MemoryAtom, SessionTurn } from "@greyfield/core-runtime";
import { defaultGreyfieldConfig } from "@greyfield/persistence/config-schema";
import { getElectronExecutablePath } from "./electron-install";

const workspaceRoot = fileURLToPath(new URL("../../..", import.meta.url));
const desktopRoot = join(workspaceRoot, "apps", "desktop");
const executablePath = await getElectronExecutablePath(desktopRoot);
const tempDir = await mkdtemp(join(tmpdir(), "greyfield-electron-memory-atoms-"));
const configPath = join(tempDir, "greyfield.config.json");
const sessionPath = join(tempDir, "sessions", "desktop-main-session.jsonl");
const atomPath = join(tempDir, "memory", "atoms.jsonl");
const artifactDir = join(workspaceRoot, ".cache", "greyfield-memory-atom-library", "latest");
const settingsInitialScreenshotPath = join(artifactDir, "settings-memory-atoms-initial.png");
const settingsAfterClearScreenshotPath = join(artifactDir, "settings-memory-atoms-after-clear.png");
const availableSourceScreenshotPath = join(artifactDir, "source-available.png");
const missingSourceScreenshotPath = join(artifactDir, "source-missing.png");
const unavailableSourceScreenshotPath = join(artifactDir, "source-unavailable.png");
const noSourceScreenshotPath = join(artifactDir, "source-no-passage.png");
const providerSecret = "memory-atom-library-provider-secret";
const editedAtomText = "Edited atom memory: User prefers Sakura.";
const editedPromiseText = "Edited promise memory: Greyfield will help organize the desk.";
const atomOpinionText = "User dislikes pay-to-win game loops.";
const atomPromiseText = "Promise: Greyfield committed to help the user organize their desk.";
const currentRoleCharacterFile = "characters/greyfield.yaml";
const otherRoleCharacterFile = "characters/other-role.yaml";
const currentThreadId = "desktop:characters-greyfield-yaml";
const otherThreadId = "desktop:characters-other-role-yaml";
const boundedTail = "SOURCE_PASSAGE_BOUNDARY_TAIL_SHOULD_NOT_RENDER";
const requestBodies: string[] = [];
const server = createServer(async (request: IncomingMessage, response: ServerResponse) => {
  requestBodies.push(await readRequestBody(request));
  response.writeHead(200, {
    "content-type": "text/event-stream",
    "cache-control": "no-cache"
  });
  response.write('data: {"choices":[{"delta":{"content":"Atom memory harness response."}}]}\n\n');
  response.write("data: [DONE]\n\n");
  response.end();
});

await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
const port = (server.address() as AddressInfo).port;

let app: ElectronApplication | undefined;
try {
  await mkdir(join(tempDir, "sessions"), { recursive: true });
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
          llm: "openai-compatible",
          baseUrl: `http://127.0.0.1:${port}/v1`,
          apiKey: providerSecret,
          model: "memory-atom-library-harness"
        }
      },
      null,
      2
    )}\n`,
    "utf8"
  );
  await writeSessionFile([
    makeTurn({
      id: "desktop-main-session-fact",
      role: "user",
      content: `User birthday source says June 12. ${"This sentence keeps the available source passage long. ".repeat(16)}${boundedTail}`
    }),
    makeTurn({
      id: "desktop-main-session-preference",
      role: "assistant",
      content: ""
    }),
    makeTurn({
      id: "desktop-main-session-promise",
      role: "user",
      content: "Source promise says Greyfield promised to help organize the desk."
    })
  ]);
  await writeAtomFile([
    makeAtom({
      id: "atom-fact",
      type: "fact",
      text: "User birthday is June 12.",
      sourceTurnIds: ["desktop-main-session-fact"],
      metadata: { factType: "birthday" }
    }),
    makeAtom({
      id: "atom-preference",
      type: "preference",
      text: "User prefers the Hiyori model.",
      sourceTurnIds: ["desktop-main-session-preference"],
      metadata: { preferenceType: "live2d_model" }
    }),
    makeAtom({
      id: "atom-opinion",
      type: "opinion",
      text: atomOpinionText,
      sourceTurnIds: ["desktop-main-session-opinion"],
      triggerKeys: ["pay-to-win", "game loops"],
      triggers: {
        exact: ["pay-to-win"],
        aliases: ["game loops"],
        secondary: ["loops"]
      },
      metadata: { opinionType: "game_review" }
    }),
    makeAtom({
      id: "atom-relationship",
      type: "relationship_event",
      text: "First meeting anniversary ritual is giving roses.",
      sourceSessionId: "previous-local-session",
      sourceTurnIds: ["desktop-main-session-relationship"],
      metadata: { eventType: "first_meeting_anniversary" }
    }),
    makeAtom({
      id: "atom-scene",
      type: "episodic_scene",
      text: "Shared rainy hotpot evening memory.",
      sourceTurnIds: [],
      metadata: { sceneType: "shared_meal" }
    }),
    makeAtom({
      id: "atom-promise",
      type: "promise",
      text: atomPromiseText,
      sourceTurnIds: ["desktop-main-session-promise"],
      triggerKeys: ["promise memory", "desk organization promise"],
      triggers: {
        exact: ["整理书桌"],
        aliases: ["promise"],
        secondary: ["desk"],
        semantic: ["promise memory", "desk organization promise"]
      },
      metadata: {
        promiseType: "commitment",
        promiseSubject: "greyfield",
        promiseAction: "organize_desk"
      }
    }),
    makeAtom({
      id: "atom-other-role",
      threadId: otherThreadId,
      type: "preference",
      text: "Other role memory must stay isolated.",
      sourceTurnIds: ["desktop-main-session-other"]
    })
  ]);

  app = await launchApp();
  let chat = await waitForRoleWindow(app, "chat");
  let settings = await waitForRoleWindow(app, "settings");
  await settings.waitForSelector(".greyfield-shell");
  await settings.getByRole("button", { name: "Refresh memory" }).click();

  let memoryLibrary = settings.locator('[aria-label="Memory Library"]');
  await memoryLibrary.waitFor();
  await memoryLibrary.locator(".memory-library__lane", { hasText: "Summary" }).waitFor();
  await memoryLibrary.locator(".memory-library__lane", { hasText: "Facts" }).waitFor();
  await memoryLibrary.locator(".memory-library__lane", { hasText: "Preferences" }).waitFor();
  await memoryLibrary.locator(".memory-library__lane", { hasText: "Opinions" }).waitFor();
  await memoryLibrary.locator(".memory-library__lane", { hasText: "Relationships" }).waitFor();
  await memoryLibrary.locator(".memory-library__lane", { hasText: "Scenes" }).waitFor();
  await memoryLibrary.locator(".memory-library__lane", { hasText: "Promises" }).waitFor();
  await memoryLibrary.locator(".memory-library__stats", { hasText: "Enabled 6" }).waitFor();
  await memoryLibrary.locator('[aria-label="Fact memory atom-fact"]', { hasText: "User birthday is June 12." }).waitFor();
  await memoryLibrary.locator('[aria-label="Preference memory atom-preference"]', { hasText: "desktop-main-session-preference" }).waitFor();
  await memoryLibrary.locator('[aria-label="Opinion memory atom-opinion"]', { hasText: "User dislikes pay-to-win game loops." }).waitFor();
  await memoryLibrary.locator('[aria-label="Relationship memory atom-relationship"]', { hasText: "First meeting anniversary ritual is giving roses." }).waitFor();
  await memoryLibrary.locator('[aria-label="Scene memory atom-scene"]', { hasText: "Shared rainy hotpot evening memory." }).waitFor();
  await memoryLibrary.locator('[aria-label="Promise memory atom-promise"]', { hasText: atomPromiseText }).waitFor();
  await memoryLibrary.locator('[aria-label="Promises memories"]', { hasText: "1 stored" }).waitFor();
  const availableSource = await openSourcePassage(memoryLibrary, "Source passage for Fact memory atom-fact");
  await availableSource.getByText("User birthday source says June 12.").waitFor();
  await availableSource.getByText("Turn").waitFor();
  await availableSource.getByText("desktop-main-session-fact").waitFor();
  await availableSource.getByText("Role").waitFor();
  await availableSource.getByText("User").first().waitFor();
  await assertSourceStateText(availableSource, {
    includes: ["User", "desktop-main-session-fact"],
    excludes: ["Unknown role"]
  });
  const availableEmptySource = await openSourcePassage(memoryLibrary, "Source passage for Preference memory atom-preference");
  await availableEmptySource.getByText("Source passage").first().waitFor();
  await availableEmptySource.getByText("desktop-main-session-preference").waitFor();
  await availableEmptySource.getByText("Greyfield").first().waitFor();
  await assertSourceStateText(availableEmptySource, {
    includes: ["Source passage", "Greyfield", "desktop-main-session-preference"],
    excludes: ["Source unavailable in this local session store", "Unknown role"]
  });
  const missingSource = await openSourcePassage(memoryLibrary, "Source passage for Opinion memory atom-opinion");
  await missingSource.getByText("Source unavailable in this local session store").first().waitFor();
  await missingSource.getByText("desktop-main-session-opinion").waitFor();
  await assertSourceStateText(missingSource, {
    includes: [
      "Source unavailable in this local session store",
      "Source turn is missing from the current session store.",
      "Not available"
    ],
    excludes: ["Unknown role"]
  });
  const unavailableSource = await openSourcePassage(memoryLibrary, "Source passage for Relationship memory atom-relationship");
  await unavailableSource.getByText("Source unavailable in this local session store").first().waitFor();
  await unavailableSource.getByText("desktop-main-session-relationship").waitFor();
  await assertSourceStateText(unavailableSource, {
    includes: [
      "Source unavailable in this local session store",
      "Source turn belongs to another session and is unavailable in the current local store.",
      "Not available"
    ],
    excludes: ["Unknown role"]
  });
  const noSource = await openSourcePassage(memoryLibrary, "Source passage for Scene memory atom-scene");
  await noSource.getByText("No passage").first().waitFor();
  await assertSourceStateText(noSource, {
    includes: ["No passage"],
    excludes: ["Unknown role"]
  });
  await captureSourceState(settings, availableSource, availableSourceScreenshotPath);
  await captureSourceState(settings, missingSource, missingSourceScreenshotPath);
  await captureSourceState(settings, unavailableSource, unavailableSourceScreenshotPath);
  await captureSourceState(settings, noSource, noSourceScreenshotPath);

  const initialLibraryText = (await memoryLibrary.textContent()) ?? "";
  assertTextDoesNotExposeForbiddenMemoryUi(initialLibraryText);
  if (initialLibraryText.includes(boundedTail)) {
    throw new Error("Memory Library rendered source text beyond the bounded passage display.");
  }
  await assertSettingsPageDoesNotExposeProviderSecret(settings);
  if (initialLibraryText.includes("Other role memory must stay isolated.")) {
    throw new Error("Memory Library rendered a different role's atom memory.");
  }
  await settings.screenshot({ path: settingsInitialScreenshotPath, fullPage: true });

  await switchCharacter(settings, otherRoleCharacterFile);
  await memoryLibrary.locator('[aria-label="Preference memory atom-other-role"]', { hasText: "Other role memory must stay isolated." }).waitFor();
  const roleBText = (await memoryLibrary.textContent()) ?? "";
  if (roleBText.includes("User birthday is June 12.") || roleBText.includes(atomOpinionText) || roleBText.includes(atomPromiseText)) {
    throw new Error(`Role-B Memory Library rendered role-A atom memory: ${roleBText}`);
  }
  await switchCharacter(settings, currentRoleCharacterFile);
  await memoryLibrary.locator('[aria-label="Fact memory atom-fact"]', { hasText: "User birthday is June 12." }).waitFor();
  await assertCurrentRoleOnly(memoryLibrary);

  await settings.getByLabel("Memory text atom-preference").fill(editedAtomText);
  await settings.getByRole("button", { name: "Save memory atom-preference" }).click();
  await memoryLibrary.getByText("Atom memory atom-preference saved.").waitFor();
  await waitForAtom("atom-preference", (atom) => atom.text === editedAtomText);
  await settings.getByLabel("Memory text atom-promise").fill(editedPromiseText);
  await settings.getByRole("button", { name: "Save memory atom-promise" }).click();
  await memoryLibrary.getByText("Atom memory atom-promise saved.").waitFor();
  await waitForAtom("atom-promise", (atom) => atom.text === editedPromiseText);

  await settings.getByRole("button", { name: "Export memory atom-preference" }).click();
  await memoryLibrary.getByText("Atom memory atom-preference export is ready.").waitFor();
  await settings.getByLabel("Memory library export").waitFor();
  const singleAtomExport = await settings.getByLabel("Memory library export").inputValue();
  if (!singleAtomExport.includes(editedAtomText)) {
    throw new Error(`Single-atom export missed edited atom text: ${singleAtomExport}`);
  }
  if (singleAtomExport.includes(providerSecret)) {
    throw new Error("Single-atom export included the configured provider API key.");
  }
  if (singleAtomExport.includes("Other role memory must stay isolated.")) {
    throw new Error("Single-atom export included another role's atom.");
  }
  await settings.getByRole("button", { name: "Export memory atom-promise" }).click();
  await memoryLibrary.getByText("Atom memory atom-promise export is ready.").waitFor();
  const promiseAtomExport = await settings.getByLabel("Memory library export").inputValue();
  if (!promiseAtomExport.includes(editedPromiseText)) {
    throw new Error(`Promise atom export missed edited atom text: ${promiseAtomExport}`);
  }
  if (promiseAtomExport.includes(providerSecret)) {
    throw new Error("Promise atom export included the configured provider API key.");
  }
  await assertSettingsPageDoesNotExposeProviderSecret(settings);

  await settings.getByRole("button", { name: "Disable memory atom-preference" }).click();
  await memoryLibrary.getByText("Atom memory atom-preference disabled.").waitFor();
  await waitForAtom("atom-preference", (atom) => atom.disabled === true);
  clearCapturedRequests();
  await sendMessageAndWaitForNextAssistant(chat, "Hiyori 模型偏好还在吗？");
  assertLatestSystemPromptExcludes(editedAtomText, "disabled atom-preference should stay out of prompt recall");

  await settings.getByRole("button", { name: "Enable memory atom-preference" }).click();
  await waitForAtom("atom-preference", (atom) => atom.disabled === false);
  clearCapturedRequests();
  await sendMessageAndWaitForNextAssistant(chat, "Hiyori 模型偏好重新启用了吗？");
  assertLatestSystemPromptIncludes(editedAtomText, "re-enabled atom-preference should return to prompt recall");

  await app.close();
  app = await launchApp();
  chat = await waitForRoleWindow(app, "chat");
  settings = await waitForRoleWindow(app, "settings");
  await settings.getByRole("button", { name: "Refresh memory" }).click();
  memoryLibrary = settings.locator('[aria-label="Memory Library"]');
  await memoryLibrary.locator('[aria-label="Preference memory atom-preference"]', { hasText: editedAtomText }).waitFor();
  await memoryLibrary.locator('[aria-label="Opinion memory atom-opinion"]', { hasText: atomOpinionText }).waitFor();
  await memoryLibrary.locator('[aria-label="Promise memory atom-promise"]', { hasText: editedPromiseText }).waitFor();
  await assertCurrentRoleOnly(memoryLibrary);
  await waitForAtom("atom-preference", (atom) => atom.text === editedAtomText && atom.disabled === false);
  await waitForAtom("atom-promise", (atom) => atom.text === editedPromiseText);

  clearCapturedRequests();
  await sendMessageAndWaitForNextAssistant(chat, "pay-to-win game loops 这条记忆还在吗？");
  assertLatestSystemPromptIncludes(atomOpinionText, "atom-opinion should be recalled before deletion");

  await settings.getByRole("button", { name: "Delete memory atom-opinion" }).click();
  await memoryLibrary.getByText("Atom memory atom-opinion deleted. Raw chat history and summaries were kept").waitFor();
  await waitForMissingAtom("atom-opinion");
  clearCapturedRequests();
  await sendMessageAndWaitForNextAssistant(chat, "pay-to-win game loops 删除后不应该再召回。");
  assertLatestSystemPromptExcludes(atomOpinionText, "deleted atom-opinion should stay out of prompt recall");

  await settings.getByRole("button", { name: "Export library" }).click();
  await memoryLibrary.getByText("Memory export is ready.").waitFor();
  const libraryExport = await settings.getByLabel("Memory library export").inputValue();
  if (libraryExport.includes(atomOpinionText)) {
    throw new Error(`Library export still included deleted atom-opinion: ${libraryExport}`);
  }
  if (libraryExport.includes(providerSecret)) {
    throw new Error("Memory Library export included the configured provider API key.");
  }
  await assertSettingsPageDoesNotExposeProviderSecret(settings);

  await settings.getByRole("button", { name: "Clear current role atoms" }).click();
  await memoryLibrary.getByText("Cleared 5 current role atom memories. Raw chat history and summaries were kept.").waitFor();
  await waitForMissingAtom("atom-fact");
  await waitForMissingAtom("atom-preference");
  await waitForMissingAtom("atom-relationship");
  await waitForMissingAtom("atom-scene");
  await waitForMissingAtom("atom-promise");
  await waitForAtom("atom-other-role", (atom) => atom.threadId === otherThreadId);
  await memoryLibrary.locator(".memory-library__empty", { hasText: "No memories yet." }).waitFor();
  const afterClearText = (await memoryLibrary.textContent()) ?? "";
  assertTextDoesNotExposeForbiddenMemoryUi(afterClearText);
  await assertSettingsPageDoesNotExposeProviderSecret(settings);
  if (afterClearText.includes("Other role memory must stay isolated.")) {
    throw new Error("Memory Library rendered the isolated role-B atom after clearing current role atoms.");
  }
  await settings.screenshot({ path: settingsAfterClearScreenshotPath, fullPage: true });

  console.log(
    JSON.stringify(
      {
        ok: true,
        atomGroupsVisible: true,
        promiseAtomVisibleAndManageable: true,
        atomEditPersisted: true,
        atomDisablePersisted: true,
        atomEnablePersisted: true,
        disabledAtomSkippedFromPrompt: true,
        enabledAtomReturnedToPrompt: true,
        atomDeleteRemovedFromPrompt: true,
        atomDeleteRemovedFromExport: true,
        clearCurrentRoleKeptOtherRoleAtom: true,
        roleBMemoryIsolated: true,
        reloadPersistence: true,
        memoryDomExcludedProviderSecret: true,
        settingsPageTextAndInputsExcludedProviderSecret: true,
        memoryExportExcludedProviderSecret: true,
        noPendingCandidateApprovalUi: true,
        availableSourceScreenshotPath,
        missingSourceScreenshotPath,
        unavailableSourceScreenshotPath,
        noSourceScreenshotPath,
        settingsInitialScreenshotPath,
        settingsAfterClearScreenshotPath,
        remainingAtomIds: (await readAtoms()).map((atom) => atom.id)
      },
      null,
      2
    )
  );
} finally {
  await app?.close().catch(() => undefined);
  server.closeAllConnections?.();
  server.close();
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
      GREYFIELD_USER_DATA_PATH: tempDir
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

async function readRequestBody(request: IncomingMessage): Promise<string> {
  let raw = "";
  for await (const chunk of request) {
    raw += Buffer.isBuffer(chunk) ? chunk.toString("utf8") : String(chunk);
  }
  return raw;
}

async function switchCharacter(settings: Page, characterFile: string): Promise<void> {
  await settings.getByLabel("Character").fill(characterFile);
  await settings.waitForTimeout(250);
  await settings.getByRole("button", { name: "Refresh memory" }).click();
}

async function assertCurrentRoleOnly(memoryLibrary: Locator): Promise<void> {
  const text = (await memoryLibrary.textContent()) ?? "";
  if (text.includes("Other role memory must stay isolated.")) {
    throw new Error(`Current role Memory Library rendered role-B atom memory: ${text}`);
  }
}

async function sendMessageAndWaitForNextAssistant(page: Page, text: string): Promise<void> {
  const previousCount = await page.locator(".message-list .assistant:not(.draft)").count();
  await page.getByLabel("Message").fill(text);
  await page.getByRole("button", { name: "Send" }).click();
  await page.waitForFunction(
    (count) => document.querySelectorAll(".message-list .assistant:not(.draft)").length > count,
    previousCount,
    { timeout: 10_000 }
  );
}

function clearCapturedRequests(): void {
  requestBodies.length = 0;
}

function assertLatestSystemPromptIncludes(fragment: string, reason: string): void {
  const systemPrompt = latestSystemPrompt();
  if (!systemPrompt.includes(fragment)) {
    throw new Error(`${reason}; prompt=${systemPrompt}`);
  }
}

function assertLatestSystemPromptExcludes(fragment: string, reason: string): void {
  const systemPrompt = latestSystemPrompt();
  if (systemPrompt.includes(fragment)) {
    throw new Error(`${reason}; prompt=${systemPrompt}`);
  }
}

function latestSystemPrompt(): string {
  const requestBody = requestBodies.at(-1);
  if (!requestBody) {
    throw new Error("Expected the local LLM server to receive a chat completion request.");
  }
  const parsed = JSON.parse(requestBody) as { messages?: Array<{ role?: string; content?: string }> };
  const systemPrompt = parsed.messages?.find((message) => message.role === "system")?.content;
  if (!systemPrompt) {
    throw new Error(`OpenAI-compatible request did not include a system prompt: ${requestBody}`);
  }
  return systemPrompt;
}

async function writeAtomFile(atoms: MemoryAtom[]): Promise<void> {
  await writeFile(atomPath, `${atoms.map((atom) => JSON.stringify(atom)).join("\n")}\n`, "utf8");
}

async function writeSessionFile(turns: SessionTurn[]): Promise<void> {
  await writeFile(sessionPath, `${turns.map((turn) => JSON.stringify(turn)).join("\n")}\n`, "utf8");
}

async function readAtoms(): Promise<MemoryAtom[]> {
  const raw = await readFile(atomPath, "utf8").catch(() => "");
  return raw
    .split(/\r?\n/)
    .filter(Boolean)
    .map((line) => JSON.parse(line) as MemoryAtom);
}

async function waitForAtom(id: string, predicate: (atom: MemoryAtom) => boolean): Promise<MemoryAtom> {
  const started = Date.now();
  let lastAtoms: MemoryAtom[] = [];
  while (Date.now() - started < 5_000) {
    lastAtoms = await readAtoms();
    const atom = lastAtoms.find((item) => item.id === id);
    if (atom && predicate(atom)) {
      return atom;
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`Timed out waiting for atom ${id}; atoms=${JSON.stringify(lastAtoms)}`);
}

async function waitForMissingAtom(id: string): Promise<void> {
  const started = Date.now();
  let lastAtoms: MemoryAtom[] = [];
  while (Date.now() - started < 5_000) {
    lastAtoms = await readAtoms();
    if (!lastAtoms.some((atom) => atom.id === id)) {
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`Timed out waiting for atom ${id} to be removed; atoms=${JSON.stringify(lastAtoms)}`);
}

async function openSourcePassage(memoryLibrary: Locator, label: string): Promise<Locator> {
  const source = memoryLibrary.locator(`[aria-label="${label}"]`);
  await source.locator("summary").click();
  return source;
}

async function captureSourceState(page: Page, source: Locator, path: string): Promise<void> {
  await source.evaluate((element) => element.scrollIntoView({ block: "center", inline: "nearest" }));
  await page.waitForTimeout(100);
  await page.screenshot({ path });
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

function assertTextDoesNotExposeForbiddenMemoryUi(text: string): void {
  const normalized = text.toLowerCase();
  for (const forbidden of ["pending", "candidate", "approval", "triggerkeys", "memory-atom-library-provider-secret"]) {
    if (normalized.includes(forbidden)) {
      throw new Error(`Memory Library exposed forbidden ${forbidden} UI text: ${text}`);
    }
  }
}

async function assertSettingsPageDoesNotExposeProviderSecret(page: Page): Promise<void> {
  const rendered = await page.evaluate(() => {
    const fieldValues: string[] = [];
    const elements = document.querySelectorAll("input, textarea, select");
    for (let index = 0; index < elements.length; index += 1) {
      const element = elements[index];
      const style = window.getComputedStyle(element);
      const isVisible =
        style.display !== "none" && style.visibility !== "hidden" && element.getClientRects().length > 0;
      if (!isVisible) {
        continue;
      }

      if (element instanceof HTMLSelectElement) {
        let selectedValue = "";
        for (let optionIndex = 0; optionIndex < element.selectedOptions.length; optionIndex += 1) {
          const option = element.selectedOptions.item(optionIndex);
          selectedValue += `${option?.textContent ?? ""} ${option?.value ?? ""} `;
        }
        fieldValues.push(selectedValue.trim());
        continue;
      }

      if (element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement) {
        fieldValues.push(element.value);
      }
    }

    return {
      bodyInnerText: document.body.innerText,
      fieldValues
    };
  });

  const haystack = [rendered.bodyInnerText, ...rendered.fieldValues].join("\n");
  if (haystack.includes(providerSecret)) {
    throw new Error(`Settings page rendered the configured provider API key: ${JSON.stringify(rendered)}`);
  }
}

function makeTurn(overrides: Partial<SessionTurn>): SessionTurn {
  return {
    id: "desktop-main-session-1",
    role: "user",
    content: "User shared a source turn.",
    createdAt: "2026-06-28T00:00:00.000Z",
    ...overrides
  };
}

function makeAtom(overrides: Partial<MemoryAtom>): MemoryAtom {
  return {
    id: "atom-memory",
    threadId: currentThreadId,
    type: "fact",
    text: "User has an atom memory.",
    sourceTurnIds: ["desktop-main-session-1"],
    createdAt: "2026-06-28T00:00:00.000Z",
    updatedAt: "2026-06-28T00:00:00.000Z",
    importance: 0.8,
    triggerKeys: ["hiyori"],
    triggers: {
      exact: ["Hiyori"],
      aliases: [],
      secondary: []
    },
    metadata: {},
    disabled: false,
    ...overrides
  };
}
