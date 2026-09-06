import { afterEach, expect, it, vi } from "vitest";
import { useCascadeAudio } from "../use-cascade-audio";
import type { DesktopRuntimeBridge } from "../desktop-runtime-bridge";

const capture = vi.hoisted(() => ({ push: undefined as undefined | ((data: Uint8Array, rate: number) => void), stop: vi.fn() }));
vi.mock("@greyfield/audio-runtime", async (importOriginal) => ({
  ...await importOriginal<typeof import("@greyfield/audio-runtime")>(),
  RealtimeAudio: class {
    async start(push: (data: Uint8Array, rate: number) => void) { capture.push = push; }
    stop() { capture.stop(); }
  }
}));
afterEach(() => { vi.unstubAllGlobals(); vi.clearAllMocks(); });

it("retains a natural pause clause cancelled during ASR, then clears it after acceptance and on mic close", () => {
  const handlers = new Map<string, (event: any) => void>();
  const send = vi.fn(); const interrupt = vi.fn(async () => ({}));
  vi.stubGlobal("window", { greyfield: { send, on: (name: string, fn: (event: any) => void) => { handlers.set(name, fn); return () => handlers.delete(name); } } });
  const dispose = useCascadeAudio(true, { interrupt } as unknown as DesktopRuntimeBridge);
  handlers.get("cascade:state")!({ active: true });
  const utterance = () => {
    const voiced = new Uint8Array(3200); const view = new DataView(voiced.buffer);
    for (let i = 0; i < 1600; i++) view.setInt16(i * 2, 8000, true);
    capture.push!(voiced, 16000);
    for (let i = 0; i < 5; i++) capture.push!(new Uint8Array(3200), 16000);
  };
  utterance();
  const firstSize = send.mock.calls.at(-1)![1].data.length;
  utterance(); // First ASR has not accepted a transcript when the user continues.
  expect(send.mock.calls.at(-1)![1].data.length).toBe(firstSize * 2 - 44);
  expect(interrupt).toHaveBeenCalledTimes(2);
  handlers.get("runtime:event")!({ type: "transcript.final", text: "完整句子" });
  utterance();
  expect(send.mock.calls.at(-1)![1].data.length).toBe(firstSize);
  handlers.get("cascade:state")!({ active: false });
  handlers.get("cascade:state")!({ active: true });
  utterance();
  expect(send.mock.calls.at(-1)![1].data.length).toBe(firstSize);
  handlers.get("runtime:event")!({ type: "error", message: "ASR failed" });
  utterance();
  expect(send.mock.calls.at(-1)![1].data.length).toBe(firstSize);
  dispose(); expect(capture.stop).toHaveBeenCalled(); expect(handlers.size).toBe(0);
});
