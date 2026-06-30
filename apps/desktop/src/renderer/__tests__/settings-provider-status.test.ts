import { describe, expect, it } from "vitest";
import { createInitialDesktopRendererState } from "../desktop-runtime-bridge";
import { describeProviderStatus } from "../settings-provider-status";

describe("describeProviderStatus", () => {
  it("marks fake providers as preview mode", () => {
    const state = createInitialDesktopRendererState();

    expect(describeProviderStatus(state, "en-US")).toEqual({
      tone: "preview",
      label: "Preview",
      detail: "Fake provider is active. Use OpenAI-compatible for a real LLM chat."
    });
  });

  it("uses Chinese for the default locale", () => {
    const state = createInitialDesktopRendererState();

    expect(describeProviderStatus(state)).toMatchObject({
      tone: "preview",
      label: "预览模式"
    });
  });

  it("shows missing OpenAI-compatible fields in the order users should fix them", () => {
    const state = createInitialDesktopRendererState();
    state.settings.providerLLM = "openai-compatible";
    state.settings.providerBaseUrl = "";
    state.settings.providerApiKey = "";
    state.settings.providerHasApiKey = false;
    state.settings.providerModel = "";

    expect(describeProviderStatus(state, "en-US")).toMatchObject({ tone: "blocked", label: "Needs Base URL" });

    state.settings.providerBaseUrl = "https://llm.example/v1";
    expect(describeProviderStatus(state, "en-US")).toMatchObject({ tone: "blocked", label: "Needs API key" });

    state.settings.providerHasApiKey = true;
    expect(describeProviderStatus(state, "en-US")).toMatchObject({ tone: "blocked", label: "Needs model" });
  });

  it("marks complete OpenAI-compatible settings as ready", () => {
    const state = createInitialDesktopRendererState();
    state.settings.providerLLM = "openai-compatible";
    state.settings.providerBaseUrl = "https://llm.example/v1";
    state.settings.providerHasApiKey = true;
    state.settings.providerModel = "mimo-v2.5";

    expect(describeProviderStatus(state, "en-US")).toEqual({
      tone: "ready",
      label: "Ready to test",
      detail: "Provider settings are complete. Run Test LLM before a real chat."
    });
  });
});
