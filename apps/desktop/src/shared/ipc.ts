import type { RuntimeInputEvent, RuntimeOutputEvent } from "@greyfield/core-runtime";
import type { GreyfieldConfig, GreyfieldConfigPatch } from "@greyfield/persistence/config-schema";
import type { RendererGreyfieldConfig } from "./renderer-config";

export interface DesktopIpcRequestMap {
  "runtime:input": RuntimeInputEvent;
  "provider:test-llm": {};
  "settings:update": GreyfieldConfigPatch;
  "window:set-click-through": { enabled: boolean };
  "window:set-hit-test": { passthrough: boolean; reason: "transparent-area" | "model-pass-through" | "model-hit" };
  "window:set-shape": {
    rects: Array<{ x: number; y: number; width: number; height: number }>;
    reason: "model-mask" | "drag-full-window" | "reset";
  };
  "window:set-locked": { locked: boolean };
  "window:drag-start": { screenX: number; screenY: number };
  "window:drag-move": { screenX: number; screenY: number };
  "window:drag-end": {};
  "window:show-pet-menu": { screenX: number; screenY: number };
  "window:open-settings": {};
  "window:open-chat": {};
  "stage:choose-model": {};
  "stage:load-model": { modelPath: string };
}

export interface DesktopIpcEventMap {
  "runtime:event": RuntimeOutputEvent;
  "provider:test-llm-result": {
    ok: boolean;
    message: string;
    firstToken?: string;
  };
  "settings:changed": RendererGreyfieldConfig;
  "window:state": {
    modelPassThrough: boolean;
    locked: boolean;
  };
  "stage:model-info": {
    modelPath: string;
    expressions: string[];
    motions: Record<string, number>;
  };
  "log:line": {
    level: "debug" | "info" | "warn" | "error";
    message: string;
    createdAt: string;
  };
}

export type DesktopIpcRequestChannel = keyof DesktopIpcRequestMap;
export type DesktopIpcEventChannel = keyof DesktopIpcEventMap;
