import { _electron as electron, type ElectronApplication, type Page } from "playwright";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { defaultGreyfieldConfig } from "@greyfield/persistence/config-schema";
import { isPlayableAudioHeader } from "./real-tts-audio-header";

interface RealTTSHarnessConfig {
  baseUrl: string;
  apiKey: string;
  model: string;
  voice: string;
}

interface AudioProbeState {
  events: string[];
  blobSizes: number[];
  blobHeaders: string[];
  activeCount: number;
}

const workspaceRoot = fileURLToPath(new URL("../../..", import.meta.url));
const desktopRoot = join(workspaceRoot, "apps", "desktop");
const tempDir = await mkdtemp(join(tmpdir(), "greyfield-electron-real-tts-"));
const configPath = join(tempDir, "greyfield.config.json");
const provider = readRealTTSEnv(process.env);

await writeFile(
  configPath,
  `${JSON.stringify(
    {
      ...defaultGreyfieldConfig,
      provider: {
        ...defaultGreyfieldConfig.provider,
        llm: "fake",
        tts: "openai-compatible",
        baseUrl: provider.baseUrl,
        apiKey: provider.apiKey,
        ttsModel: provider.model
      },
      voice: {
        ...defaultGreyfieldConfig.voice,
        id: provider.voice,
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
    let petWindow = await waitForRoleWindow(app, "pet");
    const settingsWindow = await waitForRoleWindow(app, "settings");
    const chatWindow = await waitForRoleWindow(app, "chat");

    await installAudioProbeBeforeReload(petWindow);
    petWindow = await reloadPetWindowWithAudioProbe(petWindow);
    await rebroadcastSettings(settingsWindow);

    await settingsWindow.getByRole("button", { name: "Test Voice" }).click();
    await settingsWindow.locator(".provider-test-result--success", { hasText: "Voice test succeeded" }).waitFor({
      timeout: 30_000
    });
    await waitForAudioProbePlayCount(petWindow, 1, () => captureDebugSnapshot(petWindow, settingsWindow, chatWindow));
    await finishAllAudio(petWindow);
    await waitForAudioStripCount(settingsWindow, 0, "Settings Test Voice playback completion");

    await sendMessage(chatWindow, "请用真实语音说一句话。");
    await waitForAudioProbePlayCount(petWindow, 3, () => captureDebugSnapshot(petWindow, settingsWindow, chatWindow));
    await waitForAudioStripCount(settingsWindow, 2, "real TTS playback queue");
    const firstProbe = await readAudioProbe(petWindow);
    if (!firstProbe.blobSizes.some((size) => size > 0)) {
      throw new Error(`Real TTS playback did not create non-empty audio blobs: ${JSON.stringify(firstProbe)}`);
    }
    if (!firstProbe.blobHeaders.some((header) => isPlayableAudioHeader(header))) {
      throw new Error(`Real TTS playback did not expose playable audio headers: ${JSON.stringify(firstProbe)}`);
    }

    await finishAllAudio(petWindow);
    await waitForAudioStripCount(settingsWindow, 0, "real TTS natural playback completion");
    const stopDisabledAfterPlayback = await chatWindow.getByRole("button", { name: "Stop" }).isDisabled();
    if (!stopDisabledAfterPlayback) {
      throw new Error("Stop remained enabled after real audio playback finished and the queue was cleared");
    }

    await sendMessage(chatWindow, "请再用真实语音说一句话，我会停止。");
    await waitForAudioProbePlayCount(petWindow, 4, () => captureDebugSnapshot(petWindow, settingsWindow, chatWindow));
    await waitForAudioStripCount(settingsWindow, 2, "real TTS interrupted playback queue");
    await chatWindow.getByRole("button", { name: "Stop" }).click();
    await waitForAudioProbeEvent(petWindow, "pause", () => captureDebugSnapshot(petWindow, settingsWindow, chatWindow));
    await waitForAudioStripCount(settingsWindow, 0, "real TTS interrupted playback");
    await petWindow.waitForFunction(() => {
      const stage = document.querySelector<HTMLElement>(".live2d-stage-view");
      return Number(stage?.dataset.mouthOpen ?? "1") === 0;
    });

    const finalProbe = await readAudioProbe(petWindow);
    console.log(
      JSON.stringify(
        {
          ok: true,
          provider: redactRealTTSConfig(provider),
          audioBlobs: finalProbe.blobSizes.length,
          firstBlobBytes: finalProbe.blobSizes[0],
          firstBlobHeader: finalProbe.blobHeaders[0],
          settingsVoiceTestWorked: true,
          audioElementPlayed: finalProbe.events.includes("play"),
          playbackFinishClearedQueue: true,
          stopCanceledAudioElement: finalProbe.events.includes("pause"),
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
      `Timed out waiting for first Electron window; spawnargs=${JSON.stringify(spawnargs)}; urls=${JSON.stringify(urls)}; output=${output.join("").slice(-4000)}; cause=${String(error)}`
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

async function installAudioProbeBeforeReload(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const probe = {
      events: [] as string[],
      blobSizes: [] as number[],
      blobHeaders: [] as string[],
      active: [] as Array<() => void>,
      finishAll() {
        const active = [...this.active];
        this.active.length = 0;
        for (const finish of active) {
          finish();
        }
        return active.length;
      },
      snapshot() {
        return {
          events: [...this.events],
          blobSizes: [...this.blobSizes],
          blobHeaders: [...this.blobHeaders],
          activeCount: this.active.length
        };
      }
    };
    (window as typeof window & { __greyfieldAudioProbe?: typeof probe }).__greyfieldAudioProbe = probe;
    (
      window as typeof window & {
        __greyfieldAudioPlaybackProbe?: {
          playAudio(payload: { bytes: number; headerHex: string; objectUrl: string; volume: number }): Promise<void>;
          cancel(): void;
        };
      }
    ).__greyfieldAudioPlaybackProbe = {
      playAudio(payload) {
        probe.events.push("play");
        probe.blobSizes.push(payload.bytes);
        probe.blobHeaders.push(payload.headerHex);
        return new Promise<void>((resolve) => {
          probe.active.push(resolve);
        });
      },
      cancel() {
        probe.events.push("pause");
        probe.active.length = 0;
      }
    };
  });
}

async function reloadPetWindowWithAudioProbe(page: Page): Promise<Page> {
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.waitForSelector(".pet-shell");
  await page.waitForFunction(() => Boolean((window as typeof window & { __greyfieldAudioProbe?: unknown }).__greyfieldAudioProbe));
  return page;
}

async function rebroadcastSettings(page: Page): Promise<void> {
  await page.evaluate(() => {
    window.greyfield?.send("settings:update", {});
  });
}

async function sendMessage(page: Page, text: string): Promise<void> {
  await page.getByLabel("Message").fill(text);
  await page.getByRole("button", { name: "Send" }).click();
}

async function waitForAudioProbeEvent(
  page: Page,
  eventName: "play" | "pause",
  getDebugSnapshot: () => Promise<unknown>
): Promise<void> {
  try {
    await page.waitForFunction(
      (name) => {
        const probe = (window as typeof window & { __greyfieldAudioProbe?: { snapshot(): AudioProbeState } })
          .__greyfieldAudioProbe;
        return probe?.snapshot().events.includes(name) ?? false;
      },
      eventName,
      { timeout: 60_000 }
    );
  } catch (error) {
    throw new Error(
      `Timed out waiting for real TTS Audio.${eventName}; snapshot=${JSON.stringify(
        await getDebugSnapshot()
      )}; cause=${String(error)}`
    );
  }
}

async function waitForAudioProbePlayCount(
  page: Page,
  expectedCount: number,
  getDebugSnapshot: () => Promise<unknown>
): Promise<void> {
  try {
    await page.waitForFunction(
      (expected) => {
        const probe = (window as typeof window & { __greyfieldAudioProbe?: { snapshot(): AudioProbeState } })
          .__greyfieldAudioProbe;
        return (probe?.snapshot().events.filter((event) => event === "play").length ?? 0) >= expected;
      },
      expectedCount,
      { timeout: 60_000 }
    );
  } catch (error) {
    throw new Error(
      `Timed out waiting for ${expectedCount} real TTS Audio.play calls; snapshot=${JSON.stringify(
        await getDebugSnapshot()
      )}; cause=${String(error)}`
    );
  }
}

async function waitForAudioStripCount(page: Page, expectedCount: number, label: string): Promise<void> {
  try {
    await page.waitForFunction(
      (expected) => document.querySelectorAll(".audio-strip span").length === expected,
      expectedCount,
      { timeout: 20_000 }
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

async function finishAllAudio(page: Page): Promise<void> {
  await page.waitForFunction(() => {
    const probe = (window as typeof window & { __greyfieldAudioProbe?: { finishAll(): number } }).__greyfieldAudioProbe;
    return typeof probe?.finishAll === "function" && probe.finishAll() > 0;
  });
}

async function readAudioProbe(page: Page): Promise<AudioProbeState> {
  await page.waitForFunction(() => {
    const probe = (window as typeof window & { __greyfieldAudioProbe?: { snapshot(): AudioProbeState } })
      .__greyfieldAudioProbe;
    return (probe?.snapshot().blobHeaders.length ?? 0) > 0;
  });
  return page.evaluate(() => {
    const probe = (window as typeof window & { __greyfieldAudioProbe?: { snapshot(): AudioProbeState } })
      .__greyfieldAudioProbe;
    if (!probe) {
      throw new Error("Audio probe is not installed");
    }
    return probe.snapshot();
  });
}

async function captureDebugSnapshot(petWindow: Page, settingsWindow: Page, chatWindow: Page): Promise<unknown> {
  const [pet, settings, chat] = await Promise.all([
    petWindow
      .evaluate(() => ({
        probe: (window as typeof window & { __greyfieldAudioProbe?: { snapshot(): AudioProbeState } }).__greyfieldAudioProbe?.snapshot(),
        status: document.querySelector(".pet-shell")?.textContent?.replace(/\s+/g, " ").trim().slice(0, 400) ?? ""
      }))
      .catch((error) => ({ error: String(error) })),
    settingsWindow
      .evaluate(() => ({
        audioStripTexts: Array.from(document.querySelectorAll(".audio-strip span")).map((item) => item.textContent ?? ""),
        statusText: document.querySelector(".status-pill")?.textContent?.trim() ?? "",
        voiceError: document.querySelector(".voice-error")?.textContent?.trim() ?? "",
        bodyText: document.body.textContent?.replace(/\s+/g, " ").trim().slice(0, 800) ?? ""
      }))
      .catch((error) => ({ error: String(error) })),
    chatWindow
      .evaluate(() => ({
        statusText: document.querySelector(".status-pill")?.textContent?.trim() ?? "",
        error: document.querySelector(".chat-error")?.textContent?.trim() ?? "",
        bodyText: document.body.textContent?.replace(/\s+/g, " ").trim().slice(0, 800) ?? ""
      }))
      .catch((error) => ({ error: String(error) }))
  ]);
  return { pet, settings, chat };
}

function readRealTTSEnv(env: Record<string, string | undefined>): RealTTSHarnessConfig {
  const baseUrl = env.GREYFIELD_REAL_TTS_BASE_URL || env.GREYFIELD_REAL_LLM_BASE_URL;
  const apiKey = env.GREYFIELD_REAL_TTS_API_KEY || env.GREYFIELD_REAL_LLM_API_KEY;
  const model = env.GREYFIELD_REAL_TTS_MODEL || "FunAudioLLM/CosyVoice2-0.5B";
  const voice = env.GREYFIELD_REAL_TTS_VOICE || "FunAudioLLM/CosyVoice2-0.5B:anna";
  const missing = [
    ["GREYFIELD_REAL_TTS_BASE_URL or GREYFIELD_REAL_LLM_BASE_URL", baseUrl],
    ["GREYFIELD_REAL_TTS_API_KEY or GREYFIELD_REAL_LLM_API_KEY", apiKey]
  ]
    .filter(([, value]) => !value?.trim())
    .map(([key]) => key);
  if (missing.length > 0) {
    throw new Error(`Missing ${missing.join(", ")}`);
  }
  return {
    baseUrl: trimTrailingSlash(baseUrl ?? ""),
    apiKey: apiKey ?? "",
    model,
    voice
  };
}

function redactRealTTSConfig(config: RealTTSHarnessConfig): RealTTSHarnessConfig {
  return { ...config, apiKey: "<redacted>" };
}

function trimTrailingSlash(value: string): string {
  return value.trim().replace(/\/+$/g, "");
}
