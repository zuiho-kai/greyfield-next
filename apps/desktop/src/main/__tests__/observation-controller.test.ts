import { afterEach, describe, expect, it, vi } from "vitest";
import {
  ObservationController,
  type CapturedObservationFrame,
  type ObservationCaptureSource
} from "../observation-controller";

describe("ObservationController screen awareness", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

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

  it("honors a second enable request after disable cancels an in-flight capture", async () => {
    const captureSource = new QueuedDeferredCaptureSource();
    const controller = new ObservationController({
      captureSource,
      broadcast: () => undefined,
      now: () => new Date("2026-06-30T00:00:00.000Z")
    });

    const firstEnable = controller.setEnabled(true);
    await waitForPendingCapture(captureSource, 1);

    await controller.setEnabled(false);
    const secondEnable = controller.setEnabled(true);

    captureSource.resolveNext("A");
    await waitForPendingCapture(captureSource, 1);
    captureSource.resolveNext("B");
    await Promise.all([firstEnable, secondEnable]);

    expect(controller.getState()).toMatchObject({ enabled: true, status: "ready" });
    expect((await controller.ensureFreshContext()).attachments).toEqual([
      expect.objectContaining({ dataUrl: "data:image/png;base64,Qg==", hash: "B" })
    ]);
  });

  it("ticks while enabled and stops ticking when disabled", async () => {
    vi.useFakeTimers();
    const updates: unknown[] = [];
    const captureSource = new TestCaptureSource(["A", "B", "C"]);
    const controller = new ObservationController({
      captureSource,
      broadcast: () => undefined,
      onContextUpdated: (payload) => {
        updates.push(payload);
      },
      tickIntervalMs: 1_000,
      now: () => new Date("2026-06-30T00:00:00.000Z")
    });

    await controller.setEnabled(true);
    expect(captureSource.captureCount).toBe(1);
    expect(updates).toHaveLength(0);

    await vi.advanceTimersByTimeAsync(1_000);
    expect(captureSource.captureCount).toBe(2);
    expect(updates).toHaveLength(1);
    expect(updates[0]).toMatchObject({
      attachments: [expect.objectContaining({ dataUrl: "data:image/png;base64,Qg==" })],
      observation: expect.objectContaining({ source: "desktop-screen-awareness" })
    });

    await controller.setEnabled(false);
    await vi.advanceTimersByTimeAsync(2_000);
    expect(captureSource.captureCount).toBe(2);
  });

  it("does not publish background updates for unchanged frames", async () => {
    vi.useFakeTimers();
    const updates: unknown[] = [];
    const captureSource = new TestCaptureSource(["A", "A", "B"]);
    const controller = new ObservationController({
      captureSource,
      broadcast: () => undefined,
      onContextUpdated: (payload) => {
        updates.push(payload);
      },
      tickIntervalMs: 1_000,
      now: () => new Date("2026-06-30T00:00:00.000Z")
    });

    await controller.setEnabled(true);
    await vi.advanceTimersByTimeAsync(1_000);

    expect(captureSource.captureCount).toBe(2);
    expect(updates).toHaveLength(0);

    await vi.advanceTimersByTimeAsync(1_000);

    expect(captureSource.captureCount).toBe(3);
    expect(updates).toHaveLength(1);
    expect(updates[0]).toMatchObject({
      attachments: [expect.objectContaining({ hash: "B" })],
      screenContext: expect.objectContaining({
        changed: true,
        previousHash: "A",
        hash: "B",
        reason: "tick"
      })
    });
  });

  it("uses the configured change threshold before publishing background updates", async () => {
    vi.useFakeTimers();
    const updates: unknown[] = [];
    const captureSource = new ScoredCaptureSource([
      { marker: "A", changeScore: 0 },
      { marker: "B", changeScore: 4 },
      { marker: "C", changeScore: 9 }
    ]);
    const controller = new ObservationController({
      captureSource,
      broadcast: () => undefined,
      onContextUpdated: (payload) => {
        updates.push(payload);
      },
      tickIntervalMs: 1_000,
      changeThreshold: 5,
      now: () => new Date("2026-06-30T00:00:00.000Z")
    });

    await controller.setEnabled(true);
    await vi.advanceTimersByTimeAsync(1_000);

    expect(updates).toHaveLength(0);

    await vi.advanceTimersByTimeAsync(1_000);

    expect(updates).toHaveLength(1);
    expect(updates[0]).toMatchObject({
      attachments: [expect.objectContaining({ hash: "C", changeScore: 9 })],
      screenContext: expect.objectContaining({
        changeScore: 9,
        changeThreshold: 5
      })
    });
  });
});

class TestCaptureSource implements ObservationCaptureSource {
  private index = 0;

  constructor(private readonly markers: string[]) {}

  get captureCount(): number {
    return this.index;
  }

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

class QueuedDeferredCaptureSource implements ObservationCaptureSource {
  private pendingResolves: Array<(frame: CapturedObservationFrame) => void> = [];

  get pendingCount(): number {
    return this.pendingResolves.length;
  }

  async capture() {
    return new Promise<CapturedObservationFrame>((resolve) => {
      this.pendingResolves.push(resolve);
    });
  }

  resolveNext(marker: string): void {
    const resolve = this.pendingResolves.shift();
    if (!resolve) {
      throw new Error("No pending capture to resolve.");
    }
    resolve({
      dataUrl: `data:image/png;base64,${Buffer.from(marker).toString("base64")}`,
      mimeType: "image/png",
      hash: marker
    });
  }
}

class ScoredCaptureSource implements ObservationCaptureSource {
  private index = 0;

  constructor(private readonly frames: Array<{ marker: string; changeScore: number }>) {}

  async capture() {
    const frame = this.frames[Math.min(this.index, this.frames.length - 1)] ?? { marker: "A", changeScore: 0 };
    this.index += 1;
    return {
      dataUrl: `data:image/png;base64,${Buffer.from(frame.marker).toString("base64")}`,
      mimeType: "image/png",
      hash: frame.marker,
      changeScore: frame.changeScore
    };
  }
}

async function waitForPendingCapture(captureSource: QueuedDeferredCaptureSource, pendingCount: number): Promise<void> {
  const started = Date.now();
  while (Date.now() - started < 1_000) {
    if (captureSource.pendingCount === pendingCount) {
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
  throw new Error(`Timed out waiting for ${pendingCount} pending capture(s); got ${captureSource.pendingCount}.`);
}
