import { _electron as electron } from "playwright";
import { readFile, mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { defaultGreyfieldConfig } from "@greyfield/persistence/config-schema";

// UI-only replay of an observed local result; never starts the voice service or launches Notepad.
const workspace = fileURLToPath(new URL("../../..", import.meta.url));
const artifacts = join(workspace, ".cache", "note-receipt-replay");
const note = JSON.parse(await readFile(process.env.GREYFIELD_NOTE_RESULT!, "utf8"));
const supplied = JSON.parse(await readFile(process.env.GREYFIELD_NEKO_CONFIG_PATH!, "utf8"));
await mkdir(artifacts, { recursive: true });
const configPath = join(artifacts, "greyfield.config.json");
await writeFile(configPath, JSON.stringify({ ...defaultGreyfieldConfig, live2d: supplied.live2d, ui: { ...defaultGreyfieldConfig.ui, locale: "zh-CN" } }));
const app = await electron.launch({ cwd: join(workspace, "apps/desktop"), args: [join(workspace, "apps/desktop/dist-main/index.mjs")], env: {
  ...process.env, GREYFIELD_CONFIG_PATH: configPath, GREYFIELD_PROJECT_ROOT: workspace, GREYFIELD_USER_DATA_PATH: join(artifacts, "user-data")
} });
let result: Record<string, unknown> = {};
try {
  async function windowRole(role: string) {
    for (let i = 0; i < 150; i++) {
      const page = app.windows().find((page) => new URL(page.url()).searchParams.get("window") === role);
      if (page) { await page.waitForLoadState(); return page; }
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    throw new Error(`Missing ${role}`);
  }
  const controls = await windowRole("controls"), settings = await windowRole("settings"), chat = await windowRole("chat");
  await controls.getByRole("button", { name: "打开设置", exact: true }).click();
  await settings.locator(".settings-nav__button--chat").click();
  await app.evaluate(({ BrowserWindow }, note) => {
    const events = [
      { type: "state", state: { status: "ready", message: "connected" } },
      { type: "message", data: { type: "user_transcript", text: "新建贾维斯验收笔记，并用记事本打开。" } },
      { type: "message", data: { type: "system", data: "turn end" } },
      { type: "research", name: "create_desktop_note", status: "done", message: note.message, sources: [] },
      { type: "message", data: { type: "gemini_response", text: note.spokenText, isNewMessage: true } },
      { type: "message", data: { type: "system", data: "turn end" } }
    ];
    for (const event of events) for (const window of BrowserWindow.getAllWindows()) {
      if (new URL(window.webContents.getURL()).searchParams.get("window") === "chat") window.webContents.send("neko:event", event);
    }
  }, note);
  const receipt = chat.getByText(note.message, { exact: true });
  await receipt.waitFor();
  await chat.getByText("把这段内容记成笔记", { exact: false }).waitFor();
  const layout = await receipt.evaluate((element, path) => {
    const box = element.getBoundingClientRect();
    return { completePath: element.textContent?.includes(path), visible: box.x >= 0 && box.right <= innerWidth && box.top >= 0 && box.bottom <= innerHeight,
      noOverflow: document.documentElement.scrollWidth <= innerWidth && element.scrollWidth <= element.clientWidth, width: innerWidth };
  }, note.path);
  if (!layout.completePath || !layout.visible || !layout.noOverflow) throw new Error(JSON.stringify(layout));
  await chat.screenshot({ path: join(artifacts, "chat-note-receipt.png") });
  result = { ok: true, uiReplayOnly: true, layout, receipt: await receipt.textContent() };
} catch (error) { result = { ok: false, error: String(error) }; process.exitCode = 1; }
finally { await writeFile(join(artifacts, "acceptance.json"), JSON.stringify(result, null, 2)); await app.close(); console.log(JSON.stringify(result)); }
