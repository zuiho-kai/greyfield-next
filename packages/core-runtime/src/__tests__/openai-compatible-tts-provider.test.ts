import { afterEach, describe, expect, it, vi } from "vitest";
import { OpenAICompatibleTTSProvider } from "../openai-compatible-tts-provider";

afterEach(() => {
  vi.useRealTimers();
});

describe("OpenAICompatibleTTSProvider", () => {
  it("posts text to the OpenAI-compatible speech endpoint and returns audio bytes", async () => {
    const audio = new Uint8Array([0x49, 0x44, 0x33, 0x03]);
    const fetch = vi.fn(async () => new Response(audio, { status: 200, headers: { "content-type": "audio/mpeg" } }));
    const provider = new OpenAICompatibleTTSProvider({
      baseUrl: "https://example.test/v1",
      apiKey: "test-key",
      model: "FunAudioLLM/CosyVoice2-0.5B",
      fetch
    });

    await expect(provider.synthesize("你好", "FunAudioLLM/CosyVoice2-0.5B:anna")).resolves.toEqual(audio);
    expect(fetch).toHaveBeenCalledWith(
      "https://example.test/v1/audio/speech",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({ Authorization: "Bearer test-key" }),
        body: JSON.stringify({
          model: "FunAudioLLM/CosyVoice2-0.5B",
          voice: "FunAudioLLM/CosyVoice2-0.5B:anna",
          input: "你好",
          response_format: "mp3",
          stream: false
        })
      })
    );
  });

  it("throws readable configuration errors before speaking", async () => {
    const provider = new OpenAICompatibleTTSProvider({
      baseUrl: "https://example.test/v1",
      apiKey: "",
      model: "FunAudioLLM/CosyVoice2-0.5B",
      fetch: vi.fn()
    });

    await expect(provider.synthesize("hello", "voice")).rejects.toThrow(
      "OpenAI-compatible TTS needs an API key before speaking."
    );
  });

  it("throws readable endpoint errors", async () => {
    const provider = new OpenAICompatibleTTSProvider({
      baseUrl: "https://example.test/v1",
      apiKey: "test-key",
      model: "FunAudioLLM/CosyVoice2-0.5B",
      fetch: vi.fn(async () => new Response("bad voice", { status: 400, statusText: "Bad Request" }))
    });

    await expect(provider.synthesize("hello", "voice")).rejects.toThrow(
      "OpenAI-compatible TTS request failed: 400 Bad Request"
    );
  });

  it("links the caller AbortSignal into the speech request", async () => {
    const controller = new AbortController();
    let requestSignal: AbortSignal | undefined;
    let requestStarted: (() => void) | undefined;
    const started = new Promise<void>((resolve) => {
      requestStarted = resolve;
    });
    const provider = new OpenAICompatibleTTSProvider({
      baseUrl: "https://example.test/v1",
      apiKey: "test-key",
      model: "FunAudioLLM/CosyVoice2-0.5B",
      fetch: vi.fn(
        async (_url, init) =>
          new Promise<Response>((_resolve, reject) => {
            requestSignal = init?.signal ?? undefined;
            requestStarted?.();
            init?.signal?.addEventListener("abort", () => reject(new Error("aborted")), { once: true });
          })
      )
    });

    const running = provider.synthesize("hello", "voice", { signal: controller.signal });
    await started;
    controller.abort();

    await expect(running).resolves.toEqual(new Uint8Array());
    expect(requestSignal?.aborted).toBe(true);
  });
});
