import { contextBridge, ipcRenderer } from "electron";
import { createGreyfieldDesktopApi } from "./desktop-api";

export { createGreyfieldDesktopApi, greyfieldDesktopApiContract, type GreyfieldDesktopApi } from "./desktop-api";

if (typeof process !== "undefined" && process.versions.electron) {
  contextBridge.exposeInMainWorld(
    "greyfield",
    createGreyfieldDesktopApi({
      send: (channel, payload) => ipcRenderer.send(channel, payload),
      on: (channel, handler) => {
        ipcRenderer.on(channel, handler);
        return () => ipcRenderer.removeListener(channel, handler);
      }
    })
  );
}
