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
      urlApi,
      undefined
    );

    const speaking = output.speak("real audio", {
      audio: new Uint8Array([0x49, 0x44, 0x33, 0x03]),
      volume: 0.35
    });
    audioElements[0]?.onended?.(new Event("ended"));
    await speaking;

    expect(synthesis.speak).not.toHaveBeenCalled();
    expect(audioElements[0]?.src).toBe("blob:greyfield-audio");
    expect(audioElements[0]?.volume).toBeGreaterThanOrEqual(0);
    expect(audioElements[0]?.volume).toBeLessThan(0.35);
    expect(urlApi.revokeObjectURL).toHaveBeenCalledWith("blob:greyfield-audio");
  });

  it("allows harnesses to observe and complete real audio playback", async () => {
    const urlApi = {
      createObjectURL: vi.fn(() => "blob:greyfield-audio"),
      revokeObjectURL: vi.fn()
    };
    const playAudio = vi.fn(async () => undefined);
    const output = new BrowserSpeechSynthesisOutput(
      undefined,
      undefined,
      TestAudioElement as unknown as typeof Audio,
      urlApi,
      undefined,
      { playAudio }
    );

    await output.speak("real audio", {
      audio: new Uint8Array([0x49, 0x44, 0x33, 0x03, 0, 0, 0, 0]),
      volume: 0.25
    });

    expect(playAudio).toHaveBeenCalledWith({
      bytes: 8,
      headerHex: "4944330300000000",
      objectUrl: "blob:greyfield-audio",
      volume: 0.25,
      fadeInMs: 180
    });
    expect(urlApi.revokeObjectURL).toHaveBeenCalledWith("blob:greyfield-audio");
  });

  it("uses decoded WebAudio playback with a gain fade-in when available", async () => {
    const contexts: TestAudioContext[] = [];
    const AudioContextCtor = class extends TestAudioContext {
      constructor() {
        super();
        contexts.push(this);
      }
    };
    const output = new BrowserSpeechSynthesisOutput(
      undefined,
      undefined,
      undefined,
      undefined,
      AudioContextCtor as unknown as typeof AudioContext
    );

    await output.speak("real audio", {
      audio: new Uint8Array([0x49, 0x44, 0x33, 0x03, 0, 0, 0, 0]),
      volume: 0.42
    });

    expect(contexts[0]?.decodeAudioData).toHaveBeenCalledOnce();
    expect(contexts[0]?.gain.gain.setValueAtTime).toHaveBeenCalledWith(0, 4);
    expect(contexts[0]?.gain.gain.linearRampToValueAtTime).toHaveBeenCalledWith(0.42, 4.18);
    expect(contexts[0]?.source.start).toHaveBeenCalledOnce();
    expect(contexts[0]?.source.connect).toHaveBeenCalledWith(contexts[0]?.gain);
  });

  it("does not start WebAudio playback after cancellation during decode", async () => {
    let resolveDecode: ((buffer: AudioBuffer) => void) | undefined;
    const contexts: TestAudioContext[] = [];
    const AudioContextCtor = class extends TestAudioContext {
      constructor() {
        super();
        this.decodeAudioData = vi.fn(
          () => new Promise<AudioBuffer>((resolve) => {
            resolveDecode = resolve;
          })
        );
        contexts.push(this);
      }
    };
    const output = new BrowserSpeechSynthesisOutput(
      undefined,
      undefined,
      undefined,
      undefined,
      AudioContextCtor as unknown as typeof AudioContext
    );

    const speaking = output.speak("real audio", {
      audio: new Uint8Array([0x49, 0x44, 0x33, 0x03, 0, 0, 0, 0])
    });
    output.cancel();
    resolveDecode?.(contexts[0]!.buffer as unknown as AudioBuffer);

    await expect(speaking).rejects.toThrow("Speech playback failed: canceled");
    await Promise.resolve();
    expect(contexts[0]?.source.start).not.toHaveBeenCalled();
    expect(contexts[0]?.close).toHaveBeenCalled();
  });

  it("cancels active audio playback", async () => {
    const audioElements: TestAudioElement[] = [];
    const AudioElement = class extends TestAudioElement {
      constructor(src: string) {
        super(src);
        audioElements.push(this);
      }
    };
    const output = new BrowserSpeechSynthesisOutput(
      undefined,
      undefined,
      AudioElement as unknown as typeof Audio,
      {
        createObjectURL: () => "blob:greyfield-audio",
        revokeObjectURL: vi.fn()
      },
      undefined
    );

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

class TestAudioContext {
  currentTime = 4;
  destination = {};
  source = {
    buffer: null as AudioBuffer | null,
    onended: null as ((event: Event) => void) | null,
    connect: vi.fn(),
    start: vi.fn(() => {
      this.source.onended?.(new Event("ended"));
    }),
    stop: vi.fn()
  };
  gain = {
    gain: {
      setValueAtTime: vi.fn(),
      linearRampToValueAtTime: vi.fn()
    },
    connect: vi.fn()
  };
  buffer = {
    sampleRate: 1_000,
    getChannelData: vi.fn(() => new Float32Array([0, 0.4, 0.8, 0.4, 0]))
  };
  decodeAudioData = vi.fn(async () => this.buffer as unknown as AudioBuffer);
  createBufferSource = vi.fn(() => this.source as unknown as AudioBufferSourceNode);
  createGain = vi.fn(() => this.gain as unknown as GainNode);
  close = vi.fn(async () => undefined);
}
