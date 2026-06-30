import { describe, expect, it, vi } from "vitest";
import { ObservationController, observationModeConfigs, type ObservationCaptureSource } from "../observation-controller";

describe("ObservationController", () => {
  it("captures one temporary screenshot", async () => {
    const states: unknown[] = [];
    const controller = new ObservationController({
      captureSource: new TestCaptureSource(["A"]),
      broadcast: (state) => states.push(state),
      now: () => new Date("2026-06-30T00:00:00.000Z")
    });

    await controller.captureSingle();

    expect(controller.getState()).toMatchObject({
      status: "ready",
      mode: "single",
      frames: [expect.objectContaining({ source: "screenshot", dataUrl: "data:image/png;base64,QQ==" })]
    });
    expect(states).toContainEqual(expect.objectContaining({ status: "capturing" }));
  });

  it("dedupes frames and applies high-frequency timeout and max frame policy", async () => {
    vi.useFakeTimers();
    const controller = new ObservationController({
      captureSource: new TestCaptureSource(["A", "A", "B", "C", "D", "E", "F", "G", "H", "I"]),
      broadcast: () => undefined,
      now: () => new Date("2026-06-30T00:00:00.000Z")
    });

    controller.startSequence("high");
    await vi.advanceTimersByTimeAsync(observationModeConfigs.high.timeoutMs + observationModeConfigs.high.intervalMs);

    const state = controller.getState();
    expect(state.status).toBe("ready");
    expect(state.mode).toBe("high");
    expect(state.maxFrames).toBe(8);
    expect(state.timeoutMs).toBe(5000);
    expect(state.frames.length).toBeLessThanOrEqual(8);
    expect(state.duplicateCount).toBeGreaterThanOrEqual(1);
    vi.useRealTimers();
  });

  it("stops and deletes an active observation", async () => {
    vi.useFakeTimers();
    const controller = new ObservationController({
      captureSource: new TestCaptureSource(["A", "B", "C"]),
      broadcast: () => undefined,
      now: () => new Date("2026-06-30T00:00:00.000Z")
    });

    controller.startSequence("low");
    await vi.advanceTimersByTimeAsync(10);
    controller.stop();
    expect(controller.getState().status).toBe("stopped");
    controller.delete();
    expect(controller.getState()).toMatchObject({ status: "idle", frames: [] });
    vi.useRealTimers();
  });
});

class TestCaptureSource implements ObservationCaptureSource {
  private index = 0;

  constructor(private readonly markers: string[]) {}

  async capture() {
    const marker = this.markers[Math.min(this.index, this.markers.length - 1)] ?? "A";
    this.index += 1;
    return {
      dataUrl: `data:image/png;base64,${Buffer.from(marker).toString("base64")}`,
      mimeType: "image/png",
      hash: marker
    };
  }
}
