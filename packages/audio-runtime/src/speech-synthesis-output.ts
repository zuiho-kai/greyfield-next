export interface SpeechOutputOptions {
  voiceId?: string;
  volume?: number;
}

export interface SpeechOutput {
  speak(text: string, options?: SpeechOutputOptions): Promise<void>;
  cancel(): void;
}

export class BrowserSpeechSynthesisOutput implements SpeechOutput {
  constructor(
    private readonly synthesis: SpeechSynthesis | undefined = globalThis.speechSynthesis,
    private readonly Utterance: typeof SpeechSynthesisUtterance | undefined = globalThis.SpeechSynthesisUtterance
  ) {}

  async speak(text: string, options: SpeechOutputOptions = {}): Promise<void> {
    const normalized = text.replace(/\s+/g, " ").trim();
    if (normalized.length === 0) {
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
    this.synthesis?.cancel();
  }

  private findVoice(voiceId: string | undefined): SpeechSynthesisVoice | undefined {
    const wanted = voiceId?.trim();
    if (!wanted || !this.synthesis) {
      return undefined;
    }
    return this.synthesis.getVoices().find((voice) => voice.name === wanted || voice.voiceURI === wanted || voice.lang === wanted);
  }
}

function clamp01(value: number): number {
  if (!Number.isFinite(value)) {
    return 1;
  }
  return Math.min(1, Math.max(0, value));
}
