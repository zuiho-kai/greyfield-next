import { _electron as electron, type ElectronApplication, type Page } from "playwright";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
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
  weather: "rain",
  location: "virtual_home",
  objects: [{ kind: "window", state: "open", location: "virtual_home" }],
  absenceDays: 45
};
const expectedText = "It's raining again. I remembered our hotpot night at home.";
const forbiddenFragments = ["atom", "score", "trace", "database", "candidate"];

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

    await triggerProactiveCheck(petWindow);
    const firstEvent = await waitForProactiveEvent(petWindow, 1);
    await assertProactiveEventCount(settingsWindow, 0, "settings window received proactive message");
    await assertProactiveEventCount(chatWindow, 0, "chat window received proactive message");
    await assertProactiveEventCount(controlsWindow, 0, "controls window received proactive message");
    const firstBubble = await waitForBubbleText(petWindow);
    assertNaturalText(firstEvent.text, { exact: true });
    assertNaturalText(firstBubble, { exact: true });
    await assertBubbleTextFits(petWindow);
    await assertNoChatMessages(chatWindow);
    const screenshotPath = join(artifactDir, "proactive-memory-bubble.png");
    await petWindow.screenshot({ path: screenshotPath });

    await triggerProactiveCheck(petWindow);
    await assertProactiveEventCountStays(petWindow, 1, "cooldown did not block repeated proactive display");

    await settingsWindow.getByLabel("Remembered moments").setChecked(false);
    await petWindow.locator(".speech-bubble").waitFor({ state: "detached", timeout: 5_000 });
    await triggerProactiveCheck(petWindow);
    await assertProactiveEventCountStays(petWindow, 1, "global disable did not block proactive display");
    await petWindow.locator(".speech-bubble").waitFor({ state: "detached", timeout: 1_000 });

    console.log(
      JSON.stringify(
        {
          ok: true,
          displayedNaturalBubble: true,
          scopedToPetWindow: true,
          cooldownBlockedRepeat: true,
          globalDisableBlockedDisplay: true,
          chatHistoryUnchanged: true,
          screenshot: screenshotPath
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

async function triggerProactiveCheck(page: Page): Promise<void> {
  await page.evaluate((sceneContext) => {
    window.greyfield?.send("proactive:check", { sceneContext });
  }, sceneContext);
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
    importance: 0.91,
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
