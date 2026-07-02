import { describe, expect, it } from "vitest";
import { createInitialDesktopRendererState } from "../desktop-runtime-bridge";
import { createTextSettingPatch } from "../settings-input-patch";

describe("createTextSettingPatch", () => {
  it("does not switch the Chat provider when only the Vision model changes", () => {
    const state = createInitialDesktopRendererState();

    expect(createTextSettingPatch(state.settings, "providerVisionModel", "vision-model")).toEqual({
      providerVisionModel: "vision-model"
    });
  });

  it("keeps switching Chat provider fields to OpenAI-compatible when filled from fake mode", () => {
    const state = createInitialDesktopRendererState();

    expect(createTextSettingPatch(state.settings, "providerBaseUrl", "https://llm.example/v1")).toEqual({
      providerBaseUrl: "https://llm.example/v1",
      providerLLM: "openai-compatible"
    });
    expect(createTextSettingPatch(state.settings, "providerApiKey", "secret")).toEqual({
      providerApiKey: "secret",
      providerLLM: "openai-compatible"
    });
    expect(createTextSettingPatch(state.settings, "providerModel", "chat-model")).toEqual({
      providerModel: "chat-model",
      providerLLM: "openai-compatible"
    });
  });
});
