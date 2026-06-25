export interface SpeechOutputOptions {
  audio?: Uint8Array;
  voiceId?: string;
  volume?: number;
}

export interface SpeechOutput {
  speak(text: string, options?: SpeechOutputOptions): Promise<void>;
  cancel(): void;
}

export class BrowserSpeechSynthesisOutput implements SpeechOutput {
  private activeAudio:
    | {
        element: Pick<HTMLAudioElement, "pause"> & { currentTime?: number };
        cancel: () => void;
        objectUrl?: string;
      }
    | undefined;

  constructor(
    private readonly synthesis: SpeechSynthesis | undefined = globalThis.speechSynthesis,
    private readonly Utterance: typeof SpeechSynthesisUtterance | undefined = globalThis.SpeechSynthesisUtterance,
    private readonly AudioElement: typeof Audio | undefined = globalThis.Audio,
    private readonly urlApi: Pick<typeof URL, "createObjectURL" | "revokeObjectURL"> | undefined = globalThis.URL
  ) {}

  async speak(text: string, options: SpeechOutputOptions = {}): Promise<void> {
    const normalized = text.replace(/\s+/g, " ").trim();
    if (normalized.length === 0) {
      return;
    }
    if (options.audio && isPlayableBrowserAudio(options.audio)) {
      await this.playAudio(options.audio, options.volume);
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

  private async playAudio(audioData: Uint8Array, volume: number | undefined): Promise<void> {
    if (!this.AudioElement || !this.urlApi) {
      throw new Error("Audio playback is not available in this window.");
    }

    const blob = new Blob([audioData.slice().buffer], { type: "audio/mpeg" });
    const objectUrl = this.urlApi.createObjectURL(blob);
    const audio = new this.AudioElement(objectUrl);
    audio.volume = clamp01(volume ?? 1);

    await new Promise<void>((resolve, reject) => {
      let settled = false;
      const cleanup = () => {
        if (this.activeAudio?.element === audio) {
          this.activeAudio = undefined;
        }
        this.urlApi?.revokeObjectURL(objectUrl);
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
        element: audio,
        objectUrl,
        cancel: () => {
          audio.pause();
          audio.currentTime = 0;
          settle(() => reject(new Error("Speech playback failed: canceled")));
        }
      };
      audio.onended = () => settle(resolve);
      audio.onerror = () => settle(() => reject(new Error("Speech playback failed: audio decode error")));
      void audio.play().catch((error: unknown) => {
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
