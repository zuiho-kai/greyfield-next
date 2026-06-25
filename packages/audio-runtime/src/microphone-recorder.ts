export interface MicrophoneRecorder {
  start(): Promise<void>;
  stop(): Promise<Uint8Array>;
  cancel(): void;
}

export interface BrowserMicrophoneProbe {
  start(): Promise<void>;
  stop(): Promise<Uint8Array>;
  cancel?(): void;
}

export class BrowserMicrophoneRecorder implements MicrophoneRecorder {
  private mediaRecorder: MediaRecorder | undefined;
  private stream: MediaStream | undefined;
  private chunks: Blob[] = [];
  private readonly probe: BrowserMicrophoneProbe | undefined;

  constructor(
    private readonly mediaDevices: MediaDevices | undefined = globalThis.navigator?.mediaDevices,
    private readonly MediaRecorderCtor: typeof MediaRecorder | undefined = globalThis.MediaRecorder,
    probe: BrowserMicrophoneProbe | undefined = resolveMicrophoneProbe()
  ) {
    this.probe = probe;
  }

  async start(): Promise<void> {
    if (this.probe) {
      await this.probe.start();
      return;
    }
    if (!this.mediaDevices?.getUserMedia || !this.MediaRecorderCtor) {
      throw new Error("Microphone recording is not available in this window.");
    }
    if (this.mediaRecorder && this.mediaRecorder.state !== "inactive") {
      throw new Error("Microphone recording is already running.");
    }
    this.stream = await this.mediaDevices.getUserMedia({ audio: true });
    this.chunks = [];
    this.mediaRecorder = new this.MediaRecorderCtor(this.stream, { mimeType: chooseMimeType(this.MediaRecorderCtor) });
    this.mediaRecorder.ondataavailable = (event) => {
      if (event.data.size > 0) {
        this.chunks.push(event.data);
      }
    };
    this.mediaRecorder.start();
  }

  async stop(): Promise<Uint8Array> {
    if (this.probe) {
      return this.probe.stop();
    }
    const recorder = this.mediaRecorder;
    if (!recorder || recorder.state === "inactive") {
      throw new Error("Microphone recording is not running.");
    }
    const chunks = await new Promise<Blob[]>((resolve, reject) => {
      recorder.onstop = () => resolve([...this.chunks]);
      recorder.onerror = () => reject(new Error("Microphone recording failed."));
      recorder.stop();
    });
    this.stopTracks();
    const blob = new Blob(chunks, { type: recorder.mimeType || "audio/webm" });
    return new Uint8Array(await blob.arrayBuffer());
  }

  cancel(): void {
    if (this.probe) {
      this.probe.cancel?.();
      return;
    }
    if (this.mediaRecorder && this.mediaRecorder.state !== "inactive") {
      this.mediaRecorder.stop();
    }
    this.stopTracks();
  }

  private stopTracks(): void {
    for (const track of this.stream?.getTracks() ?? []) {
      track.stop();
    }
    this.stream = undefined;
    this.mediaRecorder = undefined;
    this.chunks = [];
  }
}

function chooseMimeType(MediaRecorderCtor: typeof MediaRecorder): string {
  const candidates = ["audio/webm;codecs=opus", "audio/webm", "audio/ogg;codecs=opus", ""];
  return candidates.find((candidate) => candidate.length === 0 || MediaRecorderCtor.isTypeSupported(candidate)) ?? "";
}

function resolveMicrophoneProbe(): BrowserMicrophoneProbe | undefined {
  const candidate = (globalThis as typeof globalThis & { __greyfieldMicrophoneProbe?: BrowserMicrophoneProbe })
    .__greyfieldMicrophoneProbe;
  return typeof candidate?.start === "function" && typeof candidate.stop === "function" ? candidate : undefined;
}
