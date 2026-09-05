import type {
  CharacterPersona,
  MemoryAtom,
  RecallContext,
  RuntimeInputEvent,
  RuntimeImageAttachment,
  RuntimeOutputEvent,
  RuntimeSceneContext,
  SessionTurn,
  SummarySegment
} from "@greyfield/core-runtime";
import type { GreyfieldConfig, GreyfieldConfigPatch } from "@greyfield/persistence/config-schema";
import type { RendererGreyfieldConfig } from "./renderer-config";

export interface DesktopSpeechPlaybackEvent {
  type: "finished" | "error";
  text: string;
  message?: string;
}

export interface DesktopVoiceTestResult {
  ok: boolean;
  message: string;
  text?: string;
  data?: Uint8Array;
}

export interface DesktopMemoryDebugSnapshot {
  threadId: string;
  sessionId: string;
  recentTurns: SessionTurn[];
  summarySegments: DesktopMemorySummarySegment[];
  memoryAtoms: DesktopMemoryAtom[];
  coreMemories?: DesktopMemoryCoreMemory[];
  lastRecallContext?: RecallContext;
  updatedAt: string;
}

export interface DesktopMemorySourcePassage {
  sessionId: string;
  turnId: string;
  status: "available" | "missing" | "unavailable";
  role?: SessionTurn["role"];
  text?: string;
  createdAt?: string;
  message?: string;
  observationSource?: boolean;
}

export type DesktopMemorySummarySegment = SummarySegment & {
  sourcePassages?: DesktopMemorySourcePassage[];
};

export type DesktopMemoryAtom = MemoryAtom & {
  sourcePassages?: DesktopMemorySourcePassage[];
};

export interface DesktopMemoryCoreMemory {
  id: string;
  text: string;
  strength: number;
  kind: "explicit" | "topic";
  createdAt: string;
  lastRecalledAt?: string;
  disabled: boolean;
}

export interface DesktopProfileFact {
  id: string;
  category: "allergy" | "important-date" | "identity" | "preference" | "free-form";
  key: string;
  value: string;
  createdAt: string;
  disabled: boolean;
}

export interface DesktopProfileFactUpdate {
  id: string;
  disabled?: boolean;
}

export interface DesktopProfileFactCreate {
  category: "allergy" | "important-date" | "identity" | "preference" | "free-form";
  key: string;
  value: string;
}

export interface DesktopProfileFactDelete {
  id: string;
}

export interface DesktopMemorySummaryUpdate {
  id: string;
  summary?: string;
  recallCues?: string[];
  disabled?: boolean;
}

export interface DesktopMemoryAtomUpdate {
  id: string;
  text?: string;
  disabled?: boolean;
}

export interface DesktopMemoryActionResult {
  ok: boolean;
  message: string;
}

export interface DesktopMemoryExport {
  threadId: string;
  sessionId: string;
  recentTurns: SessionTurn[];
  summarySegments: DesktopMemorySummarySegment[];
  memoryAtoms: DesktopMemoryAtom[];
  coreMemories?: DesktopMemoryCoreMemory[];
  lastRecallContext?: RecallContext;
  exportedAt: string;
}

export interface DesktopProactiveCheckRequest {
  sceneContext: RuntimeSceneContext;
}

export interface DesktopProactiveMessage {
  text: string;
  createdAt: string;
}

export interface DesktopPersonaSaveRequest {
  persona: CharacterPersona;
}

export interface DesktopPersonaState {
  status: "ready" | "saved" | "error";
  path: string;
  message: string;
  persona?: CharacterPersona;
}

export interface DesktopObservationFrame extends RuntimeImageAttachment {
  index: number;
}

export interface DesktopScreenAwarenessState {
  enabled: boolean;
  status: "off" | "warming" | "ready" | "error";
  observationId: string;
  message: string;
  updatedAt?: string;
}

export interface DesktopIpcRequestMap {
  "neko:command": { action: "install" | "start" | "stop" | "status"; message?: string };
  "neko:audio": { data: Uint8Array; sampleRate: number };
  "runtime:input": RuntimeInputEvent;
  "runtime:speech-playback": DesktopSpeechPlaybackEvent;
  "provider:test-llm": {};
  "provider:test-voice": {};
  "memory:debug-request": {};
  "memory:summary-update": DesktopMemorySummaryUpdate;
  "memory:summary-delete": { id: string };
  "memory:summary-clear": {};
  "memory:atom-update": DesktopMemoryAtomUpdate;
  "memory:atom-delete": { id: string };
  "memory:atom-clear-current-role": {};
  "memory:atom-export": { id: string };
  "memory:core-toggle": { id: string; disabled: boolean };
  "memory:core-delete": { id: string };
  "memory:export-request": {};
  "profile:get-facts": {};
  "profile:update-fact": DesktopProfileFactUpdate;
  "profile:create-fact": DesktopProfileFactCreate;
  "profile:delete-fact": DesktopProfileFactDelete;
  "screen-awareness:set-enabled": { enabled: boolean };
  "proactive:check": DesktopProactiveCheckRequest;
  "persona:load": {};
  "persona:save": DesktopPersonaSaveRequest;
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
  "window:hide-pet": {};
  "window:hide-controls": {};
  "window:controls-drag-start": { screenX: number; screenY: number };
  "window:controls-drag-move": { screenX: number; screenY: number };
  "window:controls-drag-end": {};
  "stage:choose-model": {};
  "stage:load-model": { modelPath: string };
}

export interface DesktopIpcEventMap {
  "neko:event": import("../../../../packages/neko-plugin/src/index").NekoPluginEvent;
  "provider:test-reset": {};
  "session:continuity": {
    restoredRecentMessageCount: number;
    longTermMemoryEnabled: boolean;
  };
  "runtime:event": RuntimeOutputEvent;
  "runtime:speech-playback": DesktopSpeechPlaybackEvent;
  "provider:test-llm-result": {
    ok: boolean;
    message: string;
    firstToken?: string;
  };
  "provider:test-voice-result": DesktopVoiceTestResult;
  "memory:debug-snapshot": DesktopMemoryDebugSnapshot;
  "memory:action-result": DesktopMemoryActionResult;
  "memory:export-result": DesktopMemoryActionResult & { export?: DesktopMemoryExport };
  "profile:facts-result": DesktopProfileFact[];
  "profile:action-result": DesktopMemoryActionResult;
  "screen-awareness:state": DesktopScreenAwarenessState;
  "proactive:message": DesktopProactiveMessage;
  "persona:state": DesktopPersonaState;
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
