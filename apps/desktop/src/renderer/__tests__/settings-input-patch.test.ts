import { describe, expect, it } from "vitest";
import { createInitialDesktopRendererState } from "../desktop-runtime-bridge";
import { createTextSettingPatch } from "../settings-input-patch";

describe("createTextSettingPatch", () => {
  it("does not switch the Chat provider when only the Vision model changes", () => {
    const state = createInitialDesktopRendererState();

    expect(createTextSettingPatch(state.settings, "providerVisionModel", "vision-model")).toEqual({
      providerVisionModel: "vision-model"
    });
    expect(createTextSettingPatch(state.settings, "providerPlannerModel", "planner-model")).toEqual({
      providerPlannerModel: "planner-model"
    });
    expect(createTextSettingPatch(state.settings, "providerMemoryModel", "memory-model")).toEqual({
      providerMemoryModel: "memory-model"
    });
    expect(createTextSettingPatch(state.settings, "providerMultimodalModel", "multimodal-model")).toEqual({
      providerMultimodalModel: "multimodal-model"
    });
  });

  it("keeps switching Chat provider fields to OpenAI-compatible when filled from fake mode", () => {
    const state = createInitialDesktopRendererState();
    const advancedProviderFields = [
      "providerPlannerModel",
      "providerUtilityModel",
      "providerMemoryModel",
      "providerVisionModel",
      "providerMultimodalModel",
      "providerASRModel",
      "providerTTSModel"
    ];

    const patches = [
      createTextSettingPatch(state.settings, "providerBaseUrl", "https://llm.example/v1"),
      createTextSettingPatch(state.settings, "providerApiKey", "secret"),
      createTextSettingPatch(state.settings, "providerModel", "chat-model")
    ];

    expect(patches).toEqual([
      { providerBaseUrl: "https://llm.example/v1", providerLLM: "openai-compatible" },
      { providerApiKey: "secret", providerLLM: "openai-compatible" },
      { providerModel: "chat-model", providerLLM: "openai-compatible" }
    ]);
    for (const patch of patches) {
      for (const field of advancedProviderFields) {
        expect(patch).not.toHaveProperty(field);
      }
    }
  });
});
