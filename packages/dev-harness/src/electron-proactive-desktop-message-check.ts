import { _electron as electron, type ElectronApplication, type Page } from "playwright";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import { defaultGreyfieldConfig } from "@greyfield/persistence/config-schema";
import type { MemoryAtom, RuntimeSceneContext } from "@greyfield/core-runtime";

const workspaceRoot = fileURLToPath(new URL("../../..", import.meta.url));
const desktopRoot = join(workspaceRoot, "apps", "desktop");
const artifactDir = join(workspaceRoot, ".cache", "greyfield-proactive-desktop-message", "latest");
const tempDir = await mkdtemp(join(tmpdir(), "greyfield-proactive-desktop-message-"));
const configPath = join(tempDir, "greyfield.config.json");
const threadId = "desktop:characters-greyfield-yaml";
const sceneContext: RuntimeSceneContext = {
  currentTime: "2026-06-28T08:00:00.000Z",
  rain: true,
  place: "home",
  virtualHome: { windowOpen: true },
  absenceDays: 45
};
const expectedText = "It's raining again. I remembered our hotpot night at home.";
const forbiddenFragments = ["atom", "score", "trace", "database", "candidate"];
const summaryPath = join(artifactDir, "summary.json");
const proactiveBubbleScreenshotPath = join(artifactDir, "proactive-memory-bubble.png");
const settingsSliderScreenshotPath = join(artifactDir, "settings-proactivity-slider.png");

await rm(artifactDir, { recursive: true, force: true });
await mkdir(artifactDir, { recursive: true });
await mkdir(join(tempDir, "memory"), { recursive: true });
await writeFile(
  configPath,
  `${JSON.stringify(
    {
      ...defaultGreyfieldConfig,
      ui: {
        ...defaultGreyfieldConfig.ui,
        locale: "en-US",
        speechBubbleEnabled: true,
        proactiveMemoryEnabled: true
      }
    },
    null,
    2
  )}\n`,
  "utf8"
);
await writeFile(join(tempDir, "memory", "atoms.jsonl"), `${JSON.stringify(makeRainyHotpotAtom())}\n`, "utf8");

try {
  const app = await launchApp();
  try {
    const petWindow = await waitForRoleWindow(app, "pet");
    const settingsWindow = await waitForRoleWindow(app, "settings");
    const chatWindow = await waitForRoleWindow(app, "chat");
    const controlsWindow = await waitForRoleWindow(app, "controls");
    await Promise.all([
      attachProactiveEventProbe(petWindow),
      attachProactiveEventProbe(settingsWindow),
      attachProactiveEventProbe(chatWindow),
      attachProactiveEventProbe(controlsWindow)
    ]);

    await triggerProactiveCheck(petWindow, sceneContext);
    await assertProactiveEventCountStays(petWindow, 0, "default proactivity level allowed low-confidence proactive display");
    await assertNoChatMessages(chatWindow);

    await showSettingsWindow(app);
    await setProactivityLevel(settingsWindow, 100);
    await waitForPersistedProactivityLevel(100);
    await captureSettingsSliderScreenshot(settingsWindow);
    await triggerProactiveCheck(petWindow, sceneContext);
    await assertProactiveEventCountStays(petWindow, 0, "visible Settings window allowed proactive display");
    await hideSettingsWindow(app);

    await triggerProactiveCheck(petWindow, {
      ...sceneContext,
      currentTime: "2026-06-28T23:00:00.000Z"
    });
    await assertProactiveEventCountStays(petWindow, 0, "quiet window allowed proactive display");
    await assertNoChatMessages(chatWindow);

    await triggerProactiveCheck(petWindow, { ...sceneContext, absenceDays: 1 });
    await assertProactiveEventCountStays(petWindow, 0, "recent activity allowed proactive display");
    await assertNoChatMessages(chatWindow);

    await triggerProactiveCheck(petWindow, {
      currentTime: "2026-06-28T10:00:00.000Z",
      place: "home",
      virtualHome: { windowOpen: true },
      absenceDays: 45
    });
    await assertProactiveEventCountStays(petWindow, 0, "missing rain signal allowed proactive display");
    await assertNoChatMessages(chatWindow);

    await triggerProactiveCheck(petWindow, sceneContext);
    const firstEvent = await waitForProactiveEvent(petWindow, 1);
    await assertProactiveEventCount(settingsWindow, 0, "settings window received proactive message");
    await assertProactiveEventCount(chatWindow, 0, "chat window received proactive message");
    await assertProactiveEventCount(controlsWindow, 0, "controls window received proactive message");
    const firstBubble = await waitForBubbleText(petWindow);
    assertNaturalText(firstEvent.text, { exact: true });
    assertNaturalText(firstBubble, { exact: true });
    await assertBubbleTextFits(petWindow);
    await assertNoChatMessages(chatWindow);
    await petWindow.screenshot({ path: proactiveBubbleScreenshotPath });

    await triggerProactiveCheck(petWindow, sceneContext);
    await assertProactiveEventCountStays(petWindow, 1, "cooldown allowed repeated proactive display");

    await showSettingsWindow(app);
    await setProactivityLevel(settingsWindow, 0);
    await waitForPersistedProactivityLevel(0);
    await hideSettingsWindow(app);
    await triggerProactiveCheck(petWindow, {
      ...sceneContext,
      currentTime: "2026-06-28T12:00:00.000Z"
    });
    await assertProactiveEventCountStays(petWindow, 1, "zero proactivity level allowed proactive display");

    await showSettingsWindow(app);
    await settingsWindow.getByLabel("Remembered moments").setChecked(false);
    await hideSettingsWindow(app);
    await petWindow.locator(".speech-bubble").waitFor({ state: "detached", timeout: 5_000 });
    await triggerProactiveCheck(petWindow, sceneContext);
    await assertProactiveEventCountStays(petWindow, 1, "global disable allowed proactive display");
    await petWindow.locator(".speech-bubble").waitFor({ state: "detached", timeout: 1_000 });

    const summary = {
      ok: true,
      settingsSliderVisible: true,
      settingsSliderPersisted100: true,
      settingsSliderPersisted0: true,
      defaultLevelBlockedLowConfidenceCandidate: true,
      highLevelDisplayedLowConfidenceCandidate: true,
      settingsWindowBlockedDisplay: true,
      displayedNaturalBubble: true,
      scopedToPetWindow: true,
      quietWindowBlockedDisplay: true,
      recentActivityBlockedDisplay: true,
      missingSignalBlockedDisplay: true,
      cooldownBlockedRepeat: true,
      zeroLevelBlockedDisplay: true,
      globalDisableBlockedDisplay: true,
      chatHistoryUnchanged: true,
      artifact: summaryPath,
      proactiveBubbleScreenshot: proactiveBubbleScreenshotPath,
      settingsSliderScreenshot: settingsSliderScreenshotPath
    };
    await writeFile(summaryPath, `${JSON.stringify(summary, null, 2)}\n`, "utf8");
    console.log(JSON.stringify(summary, null, 2));
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

async function waitForRoleWindow(app: ElectronApplication, roleName: "pet" | "settings" | "chat" | "controls"): Promise<Page> {
  const started = Date.now();
  while (Date.now() - started < 5_000) {
    for (const page of app.windows()) {
      const role = await page.evaluate(() => new URLSearchParams(window.location.search).get("window")).catch(() => null);
      if (role === roleName) {
        await page.waitForSelector(
          roleName === "pet"
            ? ".pet-shell"
            : roleName === "settings"
              ? ".greyfield-shell"
              : roleName === "chat"
                ? ".chat-shell"
                : ".desktop-controls-shell",
          { state: "attached" }
        );
        return page;
      }
    }
    await delay(100);
  }
  throw new Error(`Timed out waiting for ${roleName} window`);
}

async function attachProactiveEventProbe(page: Page): Promise<void> {
  await page.evaluate(() => {
    const target = window as typeof window & {
      __greyfieldProactiveEvents?: Array<{ text: string; createdAt: string }>;
    };
    target.__greyfieldProactiveEvents = [];
    window.greyfield?.on("proactive:message", (message) => {
      target.__greyfieldProactiveEvents?.push(message);
    });
  });
}

async function triggerProactiveCheck(page: Page, sceneContext: RuntimeSceneContext): Promise<void> {
  await page.evaluate((sceneContext) => {
    window.greyfield?.send("proactive:check", { sceneContext });
  }, sceneContext);
}

async function showSettingsWindow(app: ElectronApplication): Promise<void> {
  await app.evaluate(({ BrowserWindow }) => {
    for (const browserWindow of BrowserWindow.getAllWindows()) {
      if (browserWindow.webContents.getURL().includes("window=settings")) {
        browserWindow.show();
      }
    }
  });
  await assertSettingsWindowVisibility(app, true);
}

async function hideSettingsWindow(app: ElectronApplication): Promise<void> {
  await app.evaluate(({ BrowserWindow }) => {
    for (const browserWindow of BrowserWindow.getAllWindows()) {
      if (browserWindow.webContents.getURL().includes("window=settings")) {
        browserWindow.hide();
      }
    }
  });
  await assertSettingsWindowVisibility(app, false);
}

async function assertSettingsWindowVisibility(app: ElectronApplication, expectedVisible: boolean): Promise<void> {
  const started = Date.now();
  while (Date.now() - started < 3_000) {
    const visible = await app.evaluate(({ BrowserWindow }) => {
      const settingsWindow = BrowserWindow.getAllWindows().find((browserWindow) =>
        browserWindow.webContents.getURL().includes("window=settings")
      );
      return settingsWindow?.isVisible() ?? false;
    });
    if (visible === expectedVisible) {
      return;
    }
    await delay(50);
  }
  throw new Error(`Settings window visibility did not become ${expectedVisible}`);
}

async function setProactivityLevel(page: Page, value: number): Promise<void> {
  const slider = proactivitySlider(page);
  await slider.waitFor({ state: "attached" });
  await slider.evaluate((input, value) => {
    const slider = input as HTMLInputElement;
    slider.value = String(value);
    slider.dispatchEvent(new Event("input", { bubbles: true }));
  }, value);
  await page.waitForFunction(
    (value) =>
      (document.querySelector<HTMLInputElement>('[data-testid="proactivity-level-slider"]')?.value ?? "") === String(value),
    value
  );
}

function proactivitySlider(page: Page) {
  return page.locator('[data-testid="proactivity-level-slider"]');
}

async function captureSettingsSliderScreenshot(page: Page): Promise<void> {
  await page.locator('[data-settings-section="window"]').scrollIntoViewIfNeeded();
  await proactivitySlider(page).scrollIntoViewIfNeeded();
  await page.screenshot({ path: settingsSliderScreenshotPath });
}

async function waitForPersistedProactivityLevel(value: number): Promise<void> {
  const started = Date.now();
  while (Date.now() - started < 3_000) {
    const config = JSON.parse(await readFile(configPath, "utf8")) as { ui?: { proactivityLevel?: number } };
    if (config.ui?.proactivityLevel === value) {
      return;
    }
    await delay(50);
  }
  const raw = await readFile(configPath, "utf8");
  throw new Error(`Timed out waiting for proactivityLevel=${value}; config=${raw}`);
}

async function waitForBubbleText(page: Page): Promise<string> {
  try {
    await page.locator(".speech-bubble").waitFor({ state: "visible", timeout: 10_000 });
    return (await page.locator(".speech-bubble").textContent())?.trim() ?? "";
  } catch (error) {
    const diagnostic = await page.evaluate(() => {
      const bubble = document.querySelector<HTMLElement>(".speech-bubble");
      const target = window as typeof window & {
        __greyfieldProactiveEvents?: Array<{ text: string; createdAt: string }>;
      };
      return {
        proactiveEvents: target.__greyfieldProactiveEvents ?? [],
        bubbleText: bubble?.textContent?.trim() ?? null,
        bodyText: document.body.textContent?.slice(0, 500) ?? ""
      };
    });
    throw new Error(`Timed out waiting for proactive bubble; diagnostic=${JSON.stringify(diagnostic)}; cause=${String(error)}`);
  }
}

async function waitForProactiveEvent(page: Page, count: number): Promise<{ text: string; createdAt: string }> {
  await page.waitForFunction(
    (expectedCount) => {
      return (
        (window as typeof window & {
          __greyfieldProactiveEvents?: Array<{ text: string; createdAt: string }>;
        }).__greyfieldProactiveEvents?.length ?? 0
      ) >= expectedCount;
    },
    count,
    { timeout: 10_000 }
  );
  const events = await page.evaluate(() => {
    return (
      (window as typeof window & {
        __greyfieldProactiveEvents?: Array<{ text: string; createdAt: string }>;
      }).__greyfieldProactiveEvents ?? []
    );
  });
  return events[count - 1]!;
}

async function proactiveEventCount(page: Page): Promise<number> {
  return page.evaluate(() => {
    return (
      (window as typeof window & {
        __greyfieldProactiveEvents?: Array<{ text: string; createdAt: string }>;
      }).__greyfieldProactiveEvents?.length ?? 0
    );
  });
}

async function assertProactiveEventCount(page: Page, expectedCount: number, message: string): Promise<void> {
  const actualCount = await proactiveEventCount(page);
  if (actualCount !== expectedCount) {
    throw new Error(`${message}; expected=${expectedCount}; actual=${actualCount}`);
  }
}

async function assertProactiveEventCountStays(page: Page, expectedCount: number, message: string): Promise<void> {
  const started = Date.now();
  while (Date.now() - started < 800) {
    await assertProactiveEventCount(page, expectedCount, message);
    await delay(50);
  }
}

async function assertNoChatMessages(page: Page): Promise<void> {
  const messageCount = await page.locator(".message-list .message-item").count();
  if (messageCount !== 0) {
    throw new Error(`Proactive message polluted chat history; messageCount=${messageCount}`);
  }
}

function assertNaturalText(text: string, options: { exact: boolean }): void {
  if (options.exact && text !== expectedText) {
    throw new Error(`Unexpected proactive bubble text: ${JSON.stringify(text)}`);
  }
  const lowered = text.toLowerCase();
  for (const fragment of forbiddenFragments) {
    if (lowered.includes(fragment)) {
      throw new Error(`Proactive bubble exposed internal terminology: ${JSON.stringify(text)}`);
    }
  }
}

async function assertBubbleTextFits(page: Page): Promise<void> {
  const box = await page.locator(".speech-bubble").evaluate((bubble) => {
    const element = bubble as HTMLElement;
    return {
      scrollWidth: element.scrollWidth,
      clientWidth: element.clientWidth,
      scrollHeight: element.scrollHeight,
      clientHeight: element.clientHeight
    };
  });
  if (box.scrollWidth > box.clientWidth || box.scrollHeight > box.clientHeight) {
    throw new Error(`Proactive bubble text overflowed: ${JSON.stringify(box)}`);
  }
}

function makeRainyHotpotAtom(): MemoryAtom {
  return {
    id: "atom-rainy-hotpot",
    threadId,
    type: "episodic_scene",
    text: "We kept the home window open while having hotpot on a rainy night.",
    sourceTurnIds: ["turn-hotpot"],
    createdAt: "2026-05-01T08:00:00.000Z",
    importance: 0.6,
    triggerKeys: [],
    triggers: {
      exact: [],
      aliases: [],
      secondary: [],
      environment: ["rain", "virtual_home", "virtual_home.window=open", "last_seen_days>=30"],
      semantic: ["shared scene memory"]
    },
    metadata: {
      sharedExperience: true,
      activity: "hotpot",
      weather: "rain",
      windowState: "open",
      longAbsenceDays: 30
    }
  };
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
