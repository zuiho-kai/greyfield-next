import type { RuntimeImageAttachment, RuntimeObservationInput } from "@greyfield/core-runtime";
import { filterDistinctObservationFrames } from "@greyfield/core-runtime";
import type { DesktopObservationFrame, DesktopScreenAwarenessState } from "../shared/ipc";

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

export interface ObservationRuntimePayload {
  attachments: RuntimeImageAttachment[];
  observation?: RuntimeObservationInput;
}

export type ObservationRefreshReason = "enable" | "manual" | "tick";

export interface ObservationControllerOptions {
  captureSource: ObservationCaptureSource;
  broadcast(state: DesktopScreenAwarenessState): void;
  onContextUpdated?: (payload: ObservationRuntimePayload) => void | Promise<void>;
  tickIntervalMs?: number;
  now?: () => Date;
}

const maxScreenAwarenessFrames = 1;
const defaultTickIntervalMs = 30_000;

export class ObservationController {
  private state: DesktopScreenAwarenessState = createInitialScreenAwarenessState();
  private frames: DesktopObservationFrame[] = [];
  private duplicateCount = 0;
  private generation = 0;
  private tickTimer: ReturnType<typeof setInterval> | undefined;
  private refreshInFlight: Promise<void> | undefined;
  private readonly now: () => Date;

  constructor(private readonly options: ObservationControllerOptions) {
    this.now = options.now ?? (() => new Date());
  }

  getState(): DesktopScreenAwarenessState {
    return structuredClone(this.state);
  }

  isEnabled(): boolean {
    return this.state.enabled;
  }

  async setEnabled(enabled: boolean): Promise<void> {
    if (!enabled) {
      this.stopTicker();
      this.clearRawFrames();
      this.update(createInitialScreenAwarenessState());
      return;
    }
    if (this.state.enabled && this.state.status === "ready") {
      this.startTicker();
      return;
    }
    await this.refresh("enable");
    this.startTicker();
  }

  async ensureFreshContext(): Promise<ObservationRuntimePayload> {
    if (!this.state.enabled) {
      return { attachments: [] };
    }
    if (this.frames.length === 0 && this.state.status !== "warming") {
      await this.refresh();
    }
    return this.getRuntimePayload();
  }

  async refresh(reason: ObservationRefreshReason = "manual"): Promise<void> {
    if (this.refreshInFlight) {
      await this.refreshInFlight;
      return;
    }
    this.refreshInFlight = this.doRefresh(reason).finally(() => {
      this.refreshInFlight = undefined;
    });
    await this.refreshInFlight;
  }

  stop(): void {
    this.stopTicker();
    this.clearRawFrames();
  }

  private async doRefresh(reason: ObservationRefreshReason): Promise<void> {
    const generation = this.nextGeneration();
    const observationId = createObservationId(this.now());
    this.update({
      enabled: true,
      status: "warming",
      observationId,
      message: "Screen awareness is getting recent desktop visual context."
    });
    try {
      const frame = await this.captureFrame(observationId, 0);
      if (!this.isCurrentGeneration(generation)) {
        return;
      }
      const filtered = filterDistinctObservationFrames([frame], { maxFrames: maxScreenAwarenessFrames });
      this.frames = filtered.frames;
      this.duplicateCount = filtered.duplicateCount;
      this.update({
        enabled: true,
        status: "ready",
        observationId,
        message: "Screen awareness is on.",
        updatedAt: frame.createdAt
      });
      if (reason === "tick") {
        await this.options.onContextUpdated?.(this.getRuntimePayload());
      }
    } catch (error) {
      if (!this.isCurrentGeneration(generation)) {
        return;
      }
      this.clearRawFrames();
      this.update({
        enabled: true,
        status: "error",
        observationId,
        message: `Screen awareness could not read the screen: ${formatError(error)}`
      });
    }
  }

  clearRawFrames(): void {
    this.generation += 1;
    this.frames = [];
    this.duplicateCount = 0;
  }

  private getRuntimePayload(): ObservationRuntimePayload {
    if (!this.state.enabled || this.frames.length === 0) {
      return { attachments: [] };
    }
    return {
      attachments: this.frames.map(({ index: _index, ...frame }) => frame),
      observation: {
        id: this.state.observationId || "screen-awareness",
        mode: "normal",
        frameCount: this.frames.length + this.duplicateCount,
        dedupedFrameCount: this.frames.length,
        source: "desktop-screen-awareness"
      }
    };
  }

  private async captureFrame(observationId: string, index: number): Promise<DesktopObservationFrame> {
    const captured = await this.options.captureSource.capture();
    return {
      id: `${observationId}-frame-${index + 1}`,
      index,
      dataUrl: captured.dataUrl,
      mimeType: captured.mimeType,
      createdAt: this.now().toISOString(),
      source: "observation-frame",
      ...(captured.width ? { width: captured.width } : {}),
      ...(captured.height ? { height: captured.height } : {}),
      ...(captured.hash ? { hash: captured.hash } : {})
    };
  }

  private update(state: DesktopScreenAwarenessState): void {
    this.state = state;
    this.options.broadcast(this.getState());
  }

  private nextGeneration(): number {
    this.generation += 1;
    return this.generation;
  }

  private isCurrentGeneration(generation: number): boolean {
    return this.generation === generation && this.state.enabled;
  }

  private startTicker(): void {
    if (this.tickTimer || !this.state.enabled) {
      return;
    }
    const tickIntervalMs = this.options.tickIntervalMs ?? defaultTickIntervalMs;
    if (!Number.isFinite(tickIntervalMs) || tickIntervalMs <= 0) {
      return;
    }
    this.tickTimer = setInterval(() => {
      void this.refresh("tick");
    }, tickIntervalMs);
  }

  private stopTicker(): void {
    if (!this.tickTimer) {
      return;
    }
    clearInterval(this.tickTimer);
    this.tickTimer = undefined;
  }
}

function createInitialScreenAwarenessState(): DesktopScreenAwarenessState {
  return {
    enabled: false,
    status: "off",
    observationId: "",
    message: ""
  };
}

function createObservationId(now: Date): string {
  return `screen-${now.toISOString().replace(/[^0-9A-Za-z]+/g, "-")}`;
}

function formatError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
