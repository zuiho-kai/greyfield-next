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
});
