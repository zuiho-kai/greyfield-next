import { afterEach, expect, it, vi } from "vitest";
import { NekoPlugin, type NekoPluginEvent } from "../index";

afterEach(() => vi.unstubAllGlobals());

it("drops old text, audio and its unscoped end while preserving the new response and binary alignment", async () => {
  let socket!: Socket;
  class Socket {
    static OPEN = 1;
    readyState = 1;
    binaryType = "";
    onopen?: () => void;
    onmessage?: (event: { data: string | ArrayBuffer }) => void;
    send() {}
    close() {}
    constructor() { socket = this; }
    message(data: Record<string, unknown>) { this.onmessage?.({ data: JSON.stringify(data) }); }
  }
  vi.stubGlobal("WebSocket", Socket);
  const events: NekoPluginEvent[] = [];
  const plugin = new NekoPlugin({ root: "unused-response-test", emit: (event) => events.push(event) });
  const connected = (plugin as unknown as { connect(url: string, generation: number): Promise<void> }).connect("ws://127.0.0.1/fixture", 0);
  socket.onopen?.(); socket.message({ type: "session_started", input_mode: "audio" });
  await connected;
  socket.message({ type: "audio_done", speech_id: "old" });
  plugin.interruptResearch();
  events.length = 0;
  socket.message({ type: "user_transcript", text: "新问题" });
  socket.message({ type: "gemini_response", turn_id: "new", text: "新的", isNewMessage: true });
  socket.message({ type: "gemini_response", turn_id: "old", text: "旧片段", isNewMessage: false });
  socket.message({ type: "audio_chunk", speech_id: "old" });
  socket.onmessage?.({ data: new Uint8Array([1, 0]).buffer });
  socket.message({ type: "audio_done", speech_id: "old" });
  socket.message({ type: "system", data: "turn end" });
  expect(events.filter((event) => event.type === "message" && event.data.type === "system")).toHaveLength(0);
  socket.message({ type: "gemini_response", turn_id: "new", text: "回答", isNewMessage: false });
  socket.message({ type: "audio_chunk", speech_id: "new" });
  socket.onmessage?.({ data: new Uint8Array([2, 0]).buffer });
  socket.message({ type: "audio_done", speech_id: "new" });
  socket.message({ type: "system", data: "turn end" });
  const text = events.flatMap((event) => event.type === "message" && event.data.type === "gemini_response" ? [event.data.text] : []).join("");
  expect(text).toBe("新的回答");
  expect(events.filter((event) => event.type === "audio")).toEqual([{ type: "audio", speechId: "new", data: new Uint8Array([2, 0]) }]);
  expect(events.filter((event) => event.type === "message" && event.data.type === "system")).toHaveLength(1);
  await plugin.stop();
});
