import { _electron as electron, type ElectronApplication, type Page } from "playwright";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { defaultGreyfieldConfig } from "@greyfield/persistence/config-schema";

const workspaceRoot = fileURLToPath(new URL("../../..", import.meta.url));
const desktopRoot = join(workspaceRoot, "apps", "desktop");
const tempDir = await mkdtemp(join(tmpdir(), "greyfield-stop-audio-"));
const configPath = join(tempDir, "greyfield.config.json");

await writeFile(
  configPath,
  `${JSON.stringify(
    {
      ...defaultGreyfieldConfig,
      provider: {
        ...defaultGreyfieldConfig.provider,
        tts: "fake"
      },
      voice: {
        ...defaultGreyfieldConfig.voice,
        speechEnabled: true
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
    const petWindow = await waitForRoleWindow(app, "pet");
    const chatWindow = await waitForRoleWindow(app, "chat");
    const settingsWindow = await waitForRoleWindow(app, "settings");
    await installSpeechProbe(petWindow);

    await chatWindow.getByLabel("Message").fill("请说一句话，然后我会停止。");
    await chatWindow.getByRole("button", { name: "Send" }).click();
    await waitForAudioStripCount(settingsWindow, 2, "initial playback queue");
    await waitForSpeechSpeakCount(petWindow, 2);
    await finishAllSpeech(petWindow);
    await waitForAudioStripCount(settingsWindow, 0, "natural playback completion");
    const stopDisabledAfterPlayback = await chatWindow.getByRole("button", { name: "Stop" }).isDisabled();
    if (!stopDisabledAfterPlayback) {
      throw new Error("Stop remained enabled after speech playback finished and the shared queue was cleared");
    }

    await chatWindow.getByLabel("Message").fill("请再说一句话，然后我会停止。");
    await chatWindow.getByRole("button", { name: "Send" }).click();
    await waitForSpeechEvent(petWindow, "speak");
    await settingsWindow.locator(".audio-strip span", { hasText: "你好，我醒着。" }).waitFor({ timeout: 10_000 });

    await chatWindow.getByRole("button", { name: "Stop" }).click();
    await waitForSpeechEvent(petWindow, "cancel");
    await chatWindow.locator(".status-badge, .status-pill", { hasText: /idle|interrupted|Stopped/ }).waitFor({
      timeout: 10_000
    });
    await waitForAudioStripCount(settingsWindow, 0, "interrupted playback");
    await petWindow.waitForFunction(() => {
      const stage = document.querySelector<HTMLElement>(".live2d-stage-view");
      return Number(stage?.dataset.mouthOpen ?? "1") === 0;
    });

    const speechEvents = await readSpeechEvents(petWindow);
    console.log(
      JSON.stringify(
        {
          ok: true,
          speechEvents,
          playbackFinishClearedQueue: stopDisabledAfterPlayback,
          speechCanceled: speechEvents.includes("cancel"),
          audioQueueCleared: true,
          mouthOpenReset: true
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
      `Timed out waiting for first Electron window; spawnargs=${JSON.stringify(spawnargs)}; urls=${JSON.stringify(
        urls
      )}; output=${output.join("").slice(-4000)}; cause=${String(error)}`
    );
  }
  return app;
}

async function waitForRoleWindow(app: ElectronApplication, roleName: "pet" | "settings" | "chat"): Promise<Page> {
  const started = Date.now();
  while (Date.now() - started < 5_000) {
    for (const page of app.windows()) {
      const role = await page.evaluate(() => new URLSearchParams(window.location.search).get("window")).catch(() => null);
      if (role === roleName) {
        await page.waitForSelector(
          roleName === "pet" ? ".pet-shell" : roleName === "settings" ? ".greyfield-shell" : ".chat-shell"
        );
        return page;
      }
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`Timed out waiting for ${roleName} window`);
}

async function installSpeechProbe(page: Page): Promise<void> {
  await page.evaluate(() => {
    const synthesis = window.speechSynthesis;
    if (!synthesis) {
      throw new Error("speechSynthesis is unavailable in the pet window");
    }
    const speechEvents: string[] = [];
    const utterances: SpeechSynthesisUtterance[] = [];
    (window as typeof window & { __greyfieldSpeechEvents?: string[] }).__greyfieldSpeechEvents = speechEvents;
    (window as typeof window & { __greyfieldFinishSpeech?: () => number }).__greyfieldFinishSpeech = () => {
      const pending = [...utterances];
      utterances.length = 0;
      for (const utterance of pending) {
        utterance.onend?.(new Event("end") as SpeechSynthesisEvent);
      }
      return pending.length;
    };
    synthesis.speak = (utterance: SpeechSynthesisUtterance) => {
      speechEvents.push(`speak:${utterance.text}`);
      utterances.push(utterance);
    };
    synthesis.cancel = () => {
      speechEvents.push("cancel");
      const pending = [...utterances];
      utterances.length = 0;
      for (const utterance of pending) {
        utterance.onerror?.({ error: "canceled" } as SpeechSynthesisErrorEvent);
      }
    };
  });
}

async function waitForSpeechEvent(page: Page, eventName: "speak" | "cancel"): Promise<void> {
  await page.waitForFunction(
    (name) => {
      const events = (window as typeof window & { __greyfieldSpeechEvents?: string[] }).__greyfieldSpeechEvents ?? [];
      return name === "speak" ? events.some((event) => event.startsWith("speak:")) : events.includes("cancel");
    },
    eventName,
    { timeout: 10_000 }
  );
}

async function waitForSpeechSpeakCount(page: Page, expectedCount: number): Promise<void> {
  await page.waitForFunction(
    (expected) => {
      const events = (window as typeof window & { __greyfieldSpeechEvents?: string[] }).__greyfieldSpeechEvents ?? [];
      return events.filter((event) => event.startsWith("speak:")).length >= expected;
    },
    expectedCount,
    { timeout: 10_000 }
  );
}

async function readSpeechEvents(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    return [...((window as typeof window & { __greyfieldSpeechEvents?: string[] }).__greyfieldSpeechEvents ?? [])];
  });
}

async function waitForAudioStripCount(page: Page, expectedCount: number, label: string): Promise<void> {
  try {
    await page.waitForFunction(
      (expected) => document.querySelectorAll(".audio-strip span").length === expected,
      expectedCount,
      { timeout: 10_000 }
    );
  } catch (error) {
    const snapshot = await page
      .evaluate(() => ({
        audioStripTexts: Array.from(document.querySelectorAll(".audio-strip span")).map((item) => item.textContent ?? ""),
        statusText: document.querySelector(".status-pill")?.textContent?.trim() ?? "",
        bodyText: document.body.textContent?.replace(/\s+/g, " ").trim().slice(0, 800) ?? ""
      }))
      .catch((snapshotError) => ({ snapshotError: String(snapshotError) }));
    throw new Error(
      `${label}: expected Settings audio queue length ${expectedCount}; snapshot=${JSON.stringify(snapshot)}; cause=${String(error)}`
    );
  }
}

async function finishAllSpeech(page: Page): Promise<void> {
  await page.waitForFunction(() => {
    const finish = (window as typeof window & { __greyfieldFinishSpeech?: () => number }).__greyfieldFinishSpeech;
    return typeof finish === "function" && finish() > 0;
  });
}
