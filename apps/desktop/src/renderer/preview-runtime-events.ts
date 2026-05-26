import type { RuntimeOutputEvent } from "@greyfield/core-runtime";

export function createRendererPreviewRuntimeEvents(): RuntimeOutputEvent[] {
  return [
    { type: "runtime.status", status: "thinking" },
    { type: "assistant.text.delta", text: "你好，我醒着。" },
    { type: "runtime.status", status: "speaking" },
    { type: "assistant.audio.chunk", text: "你好，我醒着。", data: new TextEncoder().encode("fake-audio:你好，我醒着。") },
    { type: "assistant.text.delta", text: "现在可以继续做桌宠了。" },
    { type: "runtime.status", status: "speaking" },
    {
      type: "assistant.audio.chunk",
      text: "现在可以继续做桌宠了。",
      data: new TextEncoder().encode("fake-audio:现在可以继续做桌宠了。")
    },
    { type: "assistant.text.final", text: "你好，我醒着。现在可以继续做桌宠了。" },
    { type: "assistant.audio.end" },
    { type: "runtime.status", status: "idle" }
  ];
}
