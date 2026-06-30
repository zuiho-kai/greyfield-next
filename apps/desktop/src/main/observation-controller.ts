import type { RuntimeObservationMode } from "@greyfield/core-runtime";
import { filterDistinctObservationFrames } from "@greyfield/core-runtime";
import type { DesktopObservationFrame, DesktopObservationState } from "../shared/ipc";

export interface CapturedObservationFrame {
  dataUrl: string;
  mimeType: string;
  width?: number;
  height?: number;
  hash?: string;
}

export interface ObservationCaptureSource {
  capture(): Promise<CapturedObservationFrame>;
}

export interface ObservationControllerOptions {
  captureSource: ObservationCaptureSource;
  broadcast(state: DesktopObservationState): void;
  now?: () => Date;
  setTimer?: typeof setTimeout;
  clearTimer?: typeof clearTimeout;
}

export const observationModeConfigs: Record<RuntimeObservationMode, { intervalMs: number; timeoutMs: number; maxFrames: number }> = {
  single: { intervalMs: 0, timeoutMs: 0, maxFrames: 1 },
  low: { intervalMs: 1500, timeoutMs: 6000, maxFrames: 3 },
  normal: { intervalMs: 900, timeoutMs: 6000, maxFrames: 5 },
  high: { intervalMs: 350, timeoutMs: 5000, maxFrames: 8 }
};

export class ObservationController {
  private state: DesktopObservationState = createInitialObservationState();
  private sequenceAbort: AbortController | undefined;
  private readonly now: () => Date;
  private readonly setTimer: typeof setTimeout;
  private readonly clearTimer: typeof clearTimeout;

  constructor(private readonly options: ObservationControllerOptions) {
    this.now = options.now ?? (() => new Date());
    this.setTimer = options.setTimer ?? setTimeout;
    this.clearTimer = options.clearTimer ?? clearTimeout;
  }

  getState(): DesktopObservationState {
    return structuredClone(this.state);
  }

  async captureSingle(): Promise<void> {
    this.stop();
    const observationId = createObservationId(this.now());
    const config = observationModeConfigs.single;
    this.update({
      status: "capturing",
      mode: "single",
      observationId,
      frames: [],
      duplicateCount: 0,
      ...config,
      message: "Capturing one temporary screenshot..."
    });
    try {
      const frame = await this.captureFrame(observationId, 0, "screenshot");
      this.update({
        ...this.state,
        status: "ready",
        frames: [frame],
        message: "Screenshot ready. Confirm to send it with this chat turn, or delete it."
      });
    } catch (error) {
      this.update({
        ...this.state,
        status: "error",
        message: `Screenshot capture failed: ${formatError(error)}`
      });
    }
  }

  startSequence(mode: Exclude<RuntimeObservationMode, "single">): void {
    this.stop();
    const observationId = createObservationId(this.now());
    const config = observationModeConfigs[mode];
    const abort = new AbortController();
    this.sequenceAbort = abort;
    this.update({
      status: "observing",
      mode,
      observationId,
      frames: [],
      duplicateCount: 0,
      ...config,
      message: formatObservingMessage(mode, config),
      ...(mode === "high" ? { highFrequencyWarning: "High frequency observation is short-lived and stops automatically after 5 seconds or 8 frames." } : {})
    });
    void this.runSequence(abort, observationId, mode, config);
  }

  stop(): void {
    const abort = this.sequenceAbort;
    this.sequenceAbort = undefined;
    abort?.abort();
    if (this.state.status === "observing" || this.state.status === "capturing") {
      this.update({
        ...this.state,
        status: this.state.frames.length > 0 ? "stopped" : "idle",
        message:
          this.state.frames.length > 0
            ? "Observation stopped. Confirm to send the temporary frames, or delete them."
            : "Observation stopped."
      });
    }
  }

  delete(): void {
    this.stop();
    this.update(createInitialObservationState());
  }

  private async runSequence(
    abort: AbortController,
    observationId: string,
    mode: Exclude<RuntimeObservationMode, "single">,
    config: { intervalMs: number; timeoutMs: number; maxFrames: number }
  ): Promise<void> {
    const startedAt = Date.now();
    let captureIndex = 0;
    try {
      while (!abort.signal.aborted && Date.now() - startedAt < config.timeoutMs && captureIndex < config.maxFrames) {
        const frame = await this.captureFrame(observationId, captureIndex, "observation-frame");
        captureIndex += 1;
        const filtered = filterDistinctObservationFrames([...this.state.frames, frame], { maxFrames: config.maxFrames });
        this.update({
          ...this.state,
          frames: filtered.frames,
          duplicateCount: this.state.duplicateCount + filtered.duplicateCount,
          message: formatObservingMessage(mode, config)
        });
        if (filtered.frames.length >= config.maxFrames || Date.now() - startedAt >= config.timeoutMs) {
          break;
        }
        await delay(config.intervalMs, abort.signal, this.setTimer, this.clearTimer);
      }
      if (this.sequenceAbort === abort) {
        this.sequenceAbort = undefined;
      }
      if (!abort.signal.aborted) {
        this.update({
          ...this.state,
          status: "ready",
          message: "Observation ready. Confirm to send the temporary key frames, or delete them."
        });
      }
    } catch (error) {
      if (abort.signal.aborted) {
        return;
      }
      this.update({
        ...this.state,
        status: "error",
        message: `Observation failed: ${formatError(error)}`
      });
    }
  }

  private async captureFrame(
    observationId: string,
    index: number,
    source: DesktopObservationFrame["source"]
  ): Promise<DesktopObservationFrame> {
    const captured = await this.options.captureSource.capture();
    return {
      id: `${observationId}-frame-${index + 1}`,
      index,
      dataUrl: captured.dataUrl,
      mimeType: captured.mimeType,
      createdAt: this.now().toISOString(),
      source,
      ...(captured.width ? { width: captured.width } : {}),
      ...(captured.height ? { height: captured.height } : {}),
      ...(captured.hash ? { hash: captured.hash } : {})
    };
  }

  private update(state: DesktopObservationState): void {
    this.state = state;
    this.options.broadcast(this.getState());
  }
}

function createInitialObservationState(): DesktopObservationState {
  return {
    status: "idle",
    mode: "single",
    observationId: "",
    frames: [],
    duplicateCount: 0,
    ...observationModeConfigs.single,
    message: ""
  };
}

function createObservationId(now: Date): string {
  return `obs-${now.toISOString().replace(/[^0-9A-Za-z]+/g, "-")}`;
}

function formatObservingMessage(
  mode: Exclude<RuntimeObservationMode, "single">,
  config: { intervalMs: number; timeoutMs: number; maxFrames: number }
): string {
  return `${mode === "high" ? "High frequency" : mode === "low" ? "Low frequency" : "Normal"} observation is capturing temporary frames every ${config.intervalMs}ms, up to ${config.maxFrames} frames or ${Math.round(config.timeoutMs / 1000)}s.`;
}

function delay(
  ms: number,
  signal: AbortSignal,
  setTimerImpl: typeof setTimeout,
  clearTimerImpl: typeof clearTimeout
): Promise<void> {
  return new Promise((resolve) => {
    if (signal.aborted) {
      resolve();
      return;
    }
    const timer = setTimerImpl(resolve, ms);
    signal.addEventListener(
      "abort",
      () => {
        clearTimerImpl(timer);
        resolve();
      },
      { once: true }
    );
  });
}

function formatError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
