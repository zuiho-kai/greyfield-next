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
});
