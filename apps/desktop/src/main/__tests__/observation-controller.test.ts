import { describe, expect, it } from "vitest";
import {
  ObservationController,
  type CapturedObservationFrame,
  type ObservationCaptureSource
} from "../observation-controller";

describe("ObservationController screen awareness", () => {
  it("turns on with recent desktop visual context without broadcasting raw frames", async () => {
    const states: unknown[] = [];
    const controller = new ObservationController({
      captureSource: new TestCaptureSource(["A"]),
      broadcast: (state) => states.push(state),
      now: () => new Date("2026-06-30T00:00:00.000Z")
    });

    await controller.setEnabled(true);

    expect(controller.getState()).toMatchObject({
      enabled: true,
      status: "ready",
      observationId: "screen-2026-06-30T00-00-00-000Z",
      message: "Screen awareness is on."
    });
    expect(JSON.stringify(states)).not.toContain("data:image");
    const payload = await controller.ensureFreshContext();
    expect(payload).toMatchObject({
      attachments: [expect.objectContaining({ dataUrl: "data:image/png;base64,QQ==", source: "observation-frame" })],
      observation: expect.objectContaining({
        source: "desktop-screen-awareness",
        mode: "normal",
        frameCount: 1,
        dedupedFrameCount: 1
      })
    });
  });

  it("clears raw screen context when turned off", async () => {
    const controller = new ObservationController({
      captureSource: new TestCaptureSource(["A"]),
      broadcast: () => undefined,
      now: () => new Date("2026-06-30T00:00:00.000Z")
    });

    await controller.setEnabled(true);
    expect((await controller.ensureFreshContext()).attachments).toHaveLength(1);

    await controller.setEnabled(false);

    expect(controller.getState()).toMatchObject({ enabled: false, status: "off", observationId: "" });
    expect((await controller.ensureFreshContext()).attachments).toEqual([]);
  });

  it("does not resurrect raw context after an in-flight capture resolves", async () => {
    const captureSource = new DeferredCaptureSource();
    const controller = new ObservationController({
      captureSource,
      broadcast: () => undefined,
      now: () => new Date("2026-06-30T00:00:00.000Z")
    });

    const enabling = controller.setEnabled(true);
    expect(controller.getState()).toMatchObject({ enabled: true, status: "warming" });

    await controller.setEnabled(false);
    captureSource.resolve("A");
    await enabling;

    expect(controller.getState()).toMatchObject({ enabled: false, status: "off" });
    expect((await controller.ensureFreshContext()).attachments).toEqual([]);
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

class DeferredCaptureSource implements ObservationCaptureSource {
  private pendingResolve: ((frame: CapturedObservationFrame) => void) | undefined;

  async capture() {
    return new Promise<CapturedObservationFrame>((resolve) => {
      this.pendingResolve = resolve;
    });
  }

  resolve(marker: string): void {
    const resolve = this.pendingResolve;
    if (!resolve) {
      throw new Error("No pending capture to resolve.");
    }
    this.pendingResolve = undefined;
    resolve({
      dataUrl: `data:image/png;base64,${Buffer.from(marker).toString("base64")}`,
      mimeType: "image/png",
      hash: marker
    });
  }
}
