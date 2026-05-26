import { describe, expect, it, vi } from "vitest";
import { defaultGreyfieldConfig } from "@greyfield/persistence/config-schema";
import { RuntimeService } from "../runtime-service";

describe("RuntimeService", () => {
  it("runs text input in the main-process runtime and emits fake provider events", async () => {
    const service = new RuntimeService(defaultGreyfieldConfig);
    const emit = vi.fn();

    await service.handle({ type: "text.input", text: "醒了吗？" }, emit);

    expect(emit).toHaveBeenCalledWith({ type: "runtime.status", status: "thinking" });
    expect(emit).toHaveBeenCalledWith({ type: "assistant.text.delta", text: "你好，我醒着。" });
    expect(emit).toHaveBeenCalledWith({ type: "assistant.text.final", text: "你好，我醒着。现在可以继续做桌宠了。" });
    expect(emit).toHaveBeenLastCalledWith({ type: "runtime.status", status: "idle" });
  });

  it("uses the OpenAI-compatible provider when config requests it", async () => {
    const fetch = vi.fn(async () => {
      const body = new ReadableStream<Uint8Array>({
        start(controller) {
          const encoder = new TextEncoder();
          controller.enqueue(encoder.encode('data: {"choices":[{"delta":{"content":"远程"}}]}\n\n'));
          controller.enqueue(encoder.encode("data: [DONE]\n\n"));
          controller.close();
        }
      });
      return new Response(body, { status: 200 });
    });
    const service = new RuntimeService(
      {
        ...defaultGreyfieldConfig,
        provider: {
          ...defaultGreyfieldConfig.provider,
          llm: "openai-compatible",
          baseUrl: "https://llm.example/v1",
          apiKey: "secret",
          model: "remote-model"
        }
      },
      { fetch }
    );
    const events: unknown[] = [];

    await service.handle({ type: "text.input", text: "走真实 provider" }, (event) => {
      events.push(event);
    });

    expect(fetch).toHaveBeenCalledWith(
      "https://llm.example/v1/chat/completions",
      expect.objectContaining({
        body: expect.stringContaining('"model":"remote-model"')
      })
    );
    expect(events).toContainEqual({ type: "assistant.text.final", text: "远程" });
  });

  it("tests the fake LLM provider without appending session turns", async () => {
    const service = new RuntimeService(defaultGreyfieldConfig);

    const result = await service.testLLM();

    expect(result).toEqual({
      ok: true,
      message: "LLM test succeeded: 你好，我醒着。",
      firstToken: "你好，我醒着。"
    });
    expect(await service.getRecentTurns(2)).toEqual([]);
  });

  it("tests the OpenAI-compatible provider and reports the first token", async () => {
    const fetch = vi.fn(async () => {
      const body = new ReadableStream<Uint8Array>({
        start(controller) {
          const encoder = new TextEncoder();
          controller.enqueue(encoder.encode('data: {"choices":[{"delta":{"content":"pong"}}]}\n\n'));
          controller.enqueue(encoder.encode("data: [DONE]\n\n"));
          controller.close();
        }
      });
      return new Response(body, { status: 200 });
    });
    const service = new RuntimeService(
      {
        ...defaultGreyfieldConfig,
        provider: {
          ...defaultGreyfieldConfig.provider,
          llm: "openai-compatible",
          baseUrl: "https://llm.example/v1",
          apiKey: "secret",
          model: "remote-model"
        }
      },
      { fetch }
    );

    const result = await service.testLLM();

    expect(result).toEqual({ ok: true, message: "LLM test succeeded: pong", firstToken: "pong" });
    expect(fetch).toHaveBeenCalledWith(
      "https://llm.example/v1/chat/completions",
      expect.objectContaining({
        body: expect.stringContaining('"ping"')
      })
    );
  });

  it("reports missing API key before testing the OpenAI-compatible provider", async () => {
    const fetch = vi.fn();
    const service = new RuntimeService(
      {
        ...defaultGreyfieldConfig,
        provider: {
          ...defaultGreyfieldConfig.provider,
          llm: "openai-compatible",
          baseUrl: "https://llm.example/v1",
          apiKey: "",
          model: "remote-model"
        }
      },
      { fetch }
    );

    await expect(service.testLLM()).resolves.toEqual({
      ok: false,
      message: "OpenAI-compatible provider needs an API key before testing."
    });
    expect(fetch).not.toHaveBeenCalled();
  });

  it("rejects provider testing while a chat response is active", async () => {
    let requestStarted: (() => void) | undefined;
    const started = new Promise<void>((resolve) => {
      requestStarted = resolve;
    });
    const service = new RuntimeService(
      {
        ...defaultGreyfieldConfig,
        provider: {
          ...defaultGreyfieldConfig.provider,
          llm: "openai-compatible",
          baseUrl: "https://llm.example/v1",
          apiKey: "secret",
          model: "remote-model"
        }
      },
      {
        fetch: vi.fn(async (_url, init) => {
          requestStarted?.();
          const signal = init?.signal;
          const body = new ReadableStream<Uint8Array>({
            start(controller) {
              const encoder = new TextEncoder();
              controller.enqueue(encoder.encode('data: {"choices":[{"delta":{"content":"慢"}}]}\n\n'));
              signal?.addEventListener("abort", () => controller.close(), { once: true });
            }
          });
          return new Response(body, { status: 200 });
        })
      }
    );

    const running = service.handle({ type: "text.input", text: "慢一点" }, () => undefined);
    await started;

    await expect(service.testLLM()).resolves.toEqual({
      ok: false,
      message: "LLM test is unavailable while a chat response is running."
    });
    await service.handle({ type: "runtime.interrupt" }, () => undefined);
    await running;
  });

  it("rejects concurrent provider tests", async () => {
    let requestStarted: (() => void) | undefined;
    let finishRequest: (() => void) | undefined;
    const started = new Promise<void>((resolve) => {
      requestStarted = resolve;
    });
    const finish = new Promise<void>((resolve) => {
      finishRequest = resolve;
    });
    const service = new RuntimeService(
      {
        ...defaultGreyfieldConfig,
        provider: {
          ...defaultGreyfieldConfig.provider,
          llm: "openai-compatible",
          baseUrl: "https://llm.example/v1",
          apiKey: "secret",
          model: "remote-model"
        }
      },
      {
        fetch: vi.fn(async () => {
          requestStarted?.();
          await finish;
          const body = new ReadableStream<Uint8Array>({
            start(controller) {
              const encoder = new TextEncoder();
              controller.enqueue(encoder.encode('data: {"choices":[{"delta":{"content":"pong"}}]}\n\n'));
              controller.enqueue(encoder.encode("data: [DONE]\n\n"));
              controller.close();
            }
          });
          return new Response(body, { status: 200 });
        })
      }
    );

    const firstTest = service.testLLM();
    await started;

    await expect(service.testLLM()).resolves.toEqual({
      ok: false,
      message: "LLM test is already running."
    });
    finishRequest?.();
    await expect(firstTest).resolves.toEqual({
      ok: true,
      message: "LLM test succeeded: pong",
      firstToken: "pong"
    });
  });

  it("can update config without losing accumulated fake session history", async () => {
    const service = new RuntimeService(defaultGreyfieldConfig);
    await service.handle({ type: "text.input", text: "第一轮" }, () => undefined);

    service.updateConfig({
      ...defaultGreyfieldConfig,
      provider: { ...defaultGreyfieldConfig.provider, model: "next-model" }
    });
    await service.handle({ type: "text.input", text: "第二轮" }, () => undefined);

    expect(await service.getRecentTurns(4)).toEqual([
      { role: "user", content: "第一轮" },
      { role: "assistant", content: "你好，我醒着。现在可以继续做桌宠了。" },
      { role: "user", content: "第二轮" },
      { role: "assistant", content: "你好，我醒着。现在可以继续做桌宠了。" }
    ]);
  });

  it("interrupt aborts the active OpenAI-compatible request", async () => {
    let capturedSignal: AbortSignal | undefined;
    let requestStarted: (() => void) | undefined;
    const started = new Promise<void>((resolve) => {
      requestStarted = resolve;
    });
    const service = new RuntimeService(
      {
        ...defaultGreyfieldConfig,
        provider: {
          ...defaultGreyfieldConfig.provider,
          llm: "openai-compatible",
          baseUrl: "https://llm.example/v1",
          apiKey: "secret",
          model: "remote-model"
        }
      },
      {
        fetch: vi.fn(async (_url, init) => {
          capturedSignal = init?.signal ?? undefined;
          requestStarted?.();
          const body = new ReadableStream<Uint8Array>({
            start(controller) {
              const encoder = new TextEncoder();
              controller.enqueue(encoder.encode('data: {"choices":[{"delta":{"content":"慢"}}]}\n\n'));
              capturedSignal?.addEventListener("abort", () => controller.close(), { once: true });
            }
          });
          return new Response(body, { status: 200 });
        })
      }
    );

    const running = service.handle({ type: "text.input", text: "慢一点" }, () => undefined);
    await started;
    await service.handle({ type: "runtime.interrupt" }, () => undefined);
    await running;

    expect(capturedSignal?.aborted).toBe(true);
  });

  it("interrupts the active text run before accepting a newer text input", async () => {
    const signals: AbortSignal[] = [];
    const requestTexts: string[] = [];
    const startedResolvers: Array<() => void> = [];
    const started = [0, 1].map(
      (index) =>
        new Promise<void>((resolve) => {
          startedResolvers[index] = resolve;
        })
    );
    const service = new RuntimeService(
      {
        ...defaultGreyfieldConfig,
        provider: {
          ...defaultGreyfieldConfig.provider,
          llm: "openai-compatible",
          baseUrl: "https://llm.example/v1",
          apiKey: "secret",
          model: "remote-model"
        }
      },
      {
        fetch: vi.fn(async (_url, init) => {
          const requestIndex = signals.length;
          const bodyText = String(init?.body ?? "");
          requestTexts.push(bodyText);
          const signal = init?.signal;
          if (signal) {
            signals.push(signal);
          }
          startedResolvers[requestIndex]?.();
          const body = new ReadableStream<Uint8Array>({
            start(controller) {
              const encoder = new TextEncoder();
              controller.enqueue(encoder.encode(`data: {"choices":[{"delta":{"content":"${requestIndex}"}}]}\n\n`));
              signal?.addEventListener("abort", () => controller.close(), { once: true });
              if (requestIndex === 1) {
                controller.enqueue(encoder.encode("data: [DONE]\n\n"));
                controller.close();
              }
            }
          });
          return new Response(body, { status: 200 });
        })
      }
    );

    const firstRun = service.handle({ type: "text.input", text: "第一条" }, () => undefined);
    await started[0];
    const secondRun = service.handle({ type: "text.input", text: "第二条" }, () => undefined);
    await started[1];
    await Promise.all([firstRun, secondRun]);

    expect(signals[0]?.aborted).toBe(true);
    expect(signals[1]?.aborted).toBe(false);
    expect(requestTexts[0]).toContain("第一条");
    expect(requestTexts[1]).toContain("第二条");
  });
});
