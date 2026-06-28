import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { describe, expect, it, vi } from "vitest";
import { defaultGreyfieldConfig } from "@greyfield/persistence/config-schema";
import type {
  AppendSummarySegment,
  AppendSessionTurn,
  MemoryAtom,
  MemoryAtomStore,
  SessionHandoff,
  SessionStore,
  SessionTurn,
  SummarySegment,
  SummarySegmentStore,
  UpdateMemoryAtom
} from "@greyfield/core-runtime";
import { createDesktopRuntimeStoreOptions } from "../desktop-runtime-stores";
import { RuntimeService } from "../runtime-service";

function makeSummarySegment(id: string, threadId: string, summary: string): SummarySegment {
  return {
    id,
    threadId,
    sessionId: "desktop-main-session",
    summary,
    recallCues: [id],
    sourceTurns: [
      {
        sessionId: "desktop-main-session",
        turnId: `${id}-turn`,
        role: "user",
        createdAt: "2026-06-27T00:00:00.000Z"
      }
    ],
    createdAt: "2026-06-27T00:00:00.000Z",
    updatedAt: "2026-06-27T00:00:00.000Z"
  };
}

const redactedSecretPlaceholder = "[redacted-secret]";

function expectNoSecrets(value: unknown, secrets: string[]): void {
  const serialized = JSON.stringify(value) ?? "";
  for (const secret of secrets) {
    expect(serialized).not.toContain(secret);
  }
  expect(serialized).not.toMatch(/\bsk-[A-Za-z0-9_-]{8,}\b/u);
  expect(serialized).toContain(redactedSecretPlaceholder);
}

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

      const edited = await service.updateMemorySummary("summary-1", {
        summary: "Edited memory: User prefers Hiyori.",
        recallCues: ["edited-hiyori", "hiyori"]
      });
      expect(edited).toMatchObject({
        ok: true,
        message: "Memory summary-1 saved.",
        snapshot: {
          summarySegments: [
            expect.objectContaining({
              id: "summary-1",
              summary: "Edited memory: User prefers Hiyori.",
              recallCues: ["edited-hiyori", "hiyori"],
              disabled: false
            })
          ]
        }
      });

      const exported = await service.exportMemory();
      expect(exported.summarySegments[0]).toMatchObject({
        id: "summary-1",
        summary: "Edited memory: User prefers Hiyori."
      });
      expect(exported.recentTurns.some((turn) => turn.content.includes("第一轮：我喜欢 Hiyori"))).toBe(true);

      const disabled = await service.updateMemorySummary("summary-1", { disabled: true });
      expect(disabled).toMatchObject({
        ok: true,
        message: "Memory summary-1 disabled.",
        snapshot: {
          summarySegments: [expect.objectContaining({ id: "summary-1", disabled: true })]
        }
      });
      await service.handle({ type: "text.input", text: "edited-hiyori 这个记忆还在吗？" }, (event) => {
        events.push(event);
      });
      const disabledSnapshot = await service.getMemoryDebugSnapshot();
      expect(disabledSnapshot.lastRecallContext?.items.map((item) => item.id)).not.toContain("summary-1");
      expect(disabledSnapshot.lastRecallContext?.skipped).toContainEqual({
        kind: "summary-segment",
        id: "summary-1",
        reason: "disabled"
      });

      const deleted = await service.deleteMemorySummary("summary-1");
      expect(deleted.ok).toBe(true);
      expect(deleted.snapshot?.summarySegments.some((segment) => segment.id === "summary-1")).toBe(false);
      const sessionJsonlAfterDelete = await readFile(join(dir, "sessions", "desktop-main-session.jsonl"), "utf8");
      expect(sessionJsonlAfterDelete).toContain("第一轮：我喜欢 Hiyori。");
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("clears only the current character thread summary memories", async () => {
    let summaries: SummarySegment[] = [
      makeSummarySegment("summary-1", "desktop:characters-greyfield-yaml", "Current thread memory."),
      makeSummarySegment("summary-2", "desktop:characters-greyfield-yaml", "Second current thread memory."),
      makeSummarySegment("summary-other", "desktop:other-character", "Other character memory.")
    ];
    const service = new RuntimeService(defaultGreyfieldConfig, {
      summarySegmentStore: {
        async append() {
          throw new Error("append is not used by this test");
        },
        async get(id) {
          return summaries.find((segment) => segment.id === id) ?? null;
        },
        async list(threadId) {
          return summaries.filter((segment) => segment.threadId === threadId);
        },
        async update() {
          throw new Error("update is not used by this test");
        },
        async delete(id) {
          const before = summaries.length;
          summaries = summaries.filter((segment) => segment.id !== id);
          return summaries.length !== before;
        }
      }
    });

    const result = await service.clearMemorySummaries();

    expect(result).toMatchObject({
      ok: true,
      message: "Cleared 2 summary memories. Raw chat history was kept.",
      snapshot: {
        summarySegments: []
      }
    });
    expect(summaries.map((segment) => segment.id)).toEqual(["summary-other"]);
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

  it("writes desktop memory atoms and recalls them from file-backed stores", async () => {
    const dir = await mkdtemp(join(tmpdir(), "greyfield-runtime-atoms-"));
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
      const config = {
        ...defaultGreyfieldConfig,
        characterFile: "characters/test.yaml"
      };
      const firstService = new RuntimeService(config, createDesktopRuntimeStoreOptions({ projectRoot: dir, userDataPath: dir }));

      await firstService.handle(
        { type: "text.input", text: "今天是我们第一次遇见的纪念日，记住我送你一朵玫瑰，以后每年提醒我。" },
        () => undefined
      );

      const atomJsonl = await readFile(join(dir, "memory", "atoms.jsonl"), "utf8");
      expect(atomJsonl).toContain("relationship_event");
      expect(atomJsonl).toContain("desktop-main-session-1");
      expect(atomJsonl).toContain("送玫瑰");

      let requestBody = "";
      const fetch = vi.fn(async (_url, init) => {
        requestBody = String(init?.body ?? "");
        const body = new ReadableStream<Uint8Array>({
          start(controller) {
            const encoder = new TextEncoder();
            controller.enqueue(encoder.encode('data: {"choices":[{"delta":{"content":"rose"}}]}\n\n'));
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

      await secondService.handle({ type: "text.input", text: "初遇纪念日要准备什么？" }, () => undefined);

      const messages = JSON.parse(requestBody).messages as Array<{ role: string; content: string }>;
      const system = messages[0]?.content ?? "";
      expect(system).toContain("Long-term recall context:");
      expect(system).toContain("Source-linked relationship memory");
      expect(system).toContain("Source turns: desktop-main-session-1");
      expect(system).toContain("Ritual action: 送玫瑰");
      expect(system).not.toContain("memory-atom");
      expect(system).not.toMatch(/\batom-(?:fact|preference|opinion|relationship_event|episodic_scene)-[\w-]+/u);
      expect(system).not.toContain("database");
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("exports, updates, deletes, and clears only current-role memory atoms", async () => {
    const providerSecret = "runtime-provider-secret";
    const memoryAtomStore = new TestMemoryAtomStore([
      makeMemoryAtom({
        id: "atom-current-fact",
        threadId: "thread-a",
        type: "fact",
        text: "User birthday is June 12.",
        sourceTurnIds: ["turn-a-1"]
      }),
      makeMemoryAtom({
        id: "atom-current-preference",
        threadId: "thread-a",
        type: "preference",
        text: "User prefers Hiyori.",
        sourceTurnIds: ["turn-a-2"]
      }),
      makeMemoryAtom({
        id: "atom-other-role",
        threadId: "thread-b",
        type: "opinion",
        text: "Other role memory stays isolated.",
        sourceTurnIds: ["turn-b-1"]
      })
    ]);
    const service = new RuntimeService(
      {
        ...defaultGreyfieldConfig,
        provider: {
          ...defaultGreyfieldConfig.provider,
          apiKey: providerSecret
        }
      },
      {
        threadId: "thread-a",
        memoryAtomStore
      }
    );

    const snapshot = await service.getMemoryLibrarySnapshot();
    expect(snapshot.memoryAtoms.map((atom) => atom.id)).toEqual(["atom-current-fact", "atom-current-preference"]);

    const edited = await service.updateMemoryAtom("atom-current-preference", {
      text: "Edited atom memory: User prefers Sakura.",
      disabled: true
    });
    expect(edited).toMatchObject({
      ok: true,
      message: "Atom memory atom-current-preference disabled.",
      snapshot: {
        memoryAtoms: [
          expect.objectContaining({ id: "atom-current-fact" }),
          expect.objectContaining({
            id: "atom-current-preference",
            text: "Edited atom memory: User prefers Sakura.",
            disabled: true
          })
        ]
      }
    });

    await expect(service.updateMemoryAtom("atom-other-role", { disabled: true })).resolves.toMatchObject({
      ok: false,
      message: "Atom memory atom-other-role was not found in the current role."
    });
    expect(memoryAtomStore.getAll().find((atom) => atom.id === "atom-other-role")?.disabled).toBe(false);

    const exported = await service.exportMemory();
    expect(exported.memoryAtoms.map((atom) => atom.id)).toEqual(["atom-current-fact", "atom-current-preference"]);
    expect(JSON.stringify(exported)).not.toContain(providerSecret);

    await expect(service.exportMemoryAtom("atom-current-preference")).resolves.toMatchObject({
      memoryAtoms: [expect.objectContaining({ id: "atom-current-preference" })],
      recentTurns: [],
      summarySegments: []
    });
    await expect(service.exportMemoryAtom("atom-other-role")).resolves.toBeNull();

    const deleted = await service.deleteMemoryAtom("atom-current-fact");
    expect(deleted).toMatchObject({
      ok: true,
      message: "Atom memory atom-current-fact deleted. Raw chat history and summaries were kept.",
      snapshot: {
        memoryAtoms: [expect.objectContaining({ id: "atom-current-preference" })]
      }
    });
    expect(memoryAtomStore.getAll().some((atom) => atom.id === "atom-current-fact")).toBe(false);

    const cleared = await service.clearCurrentRoleMemoryAtoms();
    expect(cleared).toMatchObject({
      ok: true,
      message: "Cleared 1 current role atom memory. Raw chat history and summaries were kept.",
      snapshot: {
        memoryAtoms: []
      }
    });
    expect(memoryAtomStore.getAll().map((atom) => atom.id)).toEqual(["atom-other-role"]);
  });

  it("resolves memory source passages with session-safe turn references for snapshot and export", async () => {
    const currentSessionCollisionText = "CURRENT SESSION COLLISION TEXT SHOULD NOT BE USED";
    const sessionStore = new TestSessionStore("current-session", [
      {
        id: "turn-collision",
        role: "user",
        content: currentSessionCollisionText,
        createdAt: "2026-06-28T00:00:00.000Z"
      },
      {
        id: "legacy-turn",
        role: "assistant",
        content: "Legacy source from the current session is allowed.",
        createdAt: "2026-06-28T00:01:00.000Z"
      }
    ]);
    const summarySegmentStore = new TestSummarySegmentStore([
      {
        id: "summary-foreign",
        threadId: "thread-a",
        sessionId: "foreign-session",
        summary: "Foreign summary points at a colliding turn id.",
        recallCues: ["foreign"],
        sourceTurns: [
          {
            sessionId: "foreign-session",
            turnId: "turn-collision",
            role: "user",
            createdAt: "2026-06-27T00:00:00.000Z"
          }
        ],
        sourceTurnIds: ["turn-collision"],
        createdAt: "2026-06-28T00:02:00.000Z",
        updatedAt: "2026-06-28T00:02:00.000Z"
      },
      {
        id: "summary-legacy",
        threadId: "thread-a",
        sessionId: "foreign-session",
        summary: "Legacy summary source ids use the current session.",
        recallCues: ["legacy"],
        sourceTurns: [],
        sourceTurnIds: ["legacy-turn"],
        createdAt: "2026-06-28T00:03:00.000Z",
        updatedAt: "2026-06-28T00:03:00.000Z"
      }
    ]);
    const memoryAtomStore = new TestMemoryAtomStore([
      makeMemoryAtom({
        id: "atom-foreign",
        threadId: "thread-a",
        text: "Foreign atom points at a colliding turn id.",
        sourceSessionId: "foreign-session",
        sourceTurnIds: ["turn-collision"]
      })
    ]);
    const service = new RuntimeService(defaultGreyfieldConfig, {
      threadId: "thread-a",
      sessionStore,
      summarySegmentStore,
      memoryAtomStore
    });

    const snapshot = await service.getMemoryLibrarySnapshot(0);
    const foreignSummaryPassage = snapshot.summarySegments.find((segment) => segment.id === "summary-foreign")
      ?.sourcePassages[0];
    expect(foreignSummaryPassage).toMatchObject({
      sessionId: "foreign-session",
      turnId: "turn-collision",
      status: "unavailable"
    });
    expect(foreignSummaryPassage).not.toHaveProperty("text");
    expect(snapshot.summarySegments.find((segment) => segment.id === "summary-legacy")?.sourcePassages[0]).toMatchObject({
      sessionId: "current-session",
      turnId: "legacy-turn",
      status: "available",
      text: "Legacy source from the current session is allowed."
    });
    expect(snapshot.memoryAtoms[0]?.sourcePassages[0]).toMatchObject({
      sessionId: "foreign-session",
      turnId: "turn-collision",
      status: "unavailable"
    });
    expect(JSON.stringify(snapshot)).toContain("unavailable");
    expect(JSON.stringify(snapshot)).not.toContain(currentSessionCollisionText);

    const exported = await service.exportMemory(0);
    expect(exported.summarySegments.find((segment) => segment.id === "summary-foreign")?.sourcePassages[0]).toMatchObject({
      sessionId: "foreign-session",
      turnId: "turn-collision",
      status: "unavailable"
    });
    expect(exported.memoryAtoms[0]?.sourcePassages[0]).toMatchObject({
      sessionId: "foreign-session",
      turnId: "turn-collision",
      status: "unavailable"
    });
    expect(JSON.stringify(exported)).toContain("unavailable");
    expect(JSON.stringify(exported)).not.toContain(currentSessionCollisionText);
  });

  it("redacts configured provider keys and provider-style tokens from memory snapshots and exports", async () => {
    const providerSecret = "configured-provider-secret-101";
    const skSecret = "sk-redactionGate_1234567890";
    const secrets = [providerSecret, skSecret];
    const sessionStore = new TestSessionStore("redaction-session", [
      {
        id: "turn-secret-raw",
        role: "user",
        content: `raw turn has ${providerSecret} and ${skSecret}`,
        createdAt: "2026-06-28T01:00:00.000Z",
        meta: {
          note: `turn metadata has ${skSecret}`
        }
      }
    ]);
    const summarySegmentStore = new TestSummarySegmentStore([
      {
        id: "summary-secret",
        threadId: "thread-a",
        sessionId: "redaction-session",
        summary: `summary has ${providerSecret}`,
        recallCues: ["needle", `cue has ${skSecret}`],
        sourceTurns: [
          {
            sessionId: "redaction-session",
            turnId: "turn-secret-raw",
            role: "user",
            createdAt: "2026-06-28T01:00:00.000Z"
          }
        ],
        sourceTurnIds: ["turn-secret-raw"],
        createdAt: "2026-06-28T01:01:00.000Z",
        updatedAt: "2026-06-28T01:01:00.000Z"
      }
    ]);
    const memoryAtomStore = new TestMemoryAtomStore([
      makeMemoryAtom({
        id: "atom-secret",
        threadId: "thread-a",
        text: `atom text has ${skSecret}`,
        sourceTurnIds: ["turn-secret-raw"],
        triggerKeys: [`trigger has ${providerSecret}`],
        triggers: {
          exact: [`exact has ${skSecret}`],
          aliases: [`alias has ${providerSecret}`],
          secondary: []
        },
        eventDate: {
          kind: "absolute",
          sourceText: `event date has ${skSecret}`,
          precision: "day",
          isoDate: "2026-06-28"
        },
        recurrence: {
          frequency: "annual",
          sourceText: `recurrence has ${providerSecret}`
        },
        ritualAction: `ritual action has ${skSecret}`,
        subject: `subject has ${providerSecret}`,
        object: `object has ${skSecret}`,
        metadata: {
          note: `metadata has ${providerSecret}`,
          tags: [`metadata tag has ${skSecret}`],
          count: 1
        }
      })
    ]);
    const events: unknown[] = [];
    const service = new RuntimeService(
      {
        ...defaultGreyfieldConfig,
        provider: {
          ...defaultGreyfieldConfig.provider,
          apiKey: providerSecret
        }
      },
      {
        threadId: "thread-a",
        sessionStore,
        summarySegmentStore,
        memoryAtomStore
      }
    );

    await service.handle({ type: "text.input", text: "needle recall please" }, (event) => {
      events.push(event);
    });

    const recallEvent = events.find(
      (event): event is { type: "memory.recall.context"; context: unknown } =>
        typeof event === "object" && event !== null && "type" in event && event.type === "memory.recall.context"
    );
    expect(recallEvent).toBeDefined();
    expectNoSecrets(recallEvent?.context, secrets);

    const snapshot = await service.getMemoryLibrarySnapshot();
    expectNoSecrets(snapshot, secrets);
    expect(snapshot.recentTurns.find((turn) => turn.id === "turn-secret-raw")?.content).toContain(redactedSecretPlaceholder);
    expect(snapshot.summarySegments[0]).toMatchObject({
      id: "summary-secret",
      sourceTurnIds: ["turn-secret-raw"],
      summary: `summary has ${redactedSecretPlaceholder}`
    });
    expect(snapshot.summarySegments[0]?.recallCues).toContain(`cue has ${redactedSecretPlaceholder}`);
    expect(snapshot.summarySegments[0]?.sourcePassages[0]).toMatchObject({
      turnId: "turn-secret-raw",
      text: `raw turn has ${redactedSecretPlaceholder} and ${redactedSecretPlaceholder}`
    });
    expect(snapshot.memoryAtoms[0]).toMatchObject({
      id: "atom-secret",
      sourceTurnIds: ["turn-secret-raw"],
      text: `atom text has ${redactedSecretPlaceholder}`,
      triggerKeys: [`trigger has ${redactedSecretPlaceholder}`],
      triggers: {
        exact: [`exact has ${redactedSecretPlaceholder}`],
        aliases: [`alias has ${redactedSecretPlaceholder}`]
      },
      eventDate: {
        sourceText: `event date has ${redactedSecretPlaceholder}`
      },
      recurrence: {
        sourceText: `recurrence has ${redactedSecretPlaceholder}`
      },
      ritualAction: `ritual action has ${redactedSecretPlaceholder}`,
      subject: `subject has ${redactedSecretPlaceholder}`,
      object: `object has ${redactedSecretPlaceholder}`,
      metadata: {
        note: `metadata has ${redactedSecretPlaceholder}`,
        tags: [`metadata tag has ${redactedSecretPlaceholder}`]
      }
    });
    expect(snapshot.lastRecallContext?.items[0]).toMatchObject({
      id: "summary-secret",
      sourceTurnIds: ["turn-secret-raw"],
      summary: `summary has ${redactedSecretPlaceholder}`,
      recallCues: ["needle", `cue has ${redactedSecretPlaceholder}`]
    });

    const exported = await service.exportMemory();
    expectNoSecrets(exported, secrets);
    expect(exported.summarySegments[0]?.sourcePassages[0]?.turnId).toBe("turn-secret-raw");

    const atomExport = await service.exportMemoryAtom("atom-secret");
    expectNoSecrets(atomExport, secrets);
    expect(atomExport).toMatchObject({
      recentTurns: [],
      summarySegments: [],
      memoryAtoms: [
        expect.objectContaining({
          id: "atom-secret",
          text: `atom text has ${redactedSecretPlaceholder}`
        })
      ]
    });
    expect(atomExport?.memoryAtoms[0]?.sourcePassages[0]?.text).toBe(
      `raw turn has ${redactedSecretPlaceholder} and ${redactedSecretPlaceholder}`
    );
  });

  it("keeps disabled and deleted memory atoms out of prompt recall", async () => {
    const memoryAtomStore = new TestMemoryAtomStore([
      makeMemoryAtom({
        id: "atom-hiyori",
        threadId: "thread-a",
        type: "preference",
        text: "Atom recall target: User prefers Hiyori.",
        sourceTurnIds: ["turn-hiyori"],
        triggers: {
          exact: ["Hiyori"],
          aliases: ["model"],
          secondary: ["Live2D"]
        },
        triggerKeys: ["hiyori", "model", "live2d"]
      })
    ]);
    const requestBodies: string[] = [];
    const fetch = vi.fn(async (_url, init) => {
      requestBodies.push(String(init?.body ?? ""));
      const body = new ReadableStream<Uint8Array>({
        start(controller) {
          const encoder = new TextEncoder();
          controller.enqueue(encoder.encode('data: {"choices":[{"delta":{"content":"ok"}}]}\n\n'));
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
      {
        threadId: "thread-a",
        memoryAtomStore,
        fetch
      }
    );

    await service.handle({ type: "text.input", text: "Hiyori 模型还在吗？" }, () => undefined);
    expect(requestBodies.at(-1)).toContain("Atom recall target: User prefers Hiyori.");

    await service.updateMemoryAtom("atom-hiyori", { disabled: true });
    await service.handle({ type: "text.input", text: "Hiyori 模型还在吗？" }, () => undefined);
    expect(requestBodies.at(-1)).not.toContain("Atom recall target: User prefers Hiyori.");

    await service.updateMemoryAtom("atom-hiyori", { disabled: false });
    await service.deleteMemoryAtom("atom-hiyori");
    await service.handle({ type: "text.input", text: "Hiyori 模型还在吗？" }, () => undefined);
    expect(requestBodies.at(-1)).not.toContain("Atom recall target: User prefers Hiyori.");
    expect((await service.getMemoryLibrarySnapshot()).memoryAtoms).toEqual([]);
    expect((await service.exportMemory()).memoryAtoms).toEqual([]);
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

class TestMemoryAtomStore implements MemoryAtomStore {
  constructor(private atoms: MemoryAtom[]) {}

  async append(atom: MemoryAtom): Promise<MemoryAtom> {
    return this.upsert(atom);
  }

  async upsert(atom: MemoryAtom): Promise<MemoryAtom> {
    const existingIndex = this.atoms.findIndex((item) => item.id === atom.id);
    if (existingIndex === -1) {
      this.atoms.push(atom);
      return atom;
    }
    this.atoms[existingIndex] = {
      ...this.atoms[existingIndex],
      ...atom
    };
    return this.atoms[existingIndex]!;
  }

  async list(threadId: string): Promise<MemoryAtom[]> {
    return this.atoms.filter((atom) => atom.threadId === threadId);
  }

  async update(id: string, patch: UpdateMemoryAtom): Promise<MemoryAtom | null> {
    const index = this.atoms.findIndex((atom) => atom.id === id);
    if (index === -1) {
      return null;
    }
    const existing = this.atoms[index]!;
    this.atoms[index] = {
      ...existing,
      ...(patch.text !== undefined ? { text: patch.text } : {}),
      ...(patch.disabled !== undefined ? { disabled: patch.disabled } : {}),
      ...(patch.importance !== undefined ? { importance: patch.importance } : {}),
      ...(patch.triggers !== undefined
        ? {
            triggers: {
              exact: patch.triggers.exact ?? existing.triggers.exact,
              aliases: patch.triggers.aliases ?? existing.triggers.aliases,
              secondary: patch.triggers.secondary ?? existing.triggers.secondary,
              ...(patch.triggers.calendar !== undefined || existing.triggers.calendar !== undefined
                ? { calendar: patch.triggers.calendar ?? existing.triggers.calendar ?? [] }
                : {}),
              ...(patch.triggers.environment !== undefined || existing.triggers.environment !== undefined
                ? { environment: patch.triggers.environment ?? existing.triggers.environment ?? [] }
                : {}),
              ...(patch.triggers.semantic !== undefined || existing.triggers.semantic !== undefined
                ? { semantic: patch.triggers.semantic ?? existing.triggers.semantic ?? [] }
                : {}),
              ...(patch.triggers.relationship !== undefined || existing.triggers.relationship !== undefined
                ? { relationship: patch.triggers.relationship ?? existing.triggers.relationship ?? [] }
                : {})
            }
          }
        : {}),
      updatedAt: patch.updatedAt ?? "2026-06-28T00:10:00.000Z"
    };
    return this.atoms[index]!;
  }

  async delete(id: string): Promise<boolean> {
    const before = this.atoms.length;
    this.atoms = this.atoms.filter((atom) => atom.id !== id);
    return this.atoms.length !== before;
  }

  getAll(): MemoryAtom[] {
    return this.atoms;
  }
}

class TestSummarySegmentStore implements SummarySegmentStore {
  constructor(private summaries: SummarySegment[]) {}

  async append(segment: AppendSummarySegment): Promise<SummarySegment> {
    const createdAt = segment.createdAt ?? "2026-06-28T00:00:00.000Z";
    const stored = {
      ...segment,
      id: `summary-${this.summaries.length + 1}`,
      createdAt,
      updatedAt: createdAt
    };
    this.summaries.push(stored);
    return stored;
  }

  async get(id: string): Promise<SummarySegment | null> {
    return this.summaries.find((summary) => summary.id === id) ?? null;
  }

  async list(threadId: string): Promise<SummarySegment[]> {
    return this.summaries.filter((summary) => summary.threadId === threadId);
  }

  async update(): Promise<SummarySegment | null> {
    throw new Error("update is not used by this test store");
  }

  async delete(id: string): Promise<boolean> {
    const before = this.summaries.length;
    this.summaries = this.summaries.filter((summary) => summary.id !== id);
    return this.summaries.length !== before;
  }
}

class TestSessionStore implements SessionStore {
  private readonly turns: SessionTurn[];

  constructor(readonly sessionId: string, turns: SessionTurn[]) {
    this.turns = [...turns];
  }

  async append(turn: AppendSessionTurn): Promise<SessionTurn> {
    const stored: SessionTurn = {
      id: `${this.sessionId}-${this.turns.length + 1}`,
      role: turn.role,
      content: turn.content,
      createdAt: turn.createdAt ?? "2026-06-28T00:00:00.000Z",
      meta: turn.meta
    };
    this.turns.push(stored);
    return stored;
  }

  async getRecent(limit: number): Promise<SessionTurn[]> {
    return limit <= 0 ? [] : this.turns.slice(-limit);
  }

  async getByIds(turnIds: string[]): Promise<SessionTurn[]> {
    const byId = new Map(this.turns.map((turn) => [turn.id, turn]));
    return [...new Set(turnIds)].flatMap((turnId) => {
      const turn = byId.get(turnId);
      return turn ? [turn] : [];
    });
  }

  async createHandoff(limit = 20): Promise<SessionHandoff> {
    const turns = await this.getRecent(limit);
    return {
      sessionId: this.sessionId,
      turns,
      summary: turns.map((turn) => `${turn.role}: ${turn.content}`).join("\n")
    };
  }
}

function makeMemoryAtom(overrides: Partial<MemoryAtom> = {}): MemoryAtom {
  return {
    id: "atom-memory",
    threadId: "thread-a",
    type: "fact",
    text: "User has an atom memory.",
    sourceTurnIds: ["turn-a-1"],
    createdAt: "2026-06-28T00:00:00.000Z",
    updatedAt: "2026-06-28T00:00:00.000Z",
    importance: 0.8,
    triggerKeys: ["hiyori"],
    triggers: {
      exact: ["Hiyori"],
      aliases: [],
      secondary: []
    },
    metadata: {},
    disabled: false,
    ...overrides
  };
}
