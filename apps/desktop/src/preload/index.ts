import { contextBridge, ipcRenderer } from "electron";
import type { DesktopIpcEventChannel, DesktopIpcEventMap, DesktopIpcRequestChannel, DesktopIpcRequestMap } from "../shared/ipc";

export interface GreyfieldDesktopApi {
  send<Channel extends DesktopIpcRequestChannel>(
    channel: Channel,
    payload: DesktopIpcRequestMap[Channel]
  ): void;
  on<Channel extends DesktopIpcEventChannel>(
    channel: Channel,
    handler: (payload: DesktopIpcEventMap[Channel]) => void
  ): () => void;
}

interface IpcRendererLike {
  send(channel: string, payload: unknown): void;
  on(channel: string, handler: (event: unknown, payload: unknown) => void): () => void;
}

export const greyfieldDesktopApiContract: Record<keyof GreyfieldDesktopApi, string> = {
  send: "typed one-way command to the Electron main process",
  on: "typed subscription to main-process events"
};

export function createGreyfieldDesktopApi(ipc: IpcRendererLike): GreyfieldDesktopApi {
  return {
    send(channel, payload) {
      ipc.send(channel, payload);
    },
    on(channel, handler) {
      return ipc.on(channel, (_event, payload) => {
        handler(payload as DesktopIpcEventMap[typeof channel]);
      });
    }
  };
}

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
