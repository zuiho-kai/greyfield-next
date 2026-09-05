import { _electron as electron, type ElectronApplication } from "playwright";
import { readFile, mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { defaultGreyfieldConfig } from "@greyfield/persistence/config-schema";

const workspace = fileURLToPath(new URL("../../..", import.meta.url));
const artifacts = join(workspace, ".cache", "neko-plugin-acceptance");
const source = process.env.GREYFIELD_NEKO_SOURCE_PATH;
const configSource = process.env.GREYFIELD_NEKO_CONFIG_PATH;
const fixturePath = process.env.GREYFIELD_NEKO_CHECK_AUDIO;
if (!source || !configSource || !fixturePath) throw new Error("Set GREYFIELD_NEKO_SOURCE_PATH, GREYFIELD_NEKO_CONFIG_PATH and GREYFIELD_NEKO_CHECK_AUDIO.");
await mkdir(artifacts, { recursive: true });
const suppliedConfig = JSON.parse(await readFile(configSource, "utf8"));
const configPath = join(artifacts, "greyfield.config.json");
await writeFile(configPath, JSON.stringify({ ...defaultGreyfieldConfig, live2d: suppliedConfig.live2d,
  window: { ...defaultGreyfieldConfig.window, x: 130, y: 100, modelPassThrough: false }, ui: { ...defaultGreyfieldConfig.ui, locale: "zh-CN" } }));
const app = await electron.launch({ cwd: join(workspace, "apps", "desktop"), args: [join(workspace, "apps", "desktop", "dist-main", "index.mjs")],
  env: { ...process.env, GREYFIELD_CONFIG_PATH: configPath, GREYFIELD_PROJECT_ROOT: workspace,
    GREYFIELD_USER_DATA_PATH: join(artifacts, "user-data"), GREYFIELD_NEKO_SOURCE_PATH: source } });
let result: Record<string, unknown> = {};
try {
  const pet = await roleWindow(app, "pet"); const controls = await roleWindow(app, "controls");
  const settings = await roleWindow(app, "settings"); const chat = await roleWindow(app, "chat");
  await pet.evaluate((fixture) => {
    const probe: any = (window as any).__nekoProbe = { starts: [] as number[], stops: [] as number[], ended: [] as number[], transcript: [] as string[], audio: [] as number[][], trackStops: 0, mouthSeen: false, inputStarted: [] as number[], active: new Set(), userActivity: [] as number[] };
    const inputSources = new WeakSet<AudioBufferSourceNode>();
    const originalStart = AudioBufferSourceNode.prototype.start;
    const originalStop = AudioBufferSourceNode.prototype.stop;
    AudioBufferSourceNode.prototype.start = function (...args: Parameters<AudioBufferSourceNode["start"]>) {
      if (!inputSources.has(this)) {
        probe.starts.push(performance.now()); probe.active.add(this);
        this.addEventListener("ended", () => { probe.active.delete(this); probe.ended.push(performance.now()); });
      }
      return originalStart.apply(this, args);
    };
    AudioBufferSourceNode.prototype.stop = function (...args: Parameters<AudioBufferSourceNode["stop"]>) {
      if (!inputSources.has(this)) { probe.stops.push(performance.now()); probe.active.delete(this); }
      return originalStop.apply(this, args);
    };
    navigator.mediaDevices.getUserMedia = async () => {
      const context = new AudioContext({ sampleRate: 48000 });
      const target = context.createMediaStreamDestination();
      const buffer = await context.decodeAudioData(new Uint8Array(fixture).buffer);
      probe.speak = () => {
        const source = context.createBufferSource(); inputSources.add(source); source.buffer = buffer;
        source.connect(target); source.start(); probe.inputStarted.push(performance.now());
      };
      for (const track of target.stream.getTracks()) {
        const stop = track.stop.bind(track);
        track.stop = () => { probe.trackStops++; stop(); void context.close(); };
      }
      return target.stream;
    };
    window.greyfield?.on("neko:event", (event) => {
      if (event.type === "audio") probe.audio.push(Array.from(event.data));
      if (event.type === "interrupt") probe.userActivity.push(performance.now());
      if (event.type === "message" && event.data.type === "user_transcript") probe.transcript.push(String(event.data.text));
    });
    setInterval(() => { if (Number(document.querySelector<HTMLElement>(".live2d-stage-view")?.dataset.mouthOpen ?? 0) > .05) probe.mouthSeen = true; }, 40);
  }, Array.from(await readFile(fixturePath)));

  await controls.getByRole("button", { name: "打开设置", exact: true }).click();
  const nav = settings.getByRole("button", { name: "插件广场", exact: true });
  await nav.waitFor();
  const navBounds = await nav.boundingBox();
  const viewport = await settings.evaluate(() => ({ width: innerWidth, height: innerHeight }));
  if (!navBounds || navBounds.y < 0 || navBounds.y + navBounds.height > viewport.height) throw new Error("Plugins navigation is not visible from the fresh Settings surface.");
  await settings.screenshot({ path: join(artifacts, "settings-entry.png") });
  await nav.click();
  await settings.getByTestId("neko-start").waitFor();
  await settings.screenshot({ path: join(artifacts, "plugin-before-start.png") });
  await settings.getByTestId("neko-start").click();
  await settings.locator('[data-testid="neko-plugin-status"][data-status="ready"]').waitFor({ timeout: 120_000 });
  await pet.waitForFunction(() => typeof (window as any).__nekoProbe.speak === "function");
  await pet.evaluate(() => (window as any).__nekoProbe.speak());
  await pet.waitForFunction(() => (window as any).__nekoProbe.active.size > 0 && (window as any).__nekoProbe.transcript.length >= 1, undefined, { timeout: 40_000 });
  await settings.screenshot({ path: join(artifacts, "plugin-conversation.png") });
  await pet.screenshot({ path: join(artifacts, "pet-speaking.png") });
  await pet.evaluate(() => { (window as any).__nekoProbe.activeAtSecondInput = (window as any).__nekoProbe.active.size; (window as any).__nekoProbe.speak(); });
  await pet.waitForFunction(() => (window as any).__nekoProbe.transcript.length >= 2, undefined, { timeout: 40_000 });
  await pet.waitForFunction(() => { const p = (window as any).__nekoProbe; return p.stops.some((time: number) => time > p.inputStarted[1]); }, undefined, { timeout: 15_000 });
  await pet.waitForFunction(() => { const p = (window as any).__nekoProbe; return p.starts.some((time: number) => time > p.stops[0] + 500); }, undefined, { timeout: 30_000 });
  await settings.getByTestId("neko-stop").click();
  await settings.locator('[data-testid="neko-plugin-status"][data-status="stopped"]').waitFor({ timeout: 15_000 });
  await pet.waitForFunction(() => (window as any).__nekoProbe.trackStops > 0 && (window as any).__nekoProbe.active.size === 0);
  const probe = await pet.evaluate(() => { const { active, speak, ...rest } = (window as any).__nekoProbe; return { ...rest, activeCount: active.size }; });
  const audio = Buffer.concat(probe.audio.map((chunk: number[]) => Buffer.from(chunk)));
  const header = Buffer.alloc(44); header.write("RIFF"); header.writeUInt32LE(36 + audio.length, 4); header.write("WAVEfmt ", 8);
  header.writeUInt32LE(16, 16); header.writeUInt16LE(1, 20); header.writeUInt16LE(1, 22); header.writeUInt32LE(48000, 24); header.writeUInt32LE(96000, 28);
  header.writeUInt16LE(2, 32); header.writeUInt16LE(16, 34); header.write("data", 36); header.writeUInt32LE(audio.length, 40);
  await writeFile(join(artifacts, "original-neko-reply.wav"), Buffer.concat([header, audio]));
  delete probe.audio;
  result = { ok: true, simulatedMicrophone: true, realOfficialUpstream: true, audioBytes: audio.length, probe,
    bounds: await app.evaluate(({ BrowserWindow, screen }) => ({ displays: screen.getAllDisplays().map((display) => display.bounds), windows: BrowserWindow.getAllWindows().map((window) => ({ title: window.getTitle(), visible: window.isVisible(), bounds: window.getBounds() })) })) };
  await settings.screenshot({ path: join(artifacts, "plugin-stopped.png") }); await chat.screenshot({ path: join(artifacts, "chat-transcripts.png") });
} catch (error) {
  result = { ok: false, error: error instanceof Error ? error.message : String(error) };
  const settings = await roleWindow(app, "settings"); await settings.screenshot({ path: join(artifacts, "failure.png") });
  result.state = await settings.locator('[data-testid="neko-plugin-status"]').textContent().catch(() => "unknown");
  process.exitCode = 1;
} finally {
  await app.close(); await writeFile(join(artifacts, "acceptance.json"), JSON.stringify(result, null, 2)); console.log(JSON.stringify(result, null, 2));
}
async function roleWindow(app: ElectronApplication, role: string) {
  const until = Date.now() + 15_000;
  while (Date.now() < until) {
    for (const page of app.windows()) if (new URL(page.url()).searchParams.get("window") === role) { await page.waitForLoadState(); return page; }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`Missing ${role} window`);
}
