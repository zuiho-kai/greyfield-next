import { afterEach, describe, expect, it, vi } from "vitest";
import { OpenAICompatibleLLMProvider } from "../openai-compatible-provider";

afterEach(() => {
  vi.useRealTimers();
});

describe("OpenAICompatibleLLMProvider", () => {
  it("does not declare vision support unless the caller creates a Vision model provider", () => {
    expect(
      new OpenAICompatibleLLMProvider({
        baseUrl: "https://example.test/v1",
        apiKey: "test-key",
        model: "chat-model"
      }).supportsVision
    ).toBe(false);
    expect(
      new OpenAICompatibleLLMProvider({
        baseUrl: "https://example.test/v1",
        apiKey: "test-key",
        model: "vision-model",
        supportsVision: true
      }).supportsVision
    ).toBe(true);
  });

  it("streams chat completion delta content from an OpenAI-compatible SSE response", async () => {
    const fetch = vi.fn(async () => {
      const body = new ReadableStream<Uint8Array>({
        start(controller) {
          const encoder = new TextEncoder();
          controller.enqueue(encoder.encode('data: {"choices":[{"delta":{"content":"你"}}]}\n\n'));
          controller.enqueue(encoder.encode('data: {"choices":[{"delta":{"content":"好"}}]}\n\n'));
          controller.enqueue(encoder.encode("data: [DONE]\n\n"));
          controller.close();
        }
      });
      return new Response(body, { status: 200 });
    });
    const provider = new OpenAICompatibleLLMProvider({
      baseUrl: "https://example.test/v1",
      apiKey: "test-key",
      model: "test-model",
      fetch
    });

    const chunks: string[] = [];
    for await (const chunk of provider.stream([{ role: "user", content: "hi" }])) {
      chunks.push(chunk);
    }

    expect(chunks).toEqual(["你", "好"]);
    expect(fetch).toHaveBeenCalledWith(
      "https://example.test/v1/chat/completions",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({ Authorization: "Bearer test-key" })
      })
    );
  });

  it("throws a readable error when the endpoint rejects the request", async () => {
    const provider = new OpenAICompatibleLLMProvider({
      baseUrl: "https://example.test/v1",
      apiKey: "test-key",
      model: "test-model",
      fetch: vi.fn(async () => new Response("bad key", { status: 401, statusText: "Unauthorized" }))
    });

    await expect(async () => {
      for await (const _chunk of provider.stream([{ role: "user", content: "hi" }])) {
        // consume
      }
    }).rejects.toThrow("OpenAI-compatible LLM request failed: 401 Unauthorized");
  });

  it("links the caller AbortSignal into the streaming request", async () => {
    const controller = new AbortController();
    let requestSignal: AbortSignal | undefined;
    let requestStarted: (() => void) | undefined;
    const started = new Promise<void>((resolve) => {
      requestStarted = resolve;
    });
    const fetch = vi.fn(
      async (_url, init) =>
        new Promise<Response>((_resolve, reject) => {
          requestSignal = init?.signal ?? undefined;
          requestStarted?.();
          init?.signal?.addEventListener("abort", () => reject(new Error("aborted")), { once: true });
        })
    );
    const provider = new OpenAICompatibleLLMProvider({
      baseUrl: "https://example.test/v1",
      apiKey: "test-key",
      model: "test-model",
      fetch
    });

    const stream = (async () => {
      for await (const _chunk of provider.stream([{ role: "user", content: "hi" }], undefined, {
        signal: controller.signal
      })) {
        // consume
      }
    })();

    await started;
    expect(fetch).toHaveBeenCalledWith("https://example.test/v1/chat/completions", expect.objectContaining({ signal: requestSignal }));
    expect(requestSignal).toBeInstanceOf(AbortSignal);
    controller.abort();
    expect(requestSignal?.aborted).toBe(true);
    await stream;
  });

  it("throws a readable timeout error when the request hangs", async () => {
    vi.useFakeTimers();
    const provider = new OpenAICompatibleLLMProvider({
      baseUrl: "https://example.test/v1",
      apiKey: "test-key",
      model: "test-model",
      timeoutMs: 50,
      fetch: vi.fn(
        async (_url, init) =>
          new Promise<Response>((_resolve, reject) => {
            init?.signal?.addEventListener("abort", () => reject(new Error("aborted")), { once: true });
          })
      )
    });

    const stream = (async () => {
      for await (const _chunk of provider.stream([{ role: "user", content: "hi" }])) {
        // consume
      }
    })();
    const assertion = expect(stream).rejects.toThrow("OpenAI-compatible LLM request timed out after 50ms");

    await vi.advanceTimersByTimeAsync(50);
    await assertion;
  });

  it("throws a readable error for malformed SSE data", async () => {
    const provider = new OpenAICompatibleLLMProvider({
      baseUrl: "https://example.test/v1",
      apiKey: "test-key",
      model: "test-model",
      fetch: vi.fn(async () => {
        const body = new ReadableStream<Uint8Array>({
          start(controller) {
            controller.enqueue(new TextEncoder().encode("data: not-json\n\n"));
            controller.close();
          }
        });
        return new Response(body, { status: 200 });
      })
    });

    await expect(async () => {
      for await (const _chunk of provider.stream([{ role: "user", content: "hi" }])) {
        // consume
      }
    }).rejects.toThrow("OpenAI-compatible LLM stream returned malformed SSE data");
  });
});
