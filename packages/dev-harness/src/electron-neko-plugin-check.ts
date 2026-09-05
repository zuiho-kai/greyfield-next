import { _electron as electron, type ElectronApplication } from "playwright";
import { access, readFile, mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { defaultGreyfieldConfig } from "@greyfield/persistence/config-schema";

const workspace = fileURLToPath(new URL("../../..", import.meta.url));
const artifacts = process.env.GREYFIELD_NEKO_ARTIFACT_PATH ?? join(workspace, ".cache", "neko-plugin-acceptance");
const source = process.env.GREYFIELD_NEKO_SOURCE_PATH;
const configSource = process.env.GREYFIELD_NEKO_CONFIG_PATH;
const fixturePath = process.env.GREYFIELD_NEKO_CHECK_AUDIO;
const uiOnly = process.env.GREYFIELD_NEKO_UI_ONLY === "1";
const cancelOnly = process.env.GREYFIELD_NEKO_BROWSER_CHECK === "interrupt";
const browserCheck = process.env.GREYFIELD_NEKO_BROWSER_CHECK === "1" || cancelOnly;
const noteCheck = process.env.GREYFIELD_NEKO_NOTE_CHECK === "1";
const bargeFixturePath = process.env.GREYFIELD_NEKO_BARGE_AUDIO;
process.env.PW_TEST_SCREENSHOT_NO_FONTS_READY = "1";
if (!configSource || (!fixturePath && !uiOnly)) throw new Error("Set GREYFIELD_NEKO_CONFIG_PATH and GREYFIELD_NEKO_CHECK_AUDIO; optional GREYFIELD_NEKO_SOURCE_PATH reuses an official checkout.");
await mkdir(artifacts, { recursive: true });
const suppliedConfig = JSON.parse(await readFile(configSource, "utf8"));
const configPath = uiOnly ? configSource : join(artifacts, "greyfield.config.json");
if (!uiOnly) await writeFile(configPath, JSON.stringify({ ...defaultGreyfieldConfig, live2d: suppliedConfig.live2d,
  ...(browserCheck ? { provider: suppliedConfig.provider } : {}),
  window: { ...defaultGreyfieldConfig.window, x: 130, y: 100, modelPassThrough: false }, ui: { ...defaultGreyfieldConfig.ui, locale: "zh-CN" } }));
const app = await electron.launch({ cwd: join(workspace, "apps", "desktop"), args: [join(workspace, "apps", "desktop", "dist-main", "index.mjs")],
  env: { ...process.env, GREYFIELD_CONFIG_PATH: configPath, GREYFIELD_PROJECT_ROOT: workspace,
    GREYFIELD_USER_DATA_PATH: join(artifacts, "user-data"), ...(source ? { GREYFIELD_NEKO_SOURCE_PATH: source } : {}) } });
let result: Record<string, unknown> = {};
let noteEvidence: Record<string, unknown> | undefined;
try {
  const pet = await roleWindow(app, "pet"); const controls = await roleWindow(app, "controls");
  const settings = await roleWindow(app, "settings"); const chat = await roleWindow(app, "chat");
  if (browserCheck || noteCheck) pet.on("console", (message) => { if (message.text().startsWith("NEKO_BROWSER ")) console.log(message.text()); });
  if (!uiOnly) await pet.evaluate((fixture) => {
    const probe: any = (window as any).__nekoProbe = { research: [], messages: [], starts: [] as number[], stops: [] as number[], ended: [] as number[], transcript: [] as string[], audio: [] as number[][], trackStops: 0, mouthSeen: false, inputStarted: [] as number[], inputEnded: [] as number[], active: new Set(), userActivity: [] as number[] };
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
      probe.speak = async (replacement?: number[]) => {
        const source = context.createBufferSource(); inputSources.add(source); source.buffer = replacement ? await context.decodeAudioData(new Uint8Array(replacement).buffer) : buffer;
        source.onended = () => probe.inputEnded.push(performance.now());
        source.connect(target); source.start(); probe.inputStarted.push(performance.now());
      };
      for (const track of target.stream.getTracks()) {
        const stop = track.stop.bind(track);
        track.stop = () => { probe.trackStops++; stop(); void context.close(); };
      }
      return target.stream;
    };
    window.greyfield?.on("neko:event", (event) => {
      if (event.type === "research") probe.research.push({ ...event, at: performance.now() });
      if (event.type === "message") probe.messages.push({ ...event.data, at: performance.now() });
      if (event.type === "research" || (event.type === "message" && ["user_transcript", "gemini_response", "auto_close_mic"].includes(String(event.data.type)))) console.log("NEKO_BROWSER " + JSON.stringify(event));
      if (event.type === "audio") probe.audio.push(Array.from(event.data));
      if (event.type === "interrupt") probe.userActivity.push(performance.now());
      if (event.type === "message" && event.data.type === "user_transcript") probe.transcript.push(String(event.data.text));
    });
    setInterval(() => { if (Number(document.querySelector<HTMLElement>(".live2d-stage-view")?.dataset.mouthOpen ?? 0) > .05) probe.mouthSeen = true; }, 40);
  }, Array.from(await readFile(fixturePath!)));

  await controls.getByRole("button", { name: "打开设置", exact: true }).click();
  const nav = settings.getByRole("button", { name: "插件广场", exact: true });
  await nav.waitFor();
  const navBounds = await nav.boundingBox();
  const viewport = await settings.evaluate(() => ({ width: innerWidth, height: innerHeight }));
  if (!navBounds || navBounds.y < 0 || navBounds.y + navBounds.height > viewport.height) throw new Error("Plugins navigation is not visible from the fresh Settings surface.");
  await settings.screenshot({ path: join(artifacts, "settings-entry.png") });
  await nav.click();
  if (await settings.getByTestId("neko-install").isVisible()) {
    await settings.screenshot({ path: join(artifacts, "plugin-install.png") });
    await settings.getByTestId("neko-install").click();
    console.log("Installing pinned official runtime through the ordinary plugin button...");
    await settings.locator('[data-testid="neko-plugin-status"][data-status="stopped"]').waitFor({ timeout: 600_000 });
  }
  await settings.getByTestId("neko-start").waitFor();
  const pluginView = await settings.getByTestId("neko-start").boundingBox();
  if (!pluginView || pluginView.y + pluginView.height > viewport.height || await settings.locator('[data-settings-section="provider"]').isVisible()) throw new Error("Plugin card/actions are not isolated in the first viewport.");
  await settings.screenshot({ path: join(artifacts, "plugin-before-start.png") });
  if (uiOnly) {
    const nativeMic = await pet.evaluate(() => navigator.mediaDevices.getUserMedia.toString().includes("[native code]") && !(window as any).__nekoProbe);
    if (!nativeMic) throw new Error("Preview microphone was overridden.");
    result = { ok: true, previewOnly: true, nativeMicrophone: nativeMic, pluginStatus: await settings.getByTestId("neko-plugin-status").getAttribute("data-status") };
    await settings.screenshot({ path: join(artifacts, "preview-plugin.png") });
  } else {
  await settings.getByTestId("neko-start").click();
  await settings.locator('[data-testid="neko-plugin-status"][data-status="ready"]').waitFor({ timeout: 120_000 });
  await pet.waitForFunction(() => typeof (window as any).__nekoProbe.speak === "function");
  if (browserCheck || noteCheck) await settings.locator('.settings-nav__button--chat').click();
  await pet.evaluate(() => (window as any).__nekoProbe.speak());
  if (noteCheck) {
    await pet.waitForFunction(() => (window as any).__nekoProbe.research.some((event: any) => event.name === "create_desktop_note" && event.status !== "running"), undefined, { timeout: 150_000 });
    const action = await pet.evaluate(() => (window as any).__nekoProbe.research.find((event: any) => event.name === "create_desktop_note" && event.status !== "running"));
    if (action.status === "error") throw new Error(action.message);
    const saved = JSON.parse(action.resultText);
    const text = await readFile(saved.path, "utf8");
    if (saved.status !== "saved_launch_requested" || !/上午(?:十|10)点/.test(text) || !text.includes("语音延迟") || !text.includes("待办")) throw new Error(`Note outcome/content failed: ${JSON.stringify(saved)}`);
    console.log(`NEKO_NOTE_OPEN_REQUESTED ${saved.path}`);
    await pet.waitForFunction(() => { const p = (window as any).__nekoProbe; const done = p.research.find((event: any) => event.name === "create_desktop_note" && event.status === "done"); return p.starts.some((at: number) => at > done.at) && p.messages.some((event: any) => event.type === "gemini_response" && event.at > done.at) && p.messages.some((event: any) => event.type === "system" && event.data === "turn end" && event.at > done.at); }, undefined, { timeout: 90_000 });
    noteEvidence = await pet.evaluate((saved) => {
      const p = (window as any).__nekoProbe;
      const running = p.research.find((event: any) => event.name === "create_desktop_note" && event.status === "running");
      const done = p.research.find((event: any) => event.name === "create_desktop_note" && event.status === "done");
      const firstAudio = p.starts.find((at: number) => at > done.at);
      return { ...saved, inputStartedAt: p.inputStarted[0], inputEndedAt: p.inputEnded[0], transcriptAt: p.messages.find((event: any) => event.type === "user_transcript")?.at,
        toolRunningAt: running.at, toolDoneAt: done.at, firstReplyAudioAt: firstAudio, localActionMs: done.at - running.at,
        userFinishedToActionMs: done.at - p.inputEnded[0], userFinishedToReplyAudioMs: firstAudio - p.inputEnded[0],
        spokenText: p.messages.filter((event: any) => event.type === "gemini_response" && event.at > done.at).map((event: any) => event.text).join("") };
    }, saved);
    await writeFile(join(artifacts, "note-result.json"), JSON.stringify(noteEvidence, null, 2));
    await chat.getByText(saved.message, { exact: true }).waitFor();
    await chat.getByText("把这段内容记成笔记", { exact: false }).waitFor();
    await chat.screenshot({ path: join(artifacts, "voice-note-answer.png"), animations: "disabled" });
    const inspectionRelease = process.env.GREYFIELD_NEKO_INSPECTION_RELEASE;
    if (inspectionRelease) {
      await writeFile(join(artifacts, "inspection-ready.json"), JSON.stringify({ path: saved.path, release: inspectionRelease }));
      console.log(`NEKO_NOTE_INSPECTION_READY ${saved.path}`);
      const deadline = Date.now() + 240_000;
      while (!await access(inspectionRelease).then(() => true, () => false)) {
        if (Date.now() > deadline) throw new Error("Visible Notepad inspection was not acknowledged before timeout.");
        await new Promise((resolve) => setTimeout(resolve, 250));
      }
    }
  } else if (browserCheck) {
    if (!cancelOnly) {
    await pet.waitForFunction(() => (window as any).__nekoProbe.research.some((event: any) => event.status === "error" || (event.status === "done" && event.sources?.length)), undefined, { timeout: 120_000 });
    const researchFailure = await pet.evaluate(() => (window as any).__nekoProbe.research.find((event: any) => event.status === "error")?.message);
    if (researchFailure) throw new Error(researchFailure);
    await pet.waitForFunction(() => { const p = (window as any).__nekoProbe; const read = p.research.find((event: any) => event.status === "done" && event.sources?.length); return p.starts.some((time: number) => time > read.at) && p.messages.some((event: any) => event.type === "system" && event.data === "turn end" && event.at > read.at); }, undefined, { timeout: 90_000 });
    await chat.getByText("资料来源：", { exact: false }).waitFor({ timeout: 5000 });
    await chat.screenshot({ path: join(artifacts, "voice-browser-answer.png"), animations: "disabled" });
    }
    if (bargeFixturePath) {
      await pet.evaluate((cancelOnly) => { const p = (window as any).__nekoProbe; p.researchBeforeRetry = cancelOnly ? 0 : p.research.length; if (!cancelOnly) return p.speak(); }, cancelOnly);
      await pet.waitForFunction(() => { const p = (window as any).__nekoProbe; return p.research.slice(p.researchBeforeRetry).some((event: any) => event.name === "chrome"); }, undefined, { timeout: 70_000 });
      await pet.evaluate((fixture) => { const p = (window as any).__nekoProbe; p.researchAtBarge = p.research.length; return p.speak(fixture); }, Array.from(await readFile(bargeFixturePath)));
      await pet.waitForFunction(() => { const p = (window as any).__nekoProbe; const input = p.inputStarted.at(-1); return p.messages.some((event: any) => event.type === "user_transcript" && event.at > input && event.text.includes("你好")) && p.messages.some((event: any) => event.type === "gemini_response" && event.at > input) && p.starts.some((at: number) => at > input); }, undefined, { timeout: 35_000 });
      const staleResult = await pet.evaluate(() => { const p = (window as any).__nekoProbe; return p.research.slice(p.researchAtBarge).some((event: any) => event.status === "done"); });
      if (staleResult) throw new Error("Interrupted research emitted a late result");
      await chat.screenshot({ path: join(artifacts, "voice-browser-interrupted.png"), animations: "disabled" });
    }
  } else {
  await pet.waitForFunction(() => (window as any).__nekoProbe.active.size > 0 && (window as any).__nekoProbe.transcript.length >= 1, undefined, { timeout: 40_000 });
  await pet.evaluate(() => { (window as any).__nekoProbe.activeAtSecondInput = (window as any).__nekoProbe.active.size; (window as any).__nekoProbe.speak(); });
  await settings.screenshot({ path: join(artifacts, "plugin-conversation.png") });
  await pet.screenshot({ path: join(artifacts, "pet-speaking.png") });
  await pet.waitForFunction(() => (window as any).__nekoProbe.transcript.length >= 2, undefined, { timeout: 40_000 });
  await pet.waitForFunction(() => { const p = (window as any).__nekoProbe; return p.stops.some((time: number) => time > p.inputStarted[1]); }, undefined, { timeout: 15_000 });
  await pet.waitForFunction(() => { const p = (window as any).__nekoProbe; return p.starts.some((time: number) => time > p.stops[0] + 500); }, undefined, { timeout: 30_000 });
  }
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
  result = { ok: true, simulatedMicrophone: true, realOfficialUpstream: true, audioBytes: audio.length, probe, ...(noteEvidence ? { note: noteEvidence } : {}),
    bounds: await app.evaluate(({ BrowserWindow, screen }) => ({ displays: screen.getAllDisplays().map((display) => display.bounds), windows: BrowserWindow.getAllWindows().map((window) => ({ title: window.getTitle(), visible: window.isVisible(), bounds: window.getBounds() })) })) };
  await settings.screenshot({ path: join(artifacts, "plugin-stopped.png") }); await chat.screenshot({ path: join(artifacts, "chat-transcripts.png") });
  }
} catch (error) {
  result = { ok: false, error: error instanceof Error ? error.message : String(error) };
  console.error(result.error);
  const pet = await roleWindow(app, "pet");
  if (!uiOnly) result.probe = await pet.evaluate(() => { const { active, speak, audio, ...rest } = (window as any).__nekoProbe; return { ...rest, activeCount: active.size, audioBytes: audio.reduce((sum: number, chunk: number[]) => sum + chunk.length, 0) }; });
  const settings = await roleWindow(app, "settings"); await settings.screenshot({ path: join(artifacts, "failure.png") });
  result.state = await settings.locator('[data-testid="neko-plugin-status"]').textContent().catch(() => "unknown");
  if (await settings.getByTestId("neko-stop").isVisible()) {
    await settings.getByTestId("neko-stop").click();
    await settings.locator('[data-testid="neko-plugin-status"][data-status="stopped"]').waitFor({ timeout: 15_000 }).catch(() => {});
  }
  process.exitCode = 1;
} finally {
  await writeFile(join(artifacts, uiOnly ? "preview-acceptance.json" : "acceptance.json"), JSON.stringify(result, null, 2));
  await app.close(); console.log(JSON.stringify(result, null, 2));
}
async function roleWindow(app: ElectronApplication, role: string) {
  const until = Date.now() + 15_000;
  while (Date.now() < until) {
    for (const page of app.windows()) if (new URL(page.url()).searchParams.get("window") === role) { await page.waitForLoadState(); return page; }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`Missing ${role} window`);
}
