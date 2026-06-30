import { describe, expect, it, vi } from "vitest";
import { defaultGreyfieldConfig } from "@greyfield/persistence/config-schema";
import { SettingsController } from "../settings-controller";

describe("SettingsController", () => {
  it("merges patches, persists config, and emits changed config", async () => {
    const save = vi.fn(async () => undefined);
    const emit = vi.fn();
    const controller = new SettingsController(defaultGreyfieldConfig, save, emit);

    const next = await controller.update({
      provider: { model: "local-model-a" },
      audio: { microphoneId: "mic-array" },
      live2d: { modelPath: "assets/live2d/night/night.model3.json" }
    });

    expect(next.provider).toMatchObject({
      llm: "fake",
      model: "local-model-a"
    });
    expect(next.audio.microphoneId).toBe("mic-array");
    expect(next.live2d.scale).toBe(1);
    expect(save).toHaveBeenCalledWith(next);
    expect(emit).toHaveBeenCalledWith(next);
  });

  it("serializes async saves so older settings writes cannot land after newer input", async () => {
    let firstSaveFinished = false;
    const save = vi.fn(async (config) => {
      if (config.provider.apiKey === "") {
        await new Promise((resolve) => setTimeout(resolve, 10));
        firstSaveFinished = true;
        return;
      }
      expect(firstSaveFinished).toBe(true);
    });
    const emit = vi.fn();
    const controller = new SettingsController(
      {
        ...defaultGreyfieldConfig,
        provider: { ...defaultGreyfieldConfig.provider, apiKey: "old-key" }
      },
      save,
      emit
    );

    const cleared = controller.update({ provider: { apiKey: "" } });
    const typed = controller.update({ provider: { apiKey: "new-key" } });
    const [, finalConfig] = await Promise.all([cleared, typed]);

    expect(finalConfig.provider.apiKey).toBe("new-key");
    expect(save).toHaveBeenLastCalledWith(expect.objectContaining({ provider: expect.objectContaining({ apiKey: "new-key" }) }));
  });

  it("preserves existing UI settings when a partial UI patch is applied", async () => {
    const save = vi.fn(async () => undefined);
    const emit = vi.fn();
    const controller = new SettingsController(
      {
        ...defaultGreyfieldConfig,
        ui: { ...defaultGreyfieldConfig.ui, speechBubbleEnabled: false, proactiveMemoryEnabled: true, proactivityLevel: 80 }
      },
      save,
      emit
    );

    const next = await controller.update({ ui: {} });

    expect(next.ui.speechBubbleEnabled).toBe(false);
    expect(next.ui.proactiveMemoryEnabled).toBe(true);
    expect(next.ui.locale).toBe("zh-CN");
    expect(next.ui.proactivityLevel).toBe(80);
    expect(save).toHaveBeenCalledWith(
      expect.objectContaining({
        ui: { ...defaultGreyfieldConfig.ui, speechBubbleEnabled: false, proactiveMemoryEnabled: true, proactivityLevel: 80 }
      })
    );
  });

  it("preserves existing memory settings when unrelated patches are applied", async () => {
    const save = vi.fn(async () => undefined);
    const emit = vi.fn();
    const controller = new SettingsController(
      {
        ...defaultGreyfieldConfig,
        memory: { llmAtomExtractionEnabled: true }
      },
      save,
      emit
    );

    const next = await controller.update({ provider: { model: "next-model" } });

    expect(next.memory.llmAtomExtractionEnabled).toBe(true);
    expect(save).toHaveBeenCalledWith(expect.objectContaining({ memory: { llmAtomExtractionEnabled: true } }));
  });
});
