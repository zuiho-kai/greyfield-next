import { _electron as electron, type ElectronApplication } from "playwright";
import { readFile, mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../../..", import.meta.url));
const artifacts = join(root, ".cache", "cascade-acceptance");
const config = process.env.GREYFIELD_CASCADE_CONFIG_PATH ?? join(root, ".cache", "provider-probe", "greyfield.preview.config.json");
await mkdir(artifacts, { recursive: true });
const fixtures = await Promise.all(["hello", "interrupt", "example"].map(async (name) => Array.from(await readFile(join(root, ".cache", "provider-probe", "fixtures", `${name}.wav`)))));
const env: Record<string, string> = { ...Object.fromEntries(Object.entries(process.env).filter((entry): entry is [string, string] => entry[1] !== undefined)), GREYFIELD_CASCADE_VOICE: "1", GREYFIELD_CONFIG_PATH: config,
  GREYFIELD_PROJECT_ROOT: root, GREYFIELD_USER_DATA_PATH: join(artifacts, `user-data-${Date.now()}`) };
delete env.ELECTRON_RUN_AS_NODE;
const app = await electron.launch({ cwd: join(root, "apps", "desktop"), args: [join(root, "apps", "desktop", "dist-main", "index.mjs")], env });
let result: Record<string, unknown> = {};
try {
  const pet = await roleWindow(app, "pet"); const controls = await roleWindow(app, "controls");
  const chat = await roleWindow(app, "chat"); const settings = await roleWindow(app, "settings");
  pet.on("console", (message) => { if (message.text().startsWith("CASCADE ")) console.log(message.text()); });
  await pet.evaluate(() => {
    const p: any = (window as any).__cascadeProbe = { events: [], starts: [], stops: [], ended: [], inputs: [], audio: [], active: new Set(), trackStops: 0, mouthSeen: false };
    const inputs = new WeakSet<AudioBufferSourceNode>();
    const originalStart = AudioBufferSourceNode.prototype.start;
    const originalStop = AudioBufferSourceNode.prototype.stop;
    AudioBufferSourceNode.prototype.start = function (...args) {
      if (!inputs.has(this)) {
        p.starts.push(performance.now()); p.active.add(this);
        this.addEventListener("ended", () => { p.active.delete(this); p.ended.push(performance.now()); });
      }
      return originalStart.apply(this, args);
    };
    AudioBufferSourceNode.prototype.stop = function (...args) {
      if (!inputs.has(this)) { p.stops.push(performance.now()); p.active.delete(this); }
      return originalStop.apply(this, args);
    };
    navigator.mediaDevices.getUserMedia = async () => {
      const context = new AudioContext({ sampleRate: 48000 }); const destination = context.createMediaStreamDestination();
      p.speak = async (fixture: number[]) => {
        const source = context.createBufferSource(); inputs.add(source);
        source.buffer = await context.decodeAudioData(new Uint8Array(fixture).buffer);
        source.connect(destination); source.start();
        const samples = source.buffer.getChannelData(0); const frame = Math.round(source.buffer.sampleRate * .02);
        let speechEndMs = 0;
        for (let i = 0; i < samples.length; i += frame) {
          const chunk = samples.subarray(i, i + frame);
          const rms = Math.sqrt(chunk.reduce((sum, value) => sum + value * value, 0) / chunk.length);
          if (rms >= .02) speechEndMs = (i + chunk.length) / source.buffer.sampleRate * 1000;
        }
        p.inputs.push({ start: performance.now(), durationMs: source.buffer.duration * 1000, speechEndMs });
      };
      for (const track of destination.stream.getTracks()) {
        const stop = track.stop.bind(track);
        track.stop = () => { p.trackStops++; stop(); void context.close(); };
      }
      return destination.stream;
    };
    window.greyfield?.on("runtime:event", (event) => {
      const { data, ...safe } = event as any;
      p.events.push({ ...safe, at: performance.now() });
      if (["transcript.final", "assistant.text.final", "assistant.tool.status", "error"].includes(event.type)) console.log("CASCADE " + JSON.stringify(safe));
      if (event.type === "assistant.audio.chunk") p.audio.push(Array.from(event.data));
    });
    setInterval(() => { const mouth = Number(document.querySelector<HTMLElement>(".live2d-stage-view")?.dataset.mouthOpen ?? 0); p.maxMouth = Math.max(p.maxMouth ?? 0, mouth); if (mouth > .05) p.mouthSeen = true; }, 40);
  });
  await controls.getByRole("button", { name: "开始连续语音（ASR + LLM + TTS）", exact: true }).waitFor();
  await controls.screenshot({ path: join(artifacts, "controls-before.png") });
  await controls.getByRole("button", { name: "开始连续语音（ASR + LLM + TTS）", exact: true }).click();
  await pet.waitForFunction(() => typeof (window as any).__cascadeProbe.speak === "function");
  await pet.evaluate((fixture) => (window as any).__cascadeProbe.speak(fixture), fixtures[0]!);
  await pet.waitForFunction(() => (window as any).__cascadeProbe.active.size > 0, undefined, { timeout: 45000 });
  await pet.screenshot({ path: join(artifacts, "pet-speaking.png") });
  await pet.evaluate((fixture) => { const p = (window as any).__cascadeProbe; p.activeAtBarge = p.active.size; return p.speak(fixture); }, fixtures[1]!);
  await pet.waitForFunction(() => { const p = (window as any).__cascadeProbe; return p.events.filter((e: any) => e.type === "transcript.final").length >= 2 && p.starts.some((at: number) => at > p.inputs[1].start + p.inputs[1].durationMs); }, undefined, { timeout: 45000 });
  await pet.waitForFunction(() => (window as any).__cascadeProbe.active.size === 0, undefined, { timeout: 30000 });
  await pet.evaluate((fixture) => (window as any).__cascadeProbe.speak(fixture), fixtures[2]!);
  await pet.waitForFunction(() => { const p = (window as any).__cascadeProbe; return p.events.some((e: any) => e.type === "assistant.text.final" && e.at > p.inputs[2].start && e.text.includes("资料来源")); }, undefined, { timeout: 90000 });
  await controls.getByRole("button", { name: "打开设置", exact: true }).click();
  await settings.locator(".settings-nav__button--chat").click();
  await chat.screenshot({ path: join(artifacts, "chat-result.png") });
  await controls.getByRole("button", { name: "结束连续语音", exact: true }).click();
  await pet.waitForFunction(() => { const p = (window as any).__cascadeProbe; return p.trackStops > 0 && p.active.size === 0; });
  const probe = await pet.evaluate(() => { const { active, speak, ...rest } = (window as any).__cascadeProbe; return { ...rest, activeCount: active.size }; });
  for (const [index, audio] of probe.audio.entries()) await writeFile(join(artifacts, `reply-${index}.mp3`), Buffer.from(audio));
  delete probe.audio;
  const stopAt = probe.stops.find((at: number) => at > probe.inputs[1].start);
  if (!stopAt || stopAt - probe.inputs[1].start > 800 || probe.activeAtBarge < 1 || !probe.mouthSeen) throw new Error("Missing fast barge-in or real mouth/playback evidence");
  const latency = probe.inputs.map((input: any, index: number) => {
    const next = probe.inputs[index + 1]?.start ?? Infinity;
    const first = (type: string) => probe.events.find((event: any) => event.type === type && event.at > input.start && event.at < next)?.at;
    const playback = probe.starts.find((at: number) => at > input.start + input.speechEndMs && at < next);
    return { transcript: probe.events.find((event: any) => event.type === "transcript.final" && event.at > input.start && event.at < next)?.text,
      speechEndToTranscriptMs: first("transcript.final") - input.start - input.speechEndMs,
      speechEndToFirstTextMs: first("assistant.text.delta") - input.start - input.speechEndMs,
      speechEndToPlaybackMs: playback - input.start - input.speechEndMs,
      fixtureEndToPlaybackMs: playback - input.start - input.durationMs };
  });
  result = { ok: true, syntheticMicrophone: true, realProviders: true, bargeInMs: stopAt - probe.inputs[1].start, latency, probe,
    bounds: await app.evaluate(({ BrowserWindow, screen }) => ({ displays: screen.getAllDisplays().map((d) => d.bounds), windows: BrowserWindow.getAllWindows().map((w) => ({ title: w.getTitle(), visible: w.isVisible(), bounds: w.getBounds() })) })) };
} catch (error) {
  const pet = await roleWindow(app, "pet");
  result = { ok: false, error: String(error), probe: await pet.evaluate(() => { const { active, speak, audio, ...rest } = (window as any).__cascadeProbe ?? {}; return { ...rest, audioBytes: audio?.reduce((n: number, a: number[]) => n + a.length, 0), activeCount: active?.size }; }) };
  await pet.screenshot({ path: join(artifacts, "failure.png") }); process.exitCode = 1;
} finally {
  await writeFile(join(artifacts, "acceptance.json"), JSON.stringify(result, null, 2));
  await app.close(); console.log(JSON.stringify({ ...result, probe: "See acceptance.json" }));
}
async function roleWindow(app: ElectronApplication, role: string) {
  const until = Date.now() + 15000;
  while (Date.now() < until) {
    for (const page of app.windows()) if (new URL(page.url()).searchParams.get("window") === role) { await page.waitForLoadState(); return page; }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`Missing ${role} window`);
}
