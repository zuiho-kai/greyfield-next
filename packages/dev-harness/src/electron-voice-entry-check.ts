import { _electron as electron, type ElectronApplication } from "playwright";
import { readFile, mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const workspace = fileURLToPath(new URL("../../..", import.meta.url));
const artifacts = process.env.GREYFIELD_NEKO_ARTIFACT_PATH ?? join(workspace, ".cache", "voice-entry");
const config = process.env.GREYFIELD_NEKO_CONFIG_PATH;
if (!config || !process.env.GREYFIELD_NEKO_SOURCE_PATH) throw new Error("Provide the private config and installed official runtime paths.");
await mkdir(artifacts, { recursive: true });
const configPath = join(artifacts, "greyfield.config.json");
await writeFile(configPath, await readFile(config));
const app = await electron.launch({ cwd: join(workspace, "apps/desktop"), args: [join(workspace, "apps/desktop/dist-main/index.mjs")], env: {
  ...process.env, GREYFIELD_CONFIG_PATH: configPath, GREYFIELD_PROJECT_ROOT: workspace, GREYFIELD_USER_DATA_PATH: join(artifacts, "user-data")
} });
let result: Record<string, unknown> = {};
try {
  await app.evaluate(({ ipcMain }) => {
    (globalThis as any).__voiceEntry = { starts: 0, legacyAudio: 0 };
    ipcMain.on("neko:command", (_event, command) => { if (command.action === "start") (globalThis as any).__voiceEntry.starts++; });
    ipcMain.on("runtime:input", (_event, input) => { if (input.type === "audio.chunk") (globalThis as any).__voiceEntry.legacyAudio++; });
  });
  const pet = await roleWindow(app, "pet");
  await pet.evaluate(() => {
    // Silent microphone fixture: this check exercises real connection UI, not speech quality.
    navigator.mediaDevices.getUserMedia = async () => {
      const context = new AudioContext();
      const stream = context.createMediaStreamDestination().stream;
      for (const track of stream.getTracks()) { const stop = track.stop.bind(track); track.stop = () => { stop(); void context.close(); }; }
      return stream;
    };
  });
  const controls = await roleWindow(app, "controls");
  const settings = await roleWindow(app, "settings");
  const chat = await roleWindow(app, "chat");
  await controls.getByRole("button", { name: "打开设置", exact: true }).click();
  await settings.locator(".settings-nav__button--chat").click();
  const button = chat.getByTestId("chat-voice-input-button");
  await button.locator("span", { hasText: "开始语音" }).waitFor();
  await chat.screenshot({ path: join(artifacts, "before.png") });
  await button.click();
  await chat.locator('[data-testid="chat-voice-input-button"][data-neko-status="starting"]:disabled').waitFor();
  await verifyControlsPending("starting");
  await button.evaluate((element: HTMLButtonElement) => { element.click(); element.click(); });
  await chat.screenshot({ path: join(artifacts, "starting.png") });
  await chat.locator('[data-testid="chat-voice-input-button"][data-neko-status="connecting"]:disabled').waitFor({ timeout: 90_000 });
  await verifyControlsPending("connecting");
  await button.evaluate((element: HTMLButtonElement) => { element.click(); element.click(); });
  await chat.screenshot({ path: join(artifacts, "connecting.png") });
  await chat.locator('[data-testid="chat-voice-input-button"][data-neko-status="ready"]').waitFor({ timeout: 60_000 });
  await controls.locator('button[data-neko-status="ready"]:enabled').waitFor();
  const layout = await button.evaluate((element) => {
    const label = element.querySelectorAll("span")[1]!;
    const range = document.createRange(); range.selectNodeContents(label);
    const box = element.getBoundingClientRect();
    return { label: label.textContent, lines: range.getClientRects().length, width: innerWidth, visible: box.x >= 0 && box.right <= innerWidth && box.bottom <= innerHeight };
  });
  await chat.screenshot({ path: join(artifacts, "ready.png") });
  await button.click();
  await chat.locator('[data-testid="chat-voice-input-button"][data-neko-status="stopped"]').waitFor({ timeout: 15_000 });
  await chat.screenshot({ path: join(artifacts, "stopped.png") });
  const commands = await app.evaluate(() => (globalThis as any).__voiceEntry);
  if (commands.starts !== 1 || commands.legacyAudio !== 0 || layout.lines !== 1 || !layout.visible) throw new Error(JSON.stringify({ commands, layout }));
  result = { ok: true, realOfficialConnection: true, silentMicrophoneFixture: true, controlsPendingDisabled: true, controlsStopAvailable: true, commands, layout,
    bounds: await app.evaluate(({ BrowserWindow, screen }) => ({ displays: screen.getAllDisplays().map((display) => display.bounds), windows: BrowserWindow.getAllWindows().map((window) => ({ title: window.getTitle(), visible: window.isVisible(), bounds: window.getBounds() })) })) };
  async function verifyControlsPending(status: "starting" | "connecting") {
    const mic = controls.locator(`button[data-neko-status="${status}"]:disabled`);
    await mic.waitFor();
    if (!await controls.locator(".desktop-control-button--stop").isEnabled()) throw new Error(`Controls Stop disabled during ${status}`);
    await mic.evaluate((element: HTMLButtonElement) => { element.click(); element.click(); });
    await controls.screenshot({ path: join(artifacts, `controls-${status}.png`) });
  }
} catch (error) {
  result = { ok: false, error: String(error) }; process.exitCode = 1;
  await (await roleWindow(app, "chat")).screenshot({ path: join(artifacts, "failure.png") });
} finally {
  await app.close(); await writeFile(join(artifacts, "acceptance.json"), JSON.stringify(result, null, 2)); console.log(JSON.stringify(result));
}
async function roleWindow(app: ElectronApplication, role: string) {
  const until = Date.now() + 15_000;
  while (Date.now() < until) {
    for (const page of app.windows()) if (new URL(page.url()).searchParams.get("window") === role) { await page.waitForLoadState(); return page; }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`Missing ${role} window`);
}
