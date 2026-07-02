import { _electron as electron, type ElectronApplication, type Page } from "playwright";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import type { RuntimeOutputEvent, RuntimeSceneContext } from "@greyfield/core-runtime";
import { defaultGreyfieldConfig } from "@greyfield/persistence/config-schema";
import { getElectronExecutablePath } from "./electron-install";

const workspaceRoot = fileURLToPath(new URL("../../..", import.meta.url));
const desktopRoot = join(workspaceRoot, "apps", "desktop");
const executablePath = await getElectronExecutablePath(desktopRoot);
const artifactDir = join(workspaceRoot, ".cache", "greyfield-screen-awareness", "latest");
const tempDir = await mkdtemp(join(tmpdir(), "greyfield-screen-awareness-"));
const configPath = join(tempDir, "greyfield.config.json");
const sessionPath = join(tempDir, "sessions", "desktop-main-session.jsonl");
const fakeScreenshotDataUrl =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAQAAAADCAIAAAA0lW1TAAAAHklEQVR42mP8z8AARLJgwoIFDBgYGBj+M8B8AAAp+gIGKq+qVwAAAABJRU5ErkJggg==";
const controlsScreenshotPath = join(artifactDir, "controls-screen-awareness-on.png");
const chatScreenshotPath = join(artifactDir, "chat-without-look-panel.png");
const proactiveScreenshotPath = join(artifactDir, "pet-proactive-screen-awareness.png");
const failureScreenshotPath = join(artifactDir, "failure-screen-awareness.png");
const summaryPath = join(artifactDir, "summary.json");
const sceneContext: RuntimeSceneContext = {
  currentTime: "2026-06-30T08:00:00.000Z",
  rain: false,
  place: "home",
  virtualHome: { windowOpen: false },
  absenceDays: 7
};
const summary: Record<string, unknown> = {
  ok: false,
  artifacts: {
    controlsScreenshotPath,
    chatScreenshotPath,
    proactiveScreenshotPath,
    failureScreenshotPath,
    summaryPath
  }
};

await rm(artifactDir, { recursive: true, force: true });
await mkdir(artifactDir, { recursive: true });
await writeFile(
  configPath,
  `${JSON.stringify(
    {
      ...defaultGreyfieldConfig,
      provider: {
        ...defaultGreyfieldConfig.provider,
        llm: "fake",
        tts: "fake"
      },
      ui: {
        ...defaultGreyfieldConfig.ui,
        proactiveMemoryEnabled: true,
        proactivityLevel: 60
      }
    },
    null,
    2
  )}\n`,
  "utf8"
);

let app: ElectronApplication | undefined;
try {
  app = await launchApp();
  const pet = await waitForRoleWindow(app, "pet");
  const controls = await waitForRoleWindow(app, "controls");
  const chat = await waitForRoleWindow(app, "chat");
  summary.windowsReady = true;

  await installRuntimeRecorder(pet);
  await assertChatLookPanelAbsent(chat);
  summary.noChatLookPanel = true;
  await assertDesktopControlsHaveSingleScreenAwarenessToggle(controls);
  summary.desktopControlsSingleScreenAwarenessToggle = true;

  await controls.getByRole("button", { name: /^(Turn Screen awareness on|开启屏幕感知)$/ }).click();
  await controls.getByRole("button", { name: /^(Turn Screen awareness off|关闭屏幕感知)$/ }).waitFor({ timeout: 10_000 });
  await assertDesktopControlsHaveSingleScreenAwarenessToggle(controls);
  await controls.screenshot({ path: controlsScreenshotPath });
  summary.desktopControlToggleEnabled = true;

  const initialObservationUsedCount = await runtimeEventCount(pet, "observation.used");
  await sendDesktopControlMessage(controls, "先试一下没有视觉模型时会怎样。");
  await waitForRuntimeEvent(
    pet,
    (event) => event.type === "error" && event.message.includes("Vision model")
  );
  await assertRuntimeEventCountStays(pet, "observation.used", initialObservationUsedCount, "Missing Vision model still used screen context");
  summary.noVisionModelFallback = true;

  await pet.evaluate(() => {
    window.greyfield?.send("settings:update", { provider: { visionModel: "fake-vision-model" } });
  });
  await delay(500);
  summary.visionModelConfigured = true;

  await sendDesktopControlMessage(controls, "看一下我桌面上是什么。");
  await waitForRuntimeEvent(pet, (event) => event.type === "observation.used" && event.observation.source === "desktop-screen-awareness");
  await waitForRuntimeEvent(
    pet,
    (event) => event.type === "assistant.text.final" && event.text.includes("最近的桌面画面")
  );
  summary.userMessageUsedScreenAwareness = true;

  await triggerProactiveCheck(pet, sceneContext);
  await waitForProactiveMessage(pet, "桌面上有新的画面");
  await pet.screenshot({ path: proactiveScreenshotPath });
  summary.proactiveUsesScreenAwarenessWhenLevelPositive = true;

  await pet.evaluate(() => {
    window.greyfield?.send("settings:update", { ui: { proactivityLevel: 0 } });
  });
  await delay(500);
  const proactiveCount = await proactiveEventCount(pet);
  await triggerProactiveCheck(pet, sceneContext);
  await assertProactiveEventCountStays(pet, proactiveCount, "proactivityLevel=0 allowed proactive screen-aware speech");
  summary.proactivityZeroBlocksScreenAwareSpeech = true;

  await controls.getByRole("button", { name: /^(Turn Screen awareness off|关闭屏幕感知)$/ }).click();
  await controls.getByRole("button", { name: /^(Turn Screen awareness on|开启屏幕感知)$/ }).waitFor({ timeout: 10_000 });
  await controls.reload();
  await controls.waitForSelector(".desktop-control-panel");
  await controls.getByRole("button", { name: /^(Turn Screen awareness on|开启屏幕感知)$/ }).waitFor({ timeout: 10_000 });
  await assertDesktopControlsHaveSingleScreenAwarenessToggle(controls);
  await chat.reload();
  await chat.waitForSelector(".chat-shell");
  await assertChatLookPanelAbsent(chat);
  summary.offReloadDoesNotRestoreModeOrChatPanel = true;

  const observationUsedCount = await runtimeEventCount(pet, "observation.used");
  await sendDesktopControlMessage(controls, "现在不用看桌面，直接回复。");
  await waitForRuntimeEvent(pet, (event) => event.type === "assistant.text.final" && event.text.includes("你好，我醒着"));
  if ((await runtimeEventCount(pet, "observation.used")) !== observationUsedCount) {
    throw new Error("Screen awareness off still sent visual context with a later user message.");
  }
  summary.offModeDoesNotUseScreenContext = true;

  await chat.screenshot({ path: chatScreenshotPath });
  const sessionRaw = await readFile(sessionPath, "utf8");
  if (sessionRaw.includes("data:image") || sessionRaw.includes(fakeScreenshotDataUrl) || sessionRaw.includes("screen-frame")) {
    throw new Error(`Session persisted raw screen frame data: ${sessionRaw}`);
  }

  Object.assign(summary, {
    ok: true,
    rawScreenshotExcludedFromSession: true,
    controlsScreenshotPath,
    chatScreenshotPath,
    proactiveScreenshotPath
  });
  await writeSummary();
  console.log(JSON.stringify(summary, null, 2));
} catch (error) {
  summary.ok = false;
  summary.error = error instanceof Error ? { message: error.message, stack: error.stack } : String(error);
  try {
    const controls = app ? await findRoleWindow(app, "controls") : undefined;
    if (controls) {
      await controls.screenshot({ path: failureScreenshotPath });
    }
    summary.failureScreenshotPath = failureScreenshotPath;
  } catch (screenshotError) {
    summary.failureScreenshotError = screenshotError instanceof Error ? screenshotError.message : String(screenshotError);
  }
  await writeSummary();
  console.error(JSON.stringify(summary, null, 2));
  throw error;
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
      GREYFIELD_FAKE_SCREENSHOT_DATA_URL: fakeScreenshotDataUrl
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

async function waitForRoleWindow(app: ElectronApplication, roleName: "pet" | "settings" | "chat" | "controls"): Promise<Page> {
  const started = Date.now();
  while (Date.now() - started < 5_000) {
    for (const page of app.windows()) {
      const role = await page.evaluate(() => new URLSearchParams(window.location.search).get("window")).catch(() => null);
      if (role === roleName) {
        await page.waitForSelector(roleSelector(roleName));
        return page;
      }
    }
    await delay(100);
  }
  throw new Error(`Timed out waiting for ${roleName} window`);
}

async function findRoleWindow(app: ElectronApplication, roleName: "pet" | "settings" | "chat" | "controls"): Promise<Page | undefined> {
  for (const page of app.windows()) {
    const role = await page.evaluate(() => new URLSearchParams(window.location.search).get("window")).catch(() => null);
    if (role === roleName) {
      return page;
    }
  }
  return undefined;
}

function roleSelector(roleName: "pet" | "settings" | "chat" | "controls"): string {
  switch (roleName) {
    case "pet":
      return ".pet-shell";
    case "settings":
      return ".greyfield-shell";
    case "chat":
      return ".chat-shell";
    case "controls":
      return ".desktop-control-panel";
  }
}

async function assertChatLookPanelAbsent(chat: Page): Promise<void> {
  const forbidden = [
    chat.locator(".observation-panel"),
    chat.locator(".observation-preview-strip"),
    chat.getByText("Look", { exact: true }),
    chat.getByText("观察", { exact: true }),
    chat.getByRole("button", { name: "Capture one screenshot" }),
    chat.getByRole("button", { name: "截图" }),
    chat.getByRole("button", { name: "Observe slowly" }),
    chat.getByRole("button", { name: "High frequency observation" }),
    chat.getByRole("button", { name: "Delete temporary observation" })
  ];
  for (const locator of forbidden) {
    if ((await locator.count()) !== 0) {
      throw new Error("Chat Look/observation panel is still visible.");
    }
  }
}

async function assertDesktopControlsHaveSingleScreenAwarenessToggle(controls: Page): Promise<void> {
  const screenAwarenessToggleCount = await controls.getByRole("button", { name: /Screen awareness|屏幕感知/u }).count();
  if (screenAwarenessToggleCount !== 1) {
    throw new Error(`Desktop controls must expose exactly one Screen awareness toggle; found ${screenAwarenessToggleCount}.`);
  }
  const forbidden = [
    controls.getByRole("button", { name: /^Shot$/u }),
    controls.getByRole("button", { name: /^Clear$/u }),
    controls.getByRole("button", { name: /^End$/u }),
    controls.getByRole("button", { name: "Capture one screenshot" }),
    controls.getByRole("button", { name: "Delete temporary observation" }),
    controls.getByRole("button", { name: "End observation" }),
    controls.locator(".observation-panel"),
    controls.locator(".observation-preview-strip")
  ];
  for (const locator of forbidden) {
    if ((await locator.count()) !== 0) {
      throw new Error("Desktop controls still expose Shot/Clear/End or preview observation UI.");
    }
  }
}

async function sendDesktopControlMessage(page: Page, text: string): Promise<void> {
  await page.getByLabel(/^(Desktop message|桌面消息)$/).fill(text);
  await page.getByRole("button", { name: /^(Send message|发送消息)$/ }).click();
}

async function installRuntimeRecorder(page: Page): Promise<void> {
  await page.evaluate(() => {
    const target = window as typeof window & {
      __greyfieldRuntimeEvents?: RuntimeOutputEvent[];
      __greyfieldProactiveEvents?: Array<{ text: string; createdAt: string }>;
      __greyfieldRecorderInstalled?: boolean;
    };
    target.__greyfieldRuntimeEvents = [];
    target.__greyfieldProactiveEvents = [];
    if (target.__greyfieldRecorderInstalled) {
      return;
    }
    target.__greyfieldRecorderInstalled = true;
    window.greyfield?.on("runtime:event", (event) => {
      target.__greyfieldRuntimeEvents?.push(event);
    });
    window.greyfield?.on("proactive:message", (message) => {
      target.__greyfieldProactiveEvents?.push(message);
    });
  });
}

async function waitForRuntimeEvent(page: Page, predicate: (event: RuntimeOutputEvent) => boolean): Promise<void> {
  const started = Date.now();
  while (Date.now() - started < 10_000) {
    const matched = await page.evaluate((predicateText) => {
      const fn = new Function("event", `return (${predicateText})(event);`) as (event: RuntimeOutputEvent) => boolean;
      const events =
        (window as typeof window & { __greyfieldRuntimeEvents?: RuntimeOutputEvent[] }).__greyfieldRuntimeEvents ?? [];
      return events.some((event) => {
        try {
          return fn(event);
        } catch {
          return false;
        }
      });
    }, predicate.toString());
    if (matched) {
      return;
    }
    await delay(100);
  }
  const events = await page.evaluate(
    () => (window as typeof window & { __greyfieldRuntimeEvents?: RuntimeOutputEvent[] }).__greyfieldRuntimeEvents ?? []
  );
  throw new Error(`Timed out waiting for runtime event; events=${JSON.stringify(events).slice(-4000)}`);
}

async function runtimeEventCount(page: Page, type: RuntimeOutputEvent["type"]): Promise<number> {
  return page.evaluate((type) => {
    const events =
      (window as typeof window & { __greyfieldRuntimeEvents?: RuntimeOutputEvent[] }).__greyfieldRuntimeEvents ?? [];
    return events.filter((event) => event.type === type).length;
  }, type);
}

async function assertRuntimeEventCountStays(
  page: Page,
  type: RuntimeOutputEvent["type"],
  expectedCount: number,
  message: string
): Promise<void> {
  await delay(700);
  const actualCount = await runtimeEventCount(page, type);
  if (actualCount !== expectedCount) {
    throw new Error(`${message}; expected ${expectedCount}, got ${actualCount}`);
  }
}

async function triggerProactiveCheck(page: Page, context: RuntimeSceneContext): Promise<void> {
  await page.evaluate((sceneContext) => {
    window.greyfield?.send("proactive:check", { sceneContext });
  }, context);
}

async function waitForProactiveMessage(page: Page, textFragment: string): Promise<void> {
  const started = Date.now();
  while (Date.now() - started < 10_000) {
    const matched = await page.evaluate((fragment) => {
      const events =
        (window as typeof window & { __greyfieldProactiveEvents?: Array<{ text: string }> }).__greyfieldProactiveEvents ?? [];
      return events.some((event) => event.text.includes(fragment));
    }, textFragment);
    if (matched) {
      return;
    }
    await delay(100);
  }
  const events = await page.evaluate(
    () => (window as typeof window & { __greyfieldProactiveEvents?: Array<{ text: string }> }).__greyfieldProactiveEvents ?? []
  );
  throw new Error(`Timed out waiting for proactive screen-awareness message; events=${JSON.stringify(events)}`);
}

async function proactiveEventCount(page: Page): Promise<number> {
  return page.evaluate(
    () => (window as typeof window & { __greyfieldProactiveEvents?: Array<{ text: string }> }).__greyfieldProactiveEvents?.length ?? 0
  );
}

async function assertProactiveEventCountStays(page: Page, expectedCount: number, message: string): Promise<void> {
  await delay(700);
  const actualCount = await proactiveEventCount(page);
  if (actualCount !== expectedCount) {
    throw new Error(`${message}; expected ${expectedCount}, got ${actualCount}`);
  }
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function writeSummary(): Promise<void> {
  await writeFile(summaryPath, `${JSON.stringify(summary, null, 2)}\n`, "utf8");
}
