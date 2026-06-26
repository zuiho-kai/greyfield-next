import { createMouthOpenTimelineFromPcm } from "./audio-level-meter";

export interface SpeechOutputOptions {
  audio?: Uint8Array;
  voiceId?: string;
  volume?: number;
  onMouthOpen?: (value: number) => void;
}

export interface SpeechAudioPlaybackProbePayload {
  bytes: number;
  headerHex: string;
  objectUrl: string;
  volume: number;
  fadeInMs: number;
}

export interface SpeechAudioPlaybackProbe {
  playAudio(payload: SpeechAudioPlaybackProbePayload): Promise<void>;
  cancel?(): void;
}

export interface SpeechOutput {
  speak(text: string, options?: SpeechOutputOptions): Promise<void>;
  cancel(): void;
}

export class BrowserSpeechSynthesisOutput implements SpeechOutput {
  private activeAudio:
    | {
        cancel: () => void;
        stopMouthDriver?: () => void;
        objectUrl?: string;
      }
    | undefined;

  constructor(
    private readonly synthesis: SpeechSynthesis | undefined = globalThis.speechSynthesis,
    private readonly Utterance: typeof SpeechSynthesisUtterance | undefined = globalThis.SpeechSynthesisUtterance,
    private readonly AudioElement: typeof Audio | undefined = globalThis.Audio,
    private readonly urlApi: Pick<typeof URL, "createObjectURL" | "revokeObjectURL"> | undefined = globalThis.URL,
    private readonly AudioContextCtor: typeof AudioContext | undefined = resolveAudioContextCtor(),
    private readonly audioPlaybackProbe: SpeechAudioPlaybackProbe | undefined = resolveAudioPlaybackProbe()
  ) {}

  async speak(text: string, options: SpeechOutputOptions = {}): Promise<void> {
    const normalized = text.replace(/\s+/g, " ").trim();
    if (normalized.length === 0) {
      return;
    }
    if (options.audio && isPlayableBrowserAudio(options.audio)) {
      await this.playAudio(options.audio, options.volume, options.onMouthOpen);
      return;
    }
    if (!this.synthesis || !this.Utterance) {
      throw new Error("Speech playback is not available in this window.");
    }
    const Utterance = this.Utterance;

    await new Promise<void>((resolve, reject) => {
      const utterance = new Utterance(normalized);
      utterance.volume = clamp01(options.volume ?? 1);
      const voice = this.findVoice(options.voiceId);
      if (voice) {
        utterance.voice = voice;
      }
      utterance.onend = () => resolve();
      utterance.onerror = (event) => reject(new Error(`Speech playback failed: ${event.error}`));
      this.synthesis?.speak(utterance);
    });
  }

  cancel(): void {
    this.activeAudio?.cancel();
    this.synthesis?.cancel();
  }

  private async playAudio(
    audioData: Uint8Array,
    volume: number | undefined,
    onMouthOpen: ((value: number) => void) | undefined
  ): Promise<void> {
    if (!this.AudioContextCtor && (!this.AudioElement || !this.urlApi)) {
      throw new Error("Audio playback is not available in this window.");
    }

    const objectUrl = this.urlApi?.createObjectURL(new Blob([audioData.slice().buffer], { type: "audio/mpeg" })) ?? "";
    const targetVolume = clamp01(volume ?? 1);

    await new Promise<void>((resolve, reject) => {
      let settled = false;
      let stopMouthDriver: (() => void) | undefined;
      let stopPlayback: (() => void) | undefined;
      let stopVolumeFade: (() => void) | undefined;
      let canceled = false;
      const cleanup = () => {
        if (this.activeAudio?.objectUrl === objectUrl) {
          this.activeAudio = undefined;
        }
        stopVolumeFade?.();
        stopMouthDriver?.();
        if (objectUrl) {
          this.urlApi?.revokeObjectURL(objectUrl);
        }
      };
      const settle = (callback: () => void) => {
        if (settled) {
          return;
        }
        settled = true;
        cleanup();
        callback();
      };

      this.activeAudio = {
        objectUrl,
        cancel: () => {
          canceled = true;
          this.audioPlaybackProbe?.cancel?.();
          stopPlayback?.();
          stopMouthDriver?.();
          settle(() => reject(new Error("Speech playback failed: canceled")));
        }
      };
      if (this.audioPlaybackProbe) {
        if (onMouthOpen) {
          void createMouthDriver(audioData, onMouthOpen)
            .then((driver) => {
              if (settled) {
                driver();
                return;
              }
              stopMouthDriver = driver;
              if (this.activeAudio?.objectUrl === objectUrl) {
                this.activeAudio.stopMouthDriver = driver;
              }
            })
            .catch(() => {
              onMouthOpen(0);
            });
        }
        void this.audioPlaybackProbe
          .playAudio({
            bytes: audioData.length,
            headerHex: toHeaderHex(audioData),
            objectUrl,
            volume: targetVolume,
            fadeInMs: defaultAudioFadeInMs
          })
          .then(() => settle(resolve))
          .catch((error: unknown) => {
            settle(() => reject(error instanceof Error ? error : new Error(String(error))));
          });
        return;
      }
      if (this.AudioContextCtor) {
        void playDecodedAudio({
          AudioContextCtor: this.AudioContextCtor,
          audioData,
          targetVolume,
          onMouthOpen,
          setStopPlayback: (stop) => {
            stopPlayback = stop;
          },
          setStopMouthDriver: (stop) => {
            stopMouthDriver = stop;
            if (this.activeAudio?.objectUrl === objectUrl) {
              this.activeAudio.stopMouthDriver = stop;
            }
          },
          isCanceled: () => canceled
        })
          .then(() => settle(resolve))
          .catch((error: unknown) => {
            settle(() => reject(error instanceof Error ? error : new Error(String(error))));
          });
        return;
      }

      if (!this.AudioElement || !objectUrl) {
        settle(() => reject(new Error("Audio playback is not available in this window.")));
        return;
      }
      const audio = new this.AudioElement(objectUrl);
      audio.volume = 0;
      stopPlayback = () => {
        audio.pause();
        audio.currentTime = 0;
      };
      if (onMouthOpen) {
        void createMouthDriver(audioData, onMouthOpen)
          .then((driver) => {
            if (settled) {
              driver();
              return;
            }
            stopMouthDriver = driver;
            if (this.activeAudio?.objectUrl === objectUrl) {
              this.activeAudio.stopMouthDriver = driver;
            }
          })
          .catch(() => {
            onMouthOpen(0);
          });
      }
      audio.onended = () => settle(resolve);
      audio.onerror = () => settle(() => reject(new Error("Speech playback failed: audio decode error")));
      void audio
        .play()
        .then(() => {
          stopVolumeFade = fadeHtmlAudioVolume(audio, targetVolume);
        })
        .catch((error: unknown) => {
          settle(() => reject(error instanceof Error ? error : new Error(String(error))));
        });
    });
  }

  private findVoice(voiceId: string | undefined): SpeechSynthesisVoice | undefined {
    const wanted = voiceId?.trim();
    if (!wanted || !this.synthesis) {
      return undefined;
    }
    return this.synthesis.getVoices().find((voice) => voice.name === wanted || voice.voiceURI === wanted || voice.lang === wanted);
  }
}

function isPlayableBrowserAudio(audio: Uint8Array): boolean {
  if (audio.length < 4) {
    return false;
  }
  const [a, b, c, d] = audio;
  return (
    (a === 0x49 && b === 0x44 && c === 0x33) ||
    (a === 0xff && (b & 0xe0) === 0xe0) ||
    (a === 0x52 && b === 0x49 && c === 0x46 && d === 0x46) ||
    (a === 0x4f && b === 0x67 && c === 0x67 && d === 0x53)
  );
}

function clamp01(value: number): number {
  if (!Number.isFinite(value)) {
    return 1;
  }
  return Math.min(1, Math.max(0, value));
}

function toHeaderHex(audioData: Uint8Array): string {
  return Array.from(audioData.slice(0, 8))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

function resolveAudioPlaybackProbe(): SpeechAudioPlaybackProbe | undefined {
  const candidate = (globalThis as typeof globalThis & { __greyfieldAudioPlaybackProbe?: SpeechAudioPlaybackProbe })
    .__greyfieldAudioPlaybackProbe;
  return typeof candidate?.playAudio === "function" ? candidate : undefined;
}

function resolveAudioContextCtor(): typeof AudioContext | undefined {
  return (
    globalThis as typeof globalThis & {
      AudioContext?: typeof AudioContext;
      webkitAudioContext?: typeof AudioContext;
    }
  ).AudioContext ?? (globalThis as typeof globalThis & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
}

async function createMouthDriver(audioData: Uint8Array, onMouthOpen: (value: number) => void): Promise<() => void> {
  const AudioContextCtor = resolveAudioContextCtor();
  if (!AudioContextCtor) {
    onMouthOpen(0);
    return () => onMouthOpen(0);
  }
  const context = new AudioContextCtor();
  try {
    const buffer = await context.decodeAudioData(audioData.slice().buffer);
    const timeline = createMouthOpenTimelineFromPcm(buffer.getChannelData(0), {
      sampleRate: buffer.sampleRate,
      frameMs: 50
    });
    let index = 0;
    onMouthOpen(timeline[index] ?? 0);
    const timer = setInterval(() => {
      index += 1;
      onMouthOpen(timeline[index] ?? 0);
      if (index >= timeline.length - 1) {
        clearInterval(timer);
      }
    }, 50);
    return () => {
      clearInterval(timer);
      onMouthOpen(0);
      void context.close().catch(() => undefined);
    };
  } catch (error) {
    void context.close().catch(() => undefined);
    throw error;
  }
}

const defaultAudioFadeInMs = 180;

async function playDecodedAudio(input: {
  AudioContextCtor: typeof AudioContext;
  audioData: Uint8Array;
  targetVolume: number;
  onMouthOpen?: (value: number) => void;
  setStopPlayback(stop: () => void): void;
  setStopMouthDriver(stop: () => void): void;
  isCanceled(): boolean;
}): Promise<void> {
  const context = new input.AudioContextCtor();
  let source: AudioBufferSourceNode | undefined;
  try {
    const buffer = await context.decodeAudioData(input.audioData.slice().buffer);
    if (input.isCanceled()) {
      return;
    }
    source = context.createBufferSource();
    source.buffer = buffer;
    const gain = context.createGain();
    gain.gain.setValueAtTime(0, context.currentTime);
    gain.gain.linearRampToValueAtTime(input.targetVolume, context.currentTime + defaultAudioFadeInMs / 1000);
    source.connect(gain);
    gain.connect(context.destination);

    if (input.onMouthOpen) {
      input.setStopMouthDriver(
        driveMouthFromAudioBuffer(buffer, input.onMouthOpen, {
          fadeInMs: defaultAudioFadeInMs
        })
      );
    }

    input.setStopPlayback(() => {
      try {
        source?.stop();
      } catch {
        // Already stopped.
      }
      void context.close().catch(() => undefined);
    });

    await new Promise<void>((resolve, reject) => {
      source!.onended = () => resolve();
      try {
        if (input.isCanceled()) {
          resolve();
          return;
        }
        source!.start();
      } catch (error) {
        reject(error instanceof Error ? error : new Error(String(error)));
      }
    });
  } finally {
    input.onMouthOpen?.(0);
    void context.close().catch(() => undefined);
  }
}

function driveMouthFromAudioBuffer(
  buffer: AudioBuffer,
  onMouthOpen: (value: number) => void,
  options: { fadeInMs: number; frameMs?: number }
): () => void {
  const frameMs = options.frameMs ?? 50;
  const timeline = createMouthOpenTimelineFromPcm(buffer.getChannelData(0), {
    sampleRate: buffer.sampleRate,
    frameMs
  });
  let index = 0;
  onMouthOpen(0);
  const timer = setInterval(() => {
    const elapsedMs = index * frameMs;
    const fade = Math.min(1, elapsedMs / Math.max(1, options.fadeInMs));
    onMouthOpen((timeline[index] ?? 0) * fade);
    index += 1;
    if (index >= timeline.length) {
      clearInterval(timer);
      onMouthOpen(0);
    }
  }, frameMs);
  return () => {
    clearInterval(timer);
    onMouthOpen(0);
  };
}

function fadeHtmlAudioVolume(audio: Pick<HTMLAudioElement, "volume">, targetVolume: number): () => void {
  const startedAt = performance.now();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const step = () => {
    const progress = Math.min(1, (performance.now() - startedAt) / defaultAudioFadeInMs);
    audio.volume = targetVolume * progress;
    if (progress < 1) {
      timer = setTimeout(step, 16);
    }
  };
  step();
  return () => {
    if (timer) {
      clearTimeout(timer);
    }
  };
}
