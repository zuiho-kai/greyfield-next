import { describe, expect, it, vi } from "vitest";
import { OpenAICompatibleASRProvider } from "../openai-compatible-asr-provider";

describe("OpenAICompatibleASRProvider", () => {
  it("posts microphone audio to the OpenAI-compatible transcription endpoint", async () => {
    const fetch = vi.fn<typeof globalThis.fetch>(async () => new Response(JSON.stringify({ text: "你好 Greyfield" }), { status: 200 }));
    const provider = new OpenAICompatibleASRProvider({
      baseUrl: "https://voice.example/v1",
      apiKey: "test-key",
      model: "whisper-1",
      fetch
    });

    await expect(provider.transcribe(new Uint8Array([1, 2, 3]))).resolves.toBe("你好 Greyfield");

    expect(fetch).toHaveBeenCalledWith(
      "https://voice.example/v1/audio/transcriptions",
      expect.objectContaining({
        method: "POST",
        headers: { Authorization: "Bearer test-key" },
        body: expect.any(FormData)
      })
    );
    const body = fetch.mock.calls[0]?.[1]?.body;
    expect(body).toBeInstanceOf(FormData);
    expect((body as FormData).get("model")).toBe("whisper-1");
    expect((body as FormData).get("file")).toBeInstanceOf(Blob);
  });

  it("reports missing ASR settings before making a request", async () => {
    const fetch = vi.fn();
    const provider = new OpenAICompatibleASRProvider({
      baseUrl: "https://voice.example/v1",
      apiKey: "",
      model: "whisper-1",
      fetch
    });

    await expect(provider.transcribe(new Uint8Array([1]))).rejects.toThrow(
      "OpenAI-compatible ASR needs an API key before transcribing."
    );
    expect(fetch).not.toHaveBeenCalled();
  });

  it("passes caller abort to the transcription request", async () => {
    const controller = new AbortController();
    let signal: AbortSignal | undefined;
    const fetch = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
      signal = init?.signal as AbortSignal | undefined;
      await new Promise((resolve) => setTimeout(resolve, 0));
      return new Response(JSON.stringify({ text: "late" }), { status: 200 });
    });
    const provider = new OpenAICompatibleASRProvider({
      baseUrl: "https://voice.example/v1",
      apiKey: "test-key",
      model: "whisper-1",
      fetch
    });

    const running = provider.transcribe(new Uint8Array([1]), { signal: controller.signal });
    controller.abort();
    await running.catch(() => undefined);

    expect(signal?.aborted).toBe(true);
  });
});
