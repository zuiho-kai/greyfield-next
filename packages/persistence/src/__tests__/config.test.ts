import { describe, expect, it } from "vitest";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { defaultGreyfieldConfig, loadGreyfieldConfig, mergeConfig } from "../config";

describe("Greyfield config", () => {
  it("keeps provider, voice, microphone, window, live2d, and character settings in one schema", () => {
    expect(defaultGreyfieldConfig.provider.llm).toBe("fake");
    expect(defaultGreyfieldConfig.provider.asr).toBe("fake");
    expect(defaultGreyfieldConfig.provider.visionModel).toBe("");
    expect(defaultGreyfieldConfig.provider.taskModels).toMatchObject({
      chat: "greyfield-fake-v1",
      planner: "greyfield-fake-v1",
      utility: "greyfield-fake-v1",
      memory: "greyfield-fake-v1",
      vision: "",
      multimodal: "",
      voiceAsr: "whisper-1",
      voiceTts: "FunAudioLLM/CosyVoice2-0.5B"
    });
    expect(defaultGreyfieldConfig.provider.asrModel).toBe("whisper-1");
    expect(defaultGreyfieldConfig.provider.baseUrl).toBe("https://api.openai.com/v1");
    expect(defaultGreyfieldConfig.audio.microphoneId).toBe("default");
    expect(defaultGreyfieldConfig.characterFile).toBe("characters/greyfield.yaml");
    expect(defaultGreyfieldConfig.voice.speechEnabled).toBe(false);
    expect(defaultGreyfieldConfig.live2d.modelPath).toContain(".model3.json");
    expect(defaultGreyfieldConfig.window.modelPassThrough).toBe(false);
    expect(defaultGreyfieldConfig.window.layerMode).toBe("follow-click");
    expect(defaultGreyfieldConfig.ui.speechBubbleEnabled).toBe(true);
    expect(defaultGreyfieldConfig.ui.proactiveMemoryEnabled).toBe(true);
    expect(defaultGreyfieldConfig.ui.locale).toBe("zh-CN");
    expect(defaultGreyfieldConfig.ui.proactivityLevel).toBe(50);
    expect(defaultGreyfieldConfig.memory.llmAtomExtractionEnabled).toBe(false);
    expect(defaultGreyfieldConfig.memory.llmAtomExtractionInterval).toBe(4);
  });

  it("deep-merges nested settings without dropping defaults", () => {
    const config = mergeConfig({
      provider: { model: "local-test-model" },
      voice: { speechEnabled: true },
      audio: { microphoneId: "mic-2" },
      window: { layerMode: "controls-front" },
      live2d: { scale: 1.25 },
      ui: { speechBubbleEnabled: false, proactiveMemoryEnabled: false, proactivityLevel: 80 },
      memory: { llmAtomExtractionEnabled: true, llmAtomExtractionInterval: 6 }
    });

    expect(config.provider).toMatchObject({
      llm: "fake",
      asr: "fake",
      tts: "openai-compatible",
      model: "local-test-model",
      visionModel: "",
      asrModel: "whisper-1",
      ttsModel: "FunAudioLLM/CosyVoice2-0.5B",
      taskModels: expect.objectContaining({
        chat: "local-test-model",
        planner: "local-test-model",
        utility: "local-test-model",
        memory: "local-test-model",
        vision: ""
      }),
      baseUrl: "https://api.openai.com/v1",
      apiKey: ""
    });
    expect(config.audio.microphoneId).toBe("mic-2");
    expect(config.window.layerMode).toBe("controls-front");
    expect(config.voice).toMatchObject({
      id: "FunAudioLLM/CosyVoice2-0.5B:anna",
      volume: 0.85,
      speechEnabled: true
    });
    expect(config.live2d).toMatchObject({
      modelPath: defaultGreyfieldConfig.live2d.modelPath,
      scale: 1.25
    });
    expect(config.ui.speechBubbleEnabled).toBe(false);
    expect(config.ui.proactiveMemoryEnabled).toBe(false);
    expect(config.ui.locale).toBe("zh-CN");
    expect(config.ui.proactivityLevel).toBe(80);
    expect(config.memory.llmAtomExtractionEnabled).toBe(true);
    expect(config.memory.llmAtomExtractionInterval).toBe(6);
  });

  it("migrates legacy model fields into MaiBot-style task model slots", () => {
    const config = mergeConfig({
      provider: {
        model: "chat-model",
        visionModel: "vision-model",
        asrModel: "asr-model",
        ttsModel: "tts-model"
      }
    });

    expect(config.provider.taskModels).toMatchObject({
      chat: "chat-model",
      planner: "chat-model",
      utility: "chat-model",
      memory: "chat-model",
      vision: "vision-model",
      multimodal: "vision-model",
      voiceAsr: "asr-model",
      voiceTts: "tts-model"
    });
    expect(config.provider).toMatchObject({
      model: "chat-model",
      visionModel: "vision-model",
      asrModel: "asr-model",
      ttsModel: "tts-model"
    });
  });

  it("keeps task-specific model slots isolated from the chat model", () => {
    const config = mergeConfig({
      provider: {
        model: "chat-model",
        taskModels: {
          planner: "planner-model",
          memory: "memory-model",
          multimodal: "multimodal-model"
        }
      }
    });

    expect(config.provider.model).toBe("chat-model");
    expect(config.provider.visionModel).toBe("");
    expect(config.provider.taskModels).toMatchObject({
      chat: "chat-model",
      planner: "planner-model",
      memory: "memory-model",
      vision: "",
      multimodal: "multimodal-model"
    });
  });

  it("prefers explicit task model slots over customized legacy paired fields", () => {
    const customized = mergeConfig({
      provider: {
        model: "legacy-chat",
        visionModel: "legacy-vision",
        asrModel: "legacy-asr",
        ttsModel: "legacy-tts"
      }
    });
    const config = mergeConfig({
      provider: {
        ...customized.provider,
        taskModels: {
          ...customized.provider.taskModels,
          chat: "slot-chat",
          vision: "slot-vision",
          voiceAsr: "slot-asr",
          voiceTts: "slot-tts"
        }
      }
    });

    expect(config.provider).toMatchObject({
      model: "slot-chat",
      visionModel: "slot-vision",
      asrModel: "slot-asr",
      ttsModel: "slot-tts"
    });
    expect(config.provider.taskModels).toMatchObject({
      chat: "slot-chat",
      planner: "legacy-chat",
      utility: "legacy-chat",
      memory: "legacy-chat",
      vision: "slot-vision",
      multimodal: "legacy-vision",
      voiceAsr: "slot-asr",
      voiceTts: "slot-tts"
    });
  });

  it("keeps customized legacy paired fields when full config only has default task model slots", () => {
    const config = mergeConfig({
      provider: {
        model: "legacy-chat",
        visionModel: "legacy-vision",
        asrModel: "legacy-asr",
        ttsModel: "legacy-tts",
        taskModels: defaultGreyfieldConfig.provider.taskModels
      }
    });

    expect(config.provider).toMatchObject({
      model: "legacy-chat",
      visionModel: "legacy-vision",
      asrModel: "legacy-asr",
      ttsModel: "legacy-tts"
    });
    expect(config.provider.taskModels).toMatchObject({
      chat: "legacy-chat",
      planner: "greyfield-fake-v1",
      utility: "greyfield-fake-v1",
      memory: "greyfield-fake-v1",
      vision: "legacy-vision",
      multimodal: "",
      voiceAsr: "legacy-asr",
      voiceTts: "legacy-tts"
    });
  });

  it("normalizes unsupported UI locales to the default Settings language", () => {
    const config = mergeConfig({
      ui: { locale: "fr-FR" } as unknown as Partial<typeof defaultGreyfieldConfig.ui>
    });

    expect(config.ui.locale).toBe("zh-CN");
  });

  it("keeps proactivity level within the Settings slider range", () => {
    expect(mergeConfig({ ui: { proactivityLevel: -1 } }).ui.proactivityLevel).toBe(0);
    expect(mergeConfig({ ui: { proactivityLevel: 100.6 } }).ui.proactivityLevel).toBe(100);
    expect(mergeConfig({ ui: { proactivityLevel: Number.NaN } }).ui.proactivityLevel).toBe(50);
  });

  it("keeps enhanced memory extraction interval within the Settings range", () => {
    expect(mergeConfig({ memory: { llmAtomExtractionInterval: -1 } }).memory.llmAtomExtractionInterval).toBe(1);
    expect(mergeConfig({ memory: { llmAtomExtractionInterval: 7.6 } }).memory.llmAtomExtractionInterval).toBe(8);
    expect(mergeConfig({ memory: { llmAtomExtractionInterval: 30 } }).memory.llmAtomExtractionInterval).toBe(20);
    expect(mergeConfig({ memory: { llmAtomExtractionInterval: Number.NaN } }).memory.llmAtomExtractionInterval).toBe(4);
  });

  it("loads user config files written with a UTF-8 BOM", async () => {
    const dir = await mkdtemp(join(tmpdir(), "greyfield-config-"));
    const path = join(dir, "greyfield.config.json");

    try {
      await writeFile(path, `\ufeff${JSON.stringify({ live2d: { modelPath: "assets/live2d/test.model3.json" } })}`);

      await expect(loadGreyfieldConfig(path)).resolves.toMatchObject({
        live2d: {
          modelPath: "assets/live2d/test.model3.json"
        }
      });
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});
