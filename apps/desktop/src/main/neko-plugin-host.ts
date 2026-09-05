import { BrowserWindow, ipcMain } from "electron";
import { join } from "node:path";
import { NekoPlugin, type NekoPluginEvent } from "../../../../packages/neko-plugin/src/index";

export function registerNekoPluginHost(userDataPath: string): NekoPlugin {
  const broadcast = (event: NekoPluginEvent) => {
    for (const window of BrowserWindow.getAllWindows()) window.webContents.send("neko:event", event);
  };
  const plugin = new NekoPlugin({ root: join(userDataPath, "plugins", "neko"), sourcePath: process.env.GREYFIELD_NEKO_SOURCE_PATH, emit: broadcast });
  ipcMain.on("neko:command", (_event, payload: { action: string; message?: string }) => {
    if (payload.action === "status") broadcast({ type: "state", state: plugin.getState() });
    if (payload.action === "install") void plugin.install();
    if (payload.action === "start") void plugin.start();
    if (payload.action === "stop") void plugin.stop().then(() => {
      if (payload.message) broadcast({ type: "state", state: { status: "error", message: payload.message } });
    });
  });
  ipcMain.on("neko:audio", (_event, payload: { data: Uint8Array; sampleRate: number }) => plugin.sendPcm(payload.data, payload.sampleRate));
  return plugin;
}
