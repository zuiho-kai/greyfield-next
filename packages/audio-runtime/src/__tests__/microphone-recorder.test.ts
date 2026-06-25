import { describe, expect, it, vi } from "vitest";
import { BrowserMicrophoneRecorder, type BrowserMicrophoneProbe } from "../microphone-recorder";

describe("BrowserMicrophoneRecorder", () => {
  it("uses the harness microphone probe when present", async () => {
    const probe: BrowserMicrophoneProbe = {
      start: vi.fn(async () => undefined),
      stop: vi.fn(async () => new Uint8Array([1, 2, 3])),
      cancel: vi.fn()
    };
    const recorder = new BrowserMicrophoneRecorder(undefined, undefined, probe);

    await recorder.start();
    await expect(recorder.stop()).resolves.toEqual(new Uint8Array([1, 2, 3]));
    recorder.cancel();

    expect(probe.start).toHaveBeenCalledOnce();
    expect(probe.stop).toHaveBeenCalledOnce();
    expect(probe.cancel).toHaveBeenCalledOnce();
  });

  it("reports unavailable microphone APIs clearly", async () => {
    const recorder = new BrowserMicrophoneRecorder(undefined, undefined, undefined);

    await expect(recorder.start()).rejects.toThrow("Microphone recording is not available");
  });
});
