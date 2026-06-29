import { describe, expect, it } from "vitest";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { defaultGreyfieldConfig, loadGreyfieldConfig, mergeConfig } from "../config";

describe("Greyfield config", () => {
  it("keeps provider, voice, microphone, window, live2d, and character settings in one schema", () => {
    expect(defaultGreyfieldConfig.provider.llm).toBe("fake");
    expect(defaultGreyfieldConfig.provider.asr).toBe("fake");
    expect(defaultGreyfieldConfig.provider.asrModel).toBe("whisper-1");
    expect(defaultGreyfieldConfig.provider.baseUrl).toBe("https://api.openai.com/v1");
    expect(defaultGreyfieldConfig.audio.microphoneId).toBe("default");
    expect(defaultGreyfieldConfig.characterFile).toBe("characters/greyfield.yaml");
    expect(defaultGreyfieldConfig.voice.speechEnabled).toBe(false);
    expect(defaultGreyfieldConfig.live2d.modelPath).toContain(".model3.json");
    expect(defaultGreyfieldConfig.window.modelPassThrough).toBe(false);
    expect(defaultGreyfieldConfig.ui.speechBubbleEnabled).toBe(true);
    expect(defaultGreyfieldConfig.ui.proactiveMemoryEnabled).toBe(true);
    expect(defaultGreyfieldConfig.ui.locale).toBe("en-US");
    expect(defaultGreyfieldConfig.memory.llmAtomExtractionEnabled).toBe(false);
  });

  it("deep-merges nested settings without dropping defaults", () => {
    const config = mergeConfig({
      provider: { model: "local-test-model" },
      voice: { speechEnabled: true },
      audio: { microphoneId: "mic-2" },
      live2d: { scale: 1.25 },
      ui: { speechBubbleEnabled: false, proactiveMemoryEnabled: false },
      memory: { llmAtomExtractionEnabled: true }
    });

    expect(config.provider).toMatchObject({
      llm: "fake",
      asr: "fake",
      tts: "openai-compatible",
      model: "local-test-model",
      asrModel: "whisper-1",
      ttsModel: "FunAudioLLM/CosyVoice2-0.5B",
      baseUrl: "https://api.openai.com/v1",
      apiKey: ""
    });
    expect(config.audio.microphoneId).toBe("mic-2");
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
    expect(config.ui.locale).toBe("en-US");
    expect(config.memory.llmAtomExtractionEnabled).toBe(true);
  });

  it("normalizes unsupported UI locales to the default Settings language", () => {
    const config = mergeConfig({
      ui: { locale: "fr-FR" } as unknown as Partial<typeof defaultGreyfieldConfig.ui>
    });

    expect(config.ui.locale).toBe("en-US");
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
