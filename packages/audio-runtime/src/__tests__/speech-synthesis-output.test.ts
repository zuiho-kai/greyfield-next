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
});
