import { describe, expect, it, vi } from "vitest";
import { BrowserSpeechSynthesisOutput } from "../speech-synthesis-output";

class TestUtterance {
  text: string;
  volume = 1;
  voice?: SpeechSynthesisVoice;
  onend: (() => void) | null = null;
  onerror: ((event: { error: string }) => void) | null = null;

  constructor(text: string) {
    this.text = text;
  }
}

describe("BrowserSpeechSynthesisOutput", () => {
  it("speaks normalized text with the selected voice and volume", async () => {
    const utterances: TestUtterance[] = [];
    const voice = { name: "greyfield-voice", voiceURI: "greyfield-voice-uri", lang: "en-US" } as SpeechSynthesisVoice;
    const synthesis = {
      speak: vi.fn((utterance: TestUtterance) => {
        utterances.push(utterance);
        utterance.onend?.();
      }),
      cancel: vi.fn(),
      getVoices: () => [voice]
    } as unknown as SpeechSynthesis;
    const output = new BrowserSpeechSynthesisOutput(
      synthesis,
      TestUtterance as unknown as typeof SpeechSynthesisUtterance
    );

    await output.speak("  hello   there  ", { voiceId: "greyfield-voice", volume: 0.4 });

    expect(synthesis.speak).toHaveBeenCalledOnce();
    expect(utterances[0]?.text).toBe("hello there");
    expect(utterances[0]?.voice).toBe(voice);
    expect(utterances[0]?.volume).toBe(0.4);
  });

  it("rejects when speech synthesis is unavailable", async () => {
    const output = new BrowserSpeechSynthesisOutput(undefined, undefined);

    await expect(output.speak("hello")).rejects.toThrow("Speech playback is not available");
  });

  it("plays real audio bytes before falling back to speech synthesis", async () => {
    const audioElements: TestAudioElement[] = [];
    const AudioElement = class extends TestAudioElement {
      constructor(src: string) {
        super(src);
        audioElements.push(this);
      }
    };
    const urlApi = {
      createObjectURL: vi.fn(() => "blob:greyfield-audio"),
      revokeObjectURL: vi.fn()
    };
    const synthesis = {
      speak: vi.fn(),
      cancel: vi.fn(),
      getVoices: () => []
    } as unknown as SpeechSynthesis;
    const output = new BrowserSpeechSynthesisOutput(
      synthesis,
      TestUtterance as unknown as typeof SpeechSynthesisUtterance,
      AudioElement as unknown as typeof Audio,
      urlApi
    );

    const speaking = output.speak("real audio", {
      audio: new Uint8Array([0x49, 0x44, 0x33, 0x03]),
      volume: 0.35
    });
    audioElements[0]?.onended?.(new Event("ended"));
    await speaking;

    expect(synthesis.speak).not.toHaveBeenCalled();
    expect(audioElements[0]?.src).toBe("blob:greyfield-audio");
    expect(audioElements[0]?.volume).toBe(0.35);
    expect(urlApi.revokeObjectURL).toHaveBeenCalledWith("blob:greyfield-audio");
  });

  it("cancels active audio playback", async () => {
    const audioElements: TestAudioElement[] = [];
    const AudioElement = class extends TestAudioElement {
      constructor(src: string) {
        super(src);
        audioElements.push(this);
      }
    };
    const output = new BrowserSpeechSynthesisOutput(undefined, undefined, AudioElement as unknown as typeof Audio, {
      createObjectURL: () => "blob:greyfield-audio",
      revokeObjectURL: vi.fn()
    });

    const speaking = output.speak("real audio", { audio: new Uint8Array([0x49, 0x44, 0x33, 0x03]) });
    output.cancel();

    await expect(speaking).rejects.toThrow("Speech playback failed: canceled");
    expect(audioElements[0]?.paused).toBe(true);
    expect(audioElements[0]?.currentTime).toBe(0);
  });
});

class TestAudioElement {
  volume = 1;
  currentTime = 0;
  paused = false;
  onended: ((event: Event) => void) | null = null;
  onerror: ((event: Event) => void) | null = null;

  constructor(readonly src: string) {}

  async play(): Promise<void> {
    return undefined;
  }

  pause(): void {
    this.paused = true;
  }
}
