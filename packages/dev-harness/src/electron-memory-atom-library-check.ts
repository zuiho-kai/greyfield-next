import { _electron as electron, type ElectronApplication, type Locator, type Page } from "playwright";
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
const currentThreadId = "desktop:characters-greyfield-yaml";
const otherThreadId = "desktop:characters-other-role-yaml";
const boundedTail = "SOURCE_PASSAGE_BOUNDARY_TAIL_SHOULD_NOT_RENDER";

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
  await writeSessionFile([
    makeTurn({
      id: "desktop-main-session-fact",
      role: "user",
      content: `User birthday source says June 12. ${"This sentence keeps the available source passage long. ".repeat(16)}${boundedTail}`
    }),
    makeTurn({
      id: "desktop-main-session-preference",
      role: "assistant",
      content: "Greyfield confirmed the user prefers the Hiyori model."
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
      text: "User dislikes pay-to-win game loops.",
      sourceTurnIds: ["desktop-main-session-opinion"],
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
      id: "atom-other-role",
      threadId: otherThreadId,
      type: "preference",
      text: "Other role memory must stay isolated.",
      sourceTurnIds: ["desktop-main-session-other"]
    })
  ]);

  app = await electron.launch({
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

  await app.firstWindow({ timeout: 10_000 });
  const settings = await waitForRoleWindow(app, "settings");
  await settings.waitForSelector(".greyfield-shell");
  await settings.getByRole("button", { name: "Refresh memory" }).click();

  const memoryLibrary = settings.locator('[aria-label="Memory Library"]');
  await memoryLibrary.waitFor();
  await memoryLibrary.locator(".memory-library__lane", { hasText: "Summary" }).waitFor();
  await memoryLibrary.locator(".memory-library__lane", { hasText: "Facts" }).waitFor();
  await memoryLibrary.locator(".memory-library__lane", { hasText: "Preferences" }).waitFor();
  await memoryLibrary.locator(".memory-library__lane", { hasText: "Opinions" }).waitFor();
  await memoryLibrary.locator(".memory-library__lane", { hasText: "Relationships" }).waitFor();
  await memoryLibrary.locator(".memory-library__lane", { hasText: "Scenes" }).waitFor();
  await memoryLibrary.locator(".memory-library__stats", { hasText: "Enabled 5" }).waitFor();
  await memoryLibrary.locator('[aria-label="Fact memory atom-fact"]', { hasText: "User birthday is June 12." }).waitFor();
  await memoryLibrary.locator('[aria-label="Preference memory atom-preference"]', { hasText: "desktop-main-session-preference" }).waitFor();
  await memoryLibrary.locator('[aria-label="Opinion memory atom-opinion"]', { hasText: "User dislikes pay-to-win game loops." }).waitFor();
  await memoryLibrary.locator('[aria-label="Relationship memory atom-relationship"]', { hasText: "First meeting anniversary ritual is giving roses." }).waitFor();
  await memoryLibrary.locator('[aria-label="Scene memory atom-scene"]', { hasText: "Shared rainy hotpot evening memory." }).waitFor();
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

  await settings.getByLabel("Memory text atom-preference").fill("Edited atom memory: User prefers Sakura.");
  await settings.getByRole("button", { name: "Save memory atom-preference" }).click();
  await memoryLibrary.getByText("Atom memory atom-preference saved.").waitFor();
  await waitForAtom("atom-preference", (atom) => atom.text === "Edited atom memory: User prefers Sakura.");

  await settings.getByRole("button", { name: "Export memory atom-preference" }).click();
  await memoryLibrary.getByText("Atom memory atom-preference export is ready.").waitFor();
  await settings.getByLabel("Memory library export").waitFor();
  const singleAtomExport = await settings.getByLabel("Memory library export").inputValue();
  if (!singleAtomExport.includes("Edited atom memory: User prefers Sakura.")) {
    throw new Error(`Single-atom export missed edited atom text: ${singleAtomExport}`);
  }
  if (singleAtomExport.includes(providerSecret)) {
    throw new Error("Single-atom export included the configured provider API key.");
  }
  if (singleAtomExport.includes("Other role memory must stay isolated.")) {
    throw new Error("Single-atom export included another role's atom.");
  }
  await assertSettingsPageDoesNotExposeProviderSecret(settings);

  await settings.getByRole("button", { name: "Disable memory atom-preference" }).click();
  await memoryLibrary.getByText("Atom memory atom-preference disabled.").waitFor();
  await waitForAtom("atom-preference", (atom) => atom.disabled === true);

  await settings.getByRole("button", { name: "Delete memory atom-opinion" }).click();
  await memoryLibrary.getByText("Atom memory atom-opinion deleted. Raw chat history and summaries were kept").waitFor();
  await waitForMissingAtom("atom-opinion");

  await settings.getByRole("button", { name: "Export library" }).click();
  await memoryLibrary.getByText("Memory export is ready.").waitFor();
  const libraryExport = await settings.getByLabel("Memory library export").inputValue();
  if (libraryExport.includes("User dislikes pay-to-win game loops.")) {
    throw new Error(`Library export still included deleted atom-opinion: ${libraryExport}`);
  }
  if (libraryExport.includes(providerSecret)) {
    throw new Error("Memory Library export included the configured provider API key.");
  }
  await assertSettingsPageDoesNotExposeProviderSecret(settings);

  await settings.getByRole("button", { name: "Clear current role atoms" }).click();
  await memoryLibrary.getByText("Cleared 4 current role atom memories. Raw chat history and summaries were kept.").waitFor();
  await waitForMissingAtom("atom-fact");
  await waitForMissingAtom("atom-preference");
  await waitForMissingAtom("atom-relationship");
  await waitForMissingAtom("atom-scene");
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
        atomEditPersisted: true,
        atomDisablePersisted: true,
        atomDeleteRemovedFromExport: true,
        clearCurrentRoleKeptOtherRoleAtom: true,
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
  await rm(tempDir, { recursive: true, force: true });
}

async function waitForRoleWindow(app: ElectronApplication, roleName: "settings"): Promise<Page> {
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
  const text = (await source.textContent()) ?? "";
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
