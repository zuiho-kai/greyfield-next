import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { describe, expect, it, vi } from "vitest";
import { defaultGreyfieldConfig } from "@greyfield/persistence/config-schema";
import { createDesktopRuntimeStoreOptions } from "../desktop-runtime-stores";
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

  it("does not emit desktop TTS chunks until voice output is enabled", async () => {
    const service = new RuntimeService(defaultGreyfieldConfig);
    const events: unknown[] = [];

    await service.handle({ type: "text.input", text: "静音默认值" }, (event) => {
      events.push(event);
    });

    expect(events.some((event) => (event as { type?: string }).type === "assistant.audio.chunk")).toBe(false);
  });

  it("emits desktop TTS chunks when voice output is enabled", async () => {
    const service = new RuntimeService({
      ...defaultGreyfieldConfig,
      provider: {
        ...defaultGreyfieldConfig.provider,
        tts: "fake"
      },
      voice: {
        ...defaultGreyfieldConfig.voice,
        speechEnabled: true
      }
    });
    const events: unknown[] = [];

    await service.handle({ type: "text.input", text: "朗读打开" }, (event) => {
      events.push(event);
    });

    expect(events).toContainEqual({
      type: "assistant.audio.chunk",
      text: "你好，我醒着。",
      data: expect.any(Uint8Array)
    });
  });

  it("routes fake microphone audio through ASR and then chat", async () => {
    const service = new RuntimeService(defaultGreyfieldConfig);
    const events: unknown[] = [];

    await service.handle({ type: "audio.chunk", data: new Uint8Array([1, 2, 3]) }, (event) => {
      events.push(event);
    });
    await service.handle({ type: "audio.end" }, (event) => {
      events.push(event);
    });

    expect(events).toContainEqual({ type: "runtime.status", status: "listening" });
    expect(events).toContainEqual({ type: "transcript.final", text: "这是麦克风语音输入。" });
    expect(events).toContainEqual({ type: "assistant.text.final", text: "你好，我醒着。现在可以继续做桌宠了。" });
    expect(await service.getRecentTurns(2)).toMatchObject([
      { role: "user", content: "这是麦克风语音输入。" },
      { role: "assistant", content: "你好，我醒着。现在可以继续做桌宠了。" }
    ]);
  });

  it("uses the OpenAI-compatible ASR provider for microphone audio", async () => {
    const fetch = vi.fn(async (url) => {
      if (String(url).endsWith("/audio/transcriptions")) {
        return new Response(JSON.stringify({ text: "远程语音输入" }), { status: 200 });
      }
      return new Response(null, { status: 500 });
    });
    const service = new RuntimeService(
      {
        ...defaultGreyfieldConfig,
        provider: {
          ...defaultGreyfieldConfig.provider,
          asr: "openai-compatible",
          baseUrl: "https://voice.example/v1",
          apiKey: "secret",
          asrModel: "whisper-1"
        }
      },
      { fetch }
    );
    const events: unknown[] = [];

    await service.handle({ type: "audio.chunk", data: new Uint8Array([1, 2, 3]) }, (event) => {
      events.push(event);
    });
    await service.handle({ type: "audio.end" }, (event) => {
      events.push(event);
    });

    expect(fetch).toHaveBeenCalledWith(
      "https://voice.example/v1/audio/transcriptions",
      expect.objectContaining({
        method: "POST",
        body: expect.any(FormData)
      })
    );
    expect(events).toContainEqual({ type: "transcript.final", text: "远程语音输入" });
  });

  it("uses the OpenAI-compatible TTS provider when voice output is enabled", async () => {
    const audio = new Uint8Array([0x49, 0x44, 0x33, 0x03]);
    const fetch = vi.fn(async (url) => {
      if (String(url).endsWith("/audio/speech")) {
        return new Response(audio, { status: 200, headers: { "content-type": "audio/mpeg" } });
      }
      return new Response(null, { status: 500 });
    });
    const service = new RuntimeService(
      {
        ...defaultGreyfieldConfig,
        provider: {
          ...defaultGreyfieldConfig.provider,
          tts: "openai-compatible",
          baseUrl: "https://voice.example/v1",
          apiKey: "secret",
          ttsModel: "FunAudioLLM/CosyVoice2-0.5B"
        },
        voice: {
          ...defaultGreyfieldConfig.voice,
          id: "FunAudioLLM/CosyVoice2-0.5B:anna",
          speechEnabled: true
        }
      },
      { fetch }
    );
    const events: unknown[] = [];

    await service.handle({ type: "text.input", text: "朗读打开" }, (event) => {
      events.push(event);
    });

    expect(fetch).toHaveBeenCalledWith(
      "https://voice.example/v1/audio/speech",
      expect.objectContaining({
        body: expect.stringContaining('"model":"FunAudioLLM/CosyVoice2-0.5B"')
      })
    );
    expect(events).toContainEqual({
      type: "assistant.audio.chunk",
      text: "你好，我醒着。",
      data: audio
    });
  });

  it("tests the configured OpenAI-compatible voice without appending session turns", async () => {
    const audio = new Uint8Array([0x49, 0x44, 0x33, 0x03]);
    const fetch = vi.fn(async () => new Response(audio, { status: 200, headers: { "content-type": "audio/mpeg" } }));
    const service = new RuntimeService(
      {
        ...defaultGreyfieldConfig,
        provider: {
          ...defaultGreyfieldConfig.provider,
          tts: "openai-compatible",
          baseUrl: "https://voice.example/v1",
          apiKey: "secret",
          ttsModel: "FunAudioLLM/CosyVoice2-0.5B"
        },
        voice: {
          ...defaultGreyfieldConfig.voice,
          id: "FunAudioLLM/CosyVoice2-0.5B:anna",
          speechEnabled: false
        }
      },
      { fetch }
    );

    const result = await service.testVoice();

    expect(result).toEqual({
      ok: true,
      message: "Voice test succeeded.",
      text: "你好，这是 Greyfield 的语音测试。",
      data: audio
    });
    expect(fetch).toHaveBeenCalledWith(
      "https://voice.example/v1/audio/speech",
      expect.objectContaining({
        body: expect.stringContaining('"voice":"FunAudioLLM/CosyVoice2-0.5B:anna"')
      })
    );
    expect(await service.getRecentTurns(2)).toEqual([]);
  });

  it("reports missing TTS settings before testing an OpenAI-compatible voice", async () => {
    const fetch = vi.fn();
    const missingKey = new RuntimeService(
      {
        ...defaultGreyfieldConfig,
        provider: {
          ...defaultGreyfieldConfig.provider,
          tts: "openai-compatible",
          baseUrl: "https://voice.example/v1",
          apiKey: "",
          ttsModel: "FunAudioLLM/CosyVoice2-0.5B"
        }
      },
      { fetch }
    );
    const missingVoice = new RuntimeService(
      {
        ...defaultGreyfieldConfig,
        provider: {
          ...defaultGreyfieldConfig.provider,
          tts: "openai-compatible",
          baseUrl: "https://voice.example/v1",
          apiKey: "secret",
          ttsModel: "FunAudioLLM/CosyVoice2-0.5B"
        },
        voice: {
          ...defaultGreyfieldConfig.voice,
          id: ""
        }
      },
      { fetch }
    );

    await expect(missingKey.testVoice()).resolves.toEqual({
      ok: false,
      message: "OpenAI-compatible TTS needs an API key before testing voice."
    });
    await expect(missingVoice.testVoice()).resolves.toEqual({
      ok: false,
      message: "OpenAI-compatible TTS needs a voice before testing voice."
    });
    expect(fetch).not.toHaveBeenCalled();
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

  it("reports missing Base URL and model before testing the OpenAI-compatible provider", async () => {
    const fetch = vi.fn();
    const missingBaseUrl = new RuntimeService(
      {
        ...defaultGreyfieldConfig,
        provider: {
          ...defaultGreyfieldConfig.provider,
          llm: "openai-compatible",
          baseUrl: "",
          apiKey: "secret",
          model: "remote-model"
        }
      },
      { fetch }
    );
    const missingModel = new RuntimeService(
      {
        ...defaultGreyfieldConfig,
        provider: {
          ...defaultGreyfieldConfig.provider,
          llm: "openai-compatible",
          baseUrl: "https://llm.example/v1",
          apiKey: "secret",
          model: ""
        }
      },
      { fetch }
    );

    await expect(missingBaseUrl.testLLM()).resolves.toEqual({
      ok: false,
      message: "OpenAI-compatible provider needs a Base URL before testing."
    });
    await expect(missingModel.testLLM()).resolves.toEqual({
      ok: false,
      message: "OpenAI-compatible provider needs a model before testing."
    });
    expect(fetch).not.toHaveBeenCalled();
  });

  it("fails chat with a readable error when OpenAI-compatible provider is missing an API key", async () => {
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

    await expect(service.handle({ type: "text.input", text: "别回退 fake" }, () => undefined)).rejects.toThrow(
      "OpenAI-compatible provider needs an API key before chatting."
    );
    expect(fetch).not.toHaveBeenCalled();
    expect(await service.getRecentTurns(2)).toEqual([]);
  });

  it("fails chat with readable errors when OpenAI-compatible provider is missing Base URL or model", async () => {
    const fetch = vi.fn();
    const missingBaseUrl = new RuntimeService(
      {
        ...defaultGreyfieldConfig,
        provider: {
          ...defaultGreyfieldConfig.provider,
          llm: "openai-compatible",
          baseUrl: "",
          apiKey: "secret",
          model: "remote-model"
        }
      },
      { fetch }
    );
    const missingModel = new RuntimeService(
      {
        ...defaultGreyfieldConfig,
        provider: {
          ...defaultGreyfieldConfig.provider,
          llm: "openai-compatible",
          baseUrl: "https://llm.example/v1",
          apiKey: "secret",
          model: ""
        }
      },
      { fetch }
    );

    await expect(missingBaseUrl.handle({ type: "text.input", text: "别发请求" }, () => undefined)).rejects.toThrow(
      "OpenAI-compatible provider needs a Base URL before chatting."
    );
    await expect(missingModel.handle({ type: "text.input", text: "别发请求" }, () => undefined)).rejects.toThrow(
      "OpenAI-compatible provider needs a model before chatting."
    );
    expect(fetch).not.toHaveBeenCalled();
  });

  it("passes the configured LLM timeout into chat provider requests", async () => {
    const fetch = vi.fn(async (_url, init) => {
      await new Promise((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () => reject(init.signal?.reason), { once: true });
      });
      return new Response(null, { status: 500 });
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
      { fetch, llmTimeoutMs: 20 }
    );

    await expect(service.handle({ type: "text.input", text: "会超时" }, () => undefined)).rejects.toThrow(
      "OpenAI-compatible LLM request timed out after 20ms"
    );
    expect(await service.getRecentTurns(2)).toEqual([]);
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

  it("writes desktop summary segments and exposes a memory debug snapshot", async () => {
    const dir = await mkdtemp(join(tmpdir(), "greyfield-runtime-memory-"));
    try {
      await mkdir(join(dir, "characters"), { recursive: true });
      await mkdir(join(dir, "data"), { recursive: true });
      await writeFile(
        join(dir, "characters", "test.yaml"),
        [
          "name: File Greyfield",
          "tone: exact test tone",
          "boundaries:",
          "  - File persona boundary.",
          "expressionMap:",
          "  neutral: file-neutral"
        ].join("\n"),
        "utf8"
      );
      await writeFile(join(dir, "data", "memory.md"), "- File memory fact.\n", "utf8");
      const service = new RuntimeService(
        {
          ...defaultGreyfieldConfig,
          characterFile: "characters/test.yaml"
        },
        {
          ...createDesktopRuntimeStoreOptions({ projectRoot: dir, userDataPath: dir }),
          recentTurnLimit: 2,
          summaryBatchTurnLimit: 4,
          summaryMinTurns: 4
        }
      );
      const events: unknown[] = [];

      await service.handle({ type: "text.input", text: "第一轮：我喜欢 Hiyori。" }, (event) => {
        events.push(event);
      });
      await service.handle({ type: "text.input", text: "第二轮：记住 Live2D 模型偏好。" }, (event) => {
        events.push(event);
      });
      await service.handle({ type: "text.input", text: "第三轮：继续。" }, (event) => {
        events.push(event);
      });

      const summaryPath = join(dir, "memory", "summary-segments.jsonl");
      const summaryJsonl = await readFile(summaryPath, "utf8");
      expect(summaryJsonl).toContain("第一轮：我喜欢 Hiyori");
      expect(summaryJsonl).toContain("desktop-main-session-1");
      expect(events).toContainEqual(
        expect.objectContaining({
          type: "memory.summary.created",
          segment: expect.objectContaining({
            threadId: "desktop:characters-test-yaml",
            sourceTurns: expect.arrayContaining([
              expect.objectContaining({ turnId: "desktop-main-session-1" }),
              expect.objectContaining({ turnId: "desktop-main-session-4" })
            ])
          })
        })
      );
      await service.handle({ type: "text.input", text: "Hiyori 还是默认模型吗？" }, (event) => {
        events.push(event);
      });

      const snapshot = await service.getMemoryDebugSnapshot();
      expect(snapshot.threadId).toBe("desktop:characters-test-yaml");
      expect(snapshot.recentTurns).toHaveLength(8);
      expect(snapshot.summarySegments).toHaveLength(1);
      expect(snapshot.lastRecallContext?.items[0]).toMatchObject({
        id: "summary-1",
        reason: "cue:hiyori",
        sourceTurnIds: [
          "desktop-main-session-1",
          "desktop-main-session-2",
          "desktop-main-session-3",
          "desktop-main-session-4"
        ]
      });
      expect(snapshot.summarySegments[0]?.sourceTurns.map((turn) => turn.turnId)).toEqual([
        "desktop-main-session-1",
        "desktop-main-session-2",
        "desktop-main-session-3",
        "desktop-main-session-4"
      ]);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("loads desktop persona, memory, and recent turns from file-backed stores", async () => {
    const dir = await mkdtemp(join(tmpdir(), "greyfield-runtime-"));
    try {
      await mkdir(join(dir, "characters"), { recursive: true });
      await mkdir(join(dir, "data"), { recursive: true });
      await writeFile(
        join(dir, "characters", "test.yaml"),
        [
          "name: File Greyfield",
          "tone: exact test tone",
          "boundaries:",
          "  - File persona boundary.",
          "expressionMap:",
          "  neutral: file-neutral",
          "  speaking: file-speaking"
        ].join("\n"),
        "utf8"
      );
      await writeFile(join(dir, "data", "memory.md"), "- File memory fact.\n", "utf8");

      const config = {
        ...defaultGreyfieldConfig,
        characterFile: "characters/test.yaml"
      };
      const firstService = new RuntimeService(config, createDesktopRuntimeStoreOptions({ projectRoot: dir, userDataPath: dir }));

      await firstService.handle({ type: "text.input", text: "第一轮持久化" }, () => undefined);

      const sessionFile = await readFile(join(dir, "sessions", "desktop-main-session.jsonl"), "utf8");
      expect(sessionFile).toContain("第一轮持久化");
      expect(sessionFile).toContain("你好，我醒着。现在可以继续做桌宠了。");

      let requestBody = "";
      const fetch = vi.fn(async (_url, init) => {
        requestBody = String(init?.body ?? "");
        const body = new ReadableStream<Uint8Array>({
          start(controller) {
            const encoder = new TextEncoder();
            controller.enqueue(encoder.encode('data: {"choices":[{"delta":{"content":"second"}}]}\n\n'));
            controller.enqueue(encoder.encode("data: [DONE]\n\n"));
            controller.close();
          }
        });
        return new Response(body, { status: 200 });
      });
      const secondService = new RuntimeService(
        {
          ...config,
          provider: {
            ...config.provider,
            llm: "openai-compatible",
            apiKey: "secret",
            baseUrl: "https://llm.example/v1",
            model: "remote-model"
          }
        },
        {
          ...createDesktopRuntimeStoreOptions({ projectRoot: dir, userDataPath: dir }),
          fetch
        }
      );

      await secondService.handle({ type: "text.input", text: "第二轮读取" }, () => undefined);

      const messages = JSON.parse(requestBody).messages as Array<{ role: string; content: string }>;
      const system = messages[0]?.content ?? "";
      expect(system).toContain("Character: File Greyfield");
      expect(system).toContain("Tone: exact test tone");
      expect(system).toContain("- File persona boundary.");
      expect(system).toContain("- File memory fact.");
      expect(messages).toContainEqual({ role: "user", content: "第一轮持久化" });
      expect(messages).toContainEqual({ role: "assistant", content: "你好，我醒着。现在可以继续做桌宠了。" });
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
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
