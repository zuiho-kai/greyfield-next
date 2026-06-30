import { _electron as electron, type ElectronApplication, type Page } from "playwright";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { defaultGreyfieldConfig } from "@greyfield/persistence/config-schema";

interface ProbeState {
  events: string[];
  activeCount: number;
}

const workspaceRoot = fileURLToPath(new URL("../../..", import.meta.url));
const desktopRoot = join(workspaceRoot, "apps", "desktop");
const tempDir = await mkdtemp(join(tmpdir(), "greyfield-electron-voice-input-"));
const configPath = join(tempDir, "greyfield.config.json");
let asrRequests = 0;
let llmRequests = 0;
let ttsRequests = 0;

const server = createServer(async (request: IncomingMessage, response: ServerResponse) => {
  if (request.url?.endsWith("/audio/transcriptions")) {
    asrRequests += 1;
    await drain(request);
    response.writeHead(200, { "content-type": "application/json" });
    response.end(JSON.stringify({ text: "麦克风测试" }));
    return;
  }
  if (request.url?.endsWith("/chat/completions")) {
    llmRequests += 1;
    await drain(request);
    response.writeHead(200, {
      "content-type": "text/event-stream",
      "cache-control": "no-cache"
    });
    response.write('data: {"choices":[{"delta":{"content":"收到语音。"}}]}\n\n');
    response.write("data: [DONE]\n\n");
    response.end();
    return;
  }
  if (request.url?.endsWith("/audio/speech")) {
    ttsRequests += 1;
    await drain(request);
    response.writeHead(200, { "content-type": "audio/wav" });
    response.end(Buffer.from(createSineWaveWav()));
    return;
  }
  response.writeHead(404);
  response.end("not found");
});

await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
const port = (server.address() as AddressInfo).port;

await writeFile(
  configPath,
  `${JSON.stringify(
    {
      ...defaultGreyfieldConfig,
      provider: {
        ...defaultGreyfieldConfig.provider,
        llm: "openai-compatible",
        asr: "openai-compatible",
        tts: "openai-compatible",
        baseUrl: `http://127.0.0.1:${port}/v1`,
        apiKey: "local-voice-harness-key",
        model: "voice-harness-llm",
        asrModel: "whisper-1",
        ttsModel: "voice-harness-tts"
      },
      voice: {
        ...defaultGreyfieldConfig.voice,
        id: "voice-harness-speaker",
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
    let chatWindow = await waitForRoleWindow(app, "chat");
    const settingsWindow = await waitForRoleWindow(app, "settings");

    await installAudioProbeBeforeReload(petWindow);
    petWindow = await reloadRoleWindow(petWindow, ".pet-shell");
    await installMicrophoneProbeBeforeReload(chatWindow);
    chatWindow = await reloadRoleWindow(chatWindow, ".chat-shell");
    await rebroadcastSettings(settingsWindow);

    await chatWindow.getByTestId("chat-voice-input-button").click();
    await chatWindow.getByTestId("chat-stop-button").click();
    await waitForMicrophoneProbeEvent(chatWindow, "cancel");
    await chatWindow.locator('[data-testid="chat-status"][data-status-tone="stopped"]').waitFor({ timeout: 10_000 });
    if (asrRequests !== 0) {
      throw new Error(`Stop during listening still sent ASR requests: ${asrRequests}`);
    }

    await chatWindow.getByTestId("chat-voice-input-button").click();
    await chatWindow.getByTestId("chat-voice-input-button").click();
    await chatWindow.locator(".message-list .message-item.user", { hasText: "麦克风测试" }).waitFor({ timeout: 15_000 });
    await chatWindow.locator(".message-list .message-item.assistant", { hasText: "收到语音。" }).waitFor({ timeout: 15_000 });
    await waitForAudioProbeEvent(petWindow, "play");
    await petWindow.waitForFunction(() => Number(document.querySelector<HTMLElement>(".live2d-stage-view")?.dataset.mouthOpen ?? "0") > 0, {
      timeout: 10_000
    });
    await waitForAudioStripCount(settingsWindow, 1);

    await chatWindow.getByTestId("chat-stop-button").click();
    await waitForAudioProbeEvent(petWindow, "pause");
    await waitForAudioStripCount(settingsWindow, 0);
    await petWindow.waitForFunction(() => Number(document.querySelector<HTMLElement>(".live2d-stage-view")?.dataset.mouthOpen ?? "1") === 0, {
      timeout: 10_000
    });

    console.log(
      JSON.stringify(
        {
          ok: true,
          microphoneStopCanceledInput: true,
          asrRequests,
          llmRequests,
          ttsRequests,
          transcriptReachedChat: true,
          ttsPlaybackStarted: true,
          waveformMouthMoved: true,
          stopCanceledPlayback: true,
          queueCleared: true,
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
  server.closeAllConnections?.();
  server.close();
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

async function reloadRoleWindow(page: Page, selector: string): Promise<Page> {
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.waitForSelector(selector);
  return page;
}

async function installMicrophoneProbeBeforeReload(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const probe = {
      events: [] as string[],
      snapshot() {
        return { events: [...this.events], activeCount: 0 };
      }
    };
    (window as typeof window & { __greyfieldMicrophoneProbe?: unknown; __greyfieldMicrophoneProbeState?: typeof probe })
      .__greyfieldMicrophoneProbeState = probe;
    (window as typeof window & {
      __greyfieldMicrophoneProbe?: {
        start(): Promise<void>;
        stop(): Promise<Uint8Array>;
        cancel(): void;
      };
    }).__greyfieldMicrophoneProbe = {
      async start() {
        probe.events.push("start");
      },
      async stop() {
        probe.events.push("stop");
        return new Uint8Array([1, 2, 3, 4]);
      },
      cancel() {
        probe.events.push("cancel");
      }
    };
  });
}

async function installAudioProbeBeforeReload(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const probe = {
      events: [] as string[],
      active: [] as Array<() => void>,
      snapshot() {
        return { events: [...this.events], activeCount: this.active.length };
      }
    };
    (window as typeof window & { __greyfieldAudioProbe?: typeof probe }).__greyfieldAudioProbe = probe;
    (
      window as typeof window & {
        __greyfieldAudioPlaybackProbe?: {
          playAudio(): Promise<void>;
          cancel(): void;
        };
      }
    ).__greyfieldAudioPlaybackProbe = {
      playAudio() {
        probe.events.push("play");
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

async function rebroadcastSettings(page: Page): Promise<void> {
  await page.evaluate(() => {
    window.greyfield?.send("settings:update", {});
  });
}

async function waitForMicrophoneProbeEvent(page: Page, eventName: string): Promise<void> {
  await page.waitForFunction(
    (name) => {
      const probe = (window as typeof window & { __greyfieldMicrophoneProbeState?: { snapshot(): ProbeState } })
        .__greyfieldMicrophoneProbeState;
      return probe?.snapshot().events.includes(name) ?? false;
    },
    eventName,
    { timeout: 10_000 }
  );
}

async function waitForAudioProbeEvent(page: Page, eventName: string): Promise<void> {
  await page.waitForFunction(
    (name) => {
      const probe = (window as typeof window & { __greyfieldAudioProbe?: { snapshot(): ProbeState } }).__greyfieldAudioProbe;
      return probe?.snapshot().events.includes(name) ?? false;
    },
    eventName,
    { timeout: 15_000 }
  );
}

async function waitForAudioStripCount(page: Page, expected: number): Promise<void> {
  await page.waitForFunction((count) => document.querySelectorAll(".audio-strip span").length === count, expected, {
    timeout: 10_000
  });
}

async function drain(request: IncomingMessage): Promise<void> {
  for await (const _chunk of request) {
    // Drain request body.
  }
}

function createSineWaveWav(): Uint8Array {
  const sampleRate = 16_000;
  const durationSeconds = 0.8;
  const sampleCount = Math.floor(sampleRate * durationSeconds);
  const dataSize = sampleCount * 2;
  const buffer = new ArrayBuffer(44 + dataSize);
  const view = new DataView(buffer);
  writeAscii(view, 0, "RIFF");
  view.setUint32(4, 36 + dataSize, true);
  writeAscii(view, 8, "WAVE");
  writeAscii(view, 12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  writeAscii(view, 36, "data");
  view.setUint32(40, dataSize, true);
  for (let index = 0; index < sampleCount; index += 1) {
    const envelope = index < sampleCount * 0.7 ? 1 : Math.max(0, 1 - (index - sampleCount * 0.7) / (sampleCount * 0.3));
    const sample = Math.sin((index / sampleRate) * Math.PI * 2 * 440) * 0.7 * envelope;
    view.setInt16(44 + index * 2, Math.max(-1, Math.min(1, sample)) * 32767, true);
  }
  return new Uint8Array(buffer);
}

function writeAscii(view: DataView, offset: number, value: string): void {
  for (let index = 0; index < value.length; index += 1) {
    view.setUint8(offset + index, value.charCodeAt(index));
  }
}
