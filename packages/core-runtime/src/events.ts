export type RuntimeInputEvent =
  | { type: "text.input"; text: string }
  | { type: "audio.chunk"; data: Uint8Array }
  | { type: "audio.end" }
  | { type: "runtime.interrupt" }
  | { type: "stage.touch"; areaId: string; x?: number; y?: number }
  | { type: "settings.update"; patch: Record<string, unknown> };

export type RuntimeStatus = "idle" | "listening" | "thinking" | "speaking" | "interrupted" | "error";

export type RuntimeOutputEvent =
  | { type: "runtime.status"; status: RuntimeStatus }
  | { type: "transcript.partial"; text: string }
  | { type: "transcript.final"; text: string }
  | { type: "assistant.text.delta"; text: string }
  | { type: "assistant.text.final"; text: string }
  | { type: "assistant.audio.chunk"; text: string; data: Uint8Array }
  | { type: "assistant.audio.error"; text: string; message: string }
  | { type: "assistant.audio.end" }
  | { type: "stage.expression"; id: string }
  | { type: "stage.motion"; group: string; index?: number }
  | { type: "error"; message: string; cause?: unknown };

export type RuntimeEventHandler = (event: RuntimeOutputEvent) => void | Promise<void>;
