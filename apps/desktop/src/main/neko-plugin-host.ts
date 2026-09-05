import { app, BrowserWindow, ipcMain, net } from "electron";
import { spawn } from "node:child_process";
import { join } from "node:path";
import type { GreyfieldConfig } from "@greyfield/persistence/config-schema";
import { createNekoResearchToolsFactory } from "../../../../packages/neko-plugin/src/research-runtime";
import { withDesktopNoteTool } from "../../../../packages/neko-plugin/src/desktop-tools";
import { NekoPlugin, type NekoPluginEvent } from "../../../../packages/neko-plugin/src/index";

export function registerNekoPluginHost(userDataPath: string, interruptReply: () => void, getConfig: () => GreyfieldConfig | undefined): NekoPlugin {
  const broadcast = (event: NekoPluginEvent) => {
    for (const window of BrowserWindow.getAllWindows()) window.webContents.send("neko:event", event);
  };
  const createResearchTools = createNekoResearchToolsFactory({ profilePath: join(userDataPath, "chrome-voice-research"),
      tracePath: process.env.GREYFIELD_BROWSER_TRACE_PATH, getConfig,
      fetch: (input, init) => net.fetch(input instanceof URL ? input.href : input, init), emit: broadcast });
  const plugin = new NekoPlugin({ root: join(userDataPath, "plugins", "neko"), sourcePath: process.env.GREYFIELD_NEKO_SOURCE_PATH,
    createBrowserTools: () => withDesktopNoteTool(createResearchTools(), { documentsPath: app.getPath("documents"),
      openInNotepad: async (path, signal) => {
        signal.throwIfAborted();
        if (process.platform !== "win32") throw new Error("当前动作需要 Windows 记事本。");
        const executable = join(process.env.SystemRoot || "C:\\Windows", "System32", "notepad.exe");
        const child = spawn(executable, [path], { shell: false, detached: true, stdio: "ignore", windowsHide: false });
        await new Promise<void>((resolve, reject) => { child.once("error", reject); child.once("spawn", resolve); });
        child.unref();
      } }), emit: broadcast });
  ipcMain.on("neko:command", (_event, payload: { action: string; message?: string }) => {
    if (payload.action === "status") broadcast({ type: "state", state: plugin.getState() });
    if (payload.action === "install") void plugin.install();
    if (payload.action === "start") { interruptReply(); void plugin.start(); }
    if (payload.action === "stop") void (payload.message ? plugin.reportError(payload.message) : plugin.stop());
    if (payload.action === "user-activity") plugin.interruptResearch();
  });
  ipcMain.on("neko:audio", (_event, payload: { data: Uint8Array; sampleRate: number }) => plugin.sendPcm(payload.data, payload.sampleRate));
  return plugin;
}
