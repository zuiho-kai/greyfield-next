import { describe, expect, it, vi } from "vitest";
import { defaultGreyfieldConfig, mergeConfig } from "@greyfield/persistence/config-schema";
import {
  RuntimeProviderFactory,
  testLLMProviderConnectivity,
  testVoiceProviderConnectivity
} from "../runtime-providers";

describe("RuntimeProviderFactory", () => {
  it("validates OpenAI-compatible chat provider settings before tests and chat", () => {
    const missingBaseUrl = new RuntimeProviderFactory(
      mergeConfig({
        provider: {
          ...defaultGreyfieldConfig.provider,
          llm: "openai-compatible",
          baseUrl: "",
          apiKey: "secret",
          model: "remote-model"
        }
      })
    );
    const missingApiKey = new RuntimeProviderFactory(
      mergeConfig({
        provider: {
          ...defaultGreyfieldConfig.provider,
          llm: "openai-compatible",
          baseUrl: "https://llm.example/v1",
          apiKey: "",
          model: "remote-model"
        }
      })
    );
    const missingModel = new RuntimeProviderFactory(
      mergeConfig({
        provider: {
          ...defaultGreyfieldConfig.provider,
          llm: "openai-compatible",
          baseUrl: "https://llm.example/v1",
          apiKey: "secret",
          model: ""
        }
      })
    );

    expect(missingBaseUrl.validateOpenAICompatibleProviderConfig("testing")).toBe(
      "OpenAI-compatible provider needs a Base URL before testing."
    );
    expect(missingApiKey.validateOpenAICompatibleProviderConfig("chatting")).toBe(
      "OpenAI-compatible provider needs an API key before chatting."
    );
    expect(missingModel.validateOpenAICompatibleProviderConfig("testing")).toBe(
      "OpenAI-compatible provider needs a model before testing."
    );
  });

  it("uses the configured OpenAI-compatible chat provider for connectivity tests", async () => {
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
    const factory = new RuntimeProviderFactory(
      mergeConfig({
        provider: {
          ...defaultGreyfieldConfig.provider,
          llm: "openai-compatible",
          baseUrl: "https://llm.example/v1",
          apiKey: "secret",
          model: "remote-model"
        }
      }),
      { fetch }
    );

    await expect(testLLMProviderConnectivity(factory.createChatLLMProvider())).resolves.toEqual({
      ok: true,
      message: "LLM test succeeded: pong",
      firstToken: "pong"
    });
    expect(fetch).toHaveBeenCalledWith(
      "https://llm.example/v1/chat/completions",
      expect.objectContaining({
        body: expect.stringContaining('"model":"remote-model"')
      })
    );
  });

  it("resolves Vision slot fallback and validates voice provider settings", async () => {
    const factory = new RuntimeProviderFactory(
      mergeConfig({
        provider: {
          ...defaultGreyfieldConfig.provider,
          tts: "fake",
          taskModels: {
            ...defaultGreyfieldConfig.provider.taskModels,
            vision: "",
            multimodal: "multimodal-model",
            voiceTts: "voice-model"
          }
        }
      })
    );
    const missingVoice = new RuntimeProviderFactory(
      mergeConfig({
        provider: {
          ...defaultGreyfieldConfig.provider,
          tts: "openai-compatible",
          apiKey: "secret",
          taskModels: {
            ...defaultGreyfieldConfig.provider.taskModels,
            voiceTts: "voice-model"
          }
        },
        voice: {
          ...defaultGreyfieldConfig.voice,
          id: ""
        }
      })
    );

    expect(factory.resolveVisualTaskModel()).toBe("multimodal-model");
    expect(missingVoice.validateTTSProviderConfig()).toBe("OpenAI-compatible TTS needs a voice before testing voice.");
    await expect(testVoiceProviderConnectivity(factory.createTTSProvider(), "fake-voice")).resolves.toMatchObject({
      ok: true,
      message: "Voice test succeeded.",
      text: "你好，这是 Greyfield 的语音测试。"
    });
  });

  it("sends ASR and TTS to their own endpoints while chat keeps the shared one", async () => {
    const calls: Array<{ url: string; init?: RequestInit }> = [];
    const fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      calls.push({ url, init });
      if (url.endsWith("/audio/transcriptions")) {
        return new Response(JSON.stringify({ text: "你好" }), { status: 200 });
      }
      return new Response(new Uint8Array([1, 2, 3]), { status: 200 });
    });
    const factory = new RuntimeProviderFactory(
      mergeConfig({
        provider: {
          ...defaultGreyfieldConfig.provider,
          llm: "openai-compatible",
          asr: "openai-compatible",
          tts: "openai-compatible",
          // 典型场景：文本中转站只有聊天能力，语音在另外两个服务上
          baseUrl: "https://text-only.example/v1",
          apiKey: "chat-key",
          model: "chat-model",
          asrBaseUrl: "https://voice.example/v1",
          asrApiKey: "asr-key",
          ttsBaseUrl: "http://127.0.0.1:8787/v1",
          taskModels: {
            ...defaultGreyfieldConfig.provider.taskModels,
            voiceAsr: "whisper-small",
            voiceTts: "edge-tts"
          }
        }
      }),
      { fetch }
    );

    await expect(factory.createASRProvider().transcribe(new Uint8Array([1, 2, 3]))).resolves.toBe("你好");
    await factory.createTTSProvider().synthesize("你好", "zh-CN-XiaoxiaoNeural");

    expect(calls[0]?.url).toBe("https://voice.example/v1/audio/transcriptions");
    expect(calls[1]?.url).toBe("http://127.0.0.1:8787/v1/audio/speech");
    expect((calls[0]?.init?.headers as Record<string, string>).Authorization).toBe("Bearer asr-key");
    // TTS 没单独填 key，应当回退到共享密钥
    expect((calls[1]?.init?.headers as Record<string, string>).Authorization).toBe("Bearer chat-key");
  });

  it("keeps the shared endpoint when a capability does not override it", async () => {
    const fetch = vi.fn(async (_input: RequestInfo | URL) => new Response(JSON.stringify({ text: "ok" }), { status: 200 }));
    const factory = new RuntimeProviderFactory(
      mergeConfig({
        provider: {
          ...defaultGreyfieldConfig.provider,
          asr: "openai-compatible",
          baseUrl: "https://shared.example/v1",
          apiKey: "shared-key",
          taskModels: {
            ...defaultGreyfieldConfig.provider.taskModels,
            voiceAsr: "whisper-small"
          }
        }
      }),
      { fetch }
    );

    await factory.createASRProvider().transcribe(new Uint8Array([1, 2, 3]));
    expect(String(fetch.mock.calls[0]?.[0])).toBe("https://shared.example/v1/audio/transcriptions");
  });

  it("validates against the capability endpoint instead of only the shared one", () => {
    const dedicatedOnly = new RuntimeProviderFactory(
      mergeConfig({
        provider: {
          ...defaultGreyfieldConfig.provider,
          asr: "openai-compatible",
          tts: "openai-compatible",
          baseUrl: "",
          apiKey: "shared-key",
          asrBaseUrl: "https://voice.example/v1",
          taskModels: {
            ...defaultGreyfieldConfig.provider.taskModels,
            voiceAsr: "whisper-small",
            voiceTts: "edge-tts"
          }
        }
      })
    );

    // ASR 有专用地址，就不该再因为共享地址为空而拦下来
    expect(dedicatedOnly.validateASRProviderConfig("transcribing")).toBe("");
    // TTS 没有专用地址，仍按共享地址为空报错，并提示两处都可以填
    expect(dedicatedOnly.validateTTSProviderConfig()).toBe(
      "OpenAI-compatible TTS needs a Base URL before testing voice. Set the shared Base URL or the TTS Base URL."
    );
  });

  it("rejects a capability endpoint that is present but has no API key anywhere", () => {
    const missingKeys = new RuntimeProviderFactory(
      mergeConfig({
        provider: {
          ...defaultGreyfieldConfig.provider,
          asr: "openai-compatible",
          tts: "openai-compatible",
          baseUrl: "",
          apiKey: "",
          asrBaseUrl: "https://voice.example/v1",
          ttsBaseUrl: "https://voice.example/v1",
          taskModels: {
            ...defaultGreyfieldConfig.provider.taskModels,
            voiceAsr: "whisper-small",
            voiceTts: "edge-tts"
          }
        }
      })
    );

    expect(missingKeys.validateASRProviderConfig("transcribing")).toBe(
      "OpenAI-compatible ASR needs an API key before transcribing. Set the shared API key or the ASR API key."
    );
    expect(missingKeys.validateTTSProviderConfig()).toBe(
      "OpenAI-compatible TTS needs an API key before testing voice. Set the shared API key or the TTS API key."
    );
  });
});
