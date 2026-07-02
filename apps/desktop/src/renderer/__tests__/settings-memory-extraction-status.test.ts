import { describe, expect, it } from "vitest";
import type { MemoryAtomExtractionStatus } from "@greyfield/core-runtime";
import { createInitialDesktopRendererState, type DesktopRendererState } from "../desktop-runtime-bridge";
import { describeMemoryExtractionStatus } from "../settings-memory-extraction-status";

describe("describeMemoryExtractionStatus", () => {
  it("explains that better memory off keeps basic local memory on", () => {
    const status = describeMemoryExtractionStatus(createInitialDesktopRendererState(), "en-US");

    expect(status).toEqual({
      tone: "standard",
      label: "Basic memory on",
      detail: "Greyfield still saves simple local memories such as names, dates, and preferences."
    });
  });

  it("uses Chinese for the default locale", () => {
    const status = describeMemoryExtractionStatus(createInitialDesktopRendererState());

    expect(status).toMatchObject({
      tone: "standard",
      label: "基础记忆开启"
    });
  });

  it("shows standard fallback wording when the chat provider is not OpenAI-compatible", () => {
    const status = describeMemoryExtractionStatus(enabledState(), "en-US");

    expect(status).toMatchObject({
      tone: "fallback",
      label: "Using basic memory"
    });
    expect(status.detail).toContain("OpenAI-compatible chat provider");
    expect(status.detail).toContain("Basic local memory stays on");
  });

  it("shows provider requirement wording for missing Base URL, API key, and model", () => {
    const baseState = enabledState({
      providerLLM: "openai-compatible",
      providerBaseUrl: "",
      providerApiKey: "",
      providerHasApiKey: false,
      providerMemoryModel: ""
    });

    expect(describeMemoryExtractionStatus(baseState, "en-US").detail).toContain("Base URL");
    expect(describeMemoryExtractionStatus(providerReadyState({ providerApiKey: "", providerHasApiKey: false }), "en-US").detail).toContain(
      "saved API key"
    );
    expect(describeMemoryExtractionStatus(providerReadyState({ providerMemoryModel: "" }), "en-US").detail).toContain("memory model name");
  });

  it("shows ready wording when better memory is enabled and the provider is complete", () => {
    const status = describeMemoryExtractionStatus(providerReadyState(), "en-US");

    expect(status).toEqual({
      tone: "ready",
      label: "Ready to remember more detail",
      detail: "Greyfield can use the chat provider to notice richer details when helpful. If it fails, basic local memory keeps running."
    });
  });

  it("shows standard fallback wording for provider failure", () => {
    const status = describeMemoryExtractionStatus(
      providerReadyState({
        memoryExtraction: extractionStatus({
          reason: "provider-failure",
          message: "Better memory could not use the chat provider for this message, so Greyfield used standard local memory instead."
        })
      }),
      "en-US"
    );

    expect(status).toEqual({
      tone: "fallback",
      label: "Using basic memory",
      detail: "Better memory could not use the chat provider for this message, so Greyfield used standard local memory instead."
    });
  });

  it("shows standard fallback wording for invalid provider output", () => {
    const status = describeMemoryExtractionStatus(
      providerReadyState({
        memoryExtraction: extractionStatus({
          reason: "invalid-output",
          message: "The chat provider did not return usable memory for this message, so Greyfield used standard local memory instead."
        })
      }),
      "en-US"
    );

    expect(status).toEqual({
      tone: "fallback",
      label: "Using basic memory",
      detail: "The chat provider did not return usable memory for this message, so Greyfield used standard local memory instead."
    });
  });

  it("shows better memory wording only after the provider was used", () => {
    const status = describeMemoryExtractionStatus(
      providerReadyState({
        memoryExtraction: {
          status: "better",
          reason: "provider-used",
          message: "Better memory checked this message.",
          savedAtomCount: 1,
          llmAttempted: true,
          fallbackUsed: true
        }
      }),
      "en-US"
    );

    expect(status).toEqual({
      tone: "success",
      label: "Remembered more detail",
      detail: "The last message also used the chat provider to notice richer details. Basic local memory stayed available."
    });
  });

  it("does not describe skipped noise as provider usage", () => {
    const status = describeMemoryExtractionStatus(
      providerReadyState({
        memoryExtraction: {
          status: "standard",
          reason: "skipped-noise",
          message: "Greyfield did not find durable memory in this message, so nothing new was saved.",
          savedAtomCount: 0,
          llmAttempted: false,
          fallbackUsed: false
        }
      }),
      "en-US"
    );

    expect(status).toEqual({
      tone: "standard",
      label: "Nothing new to remember",
      detail: "Greyfield did not find durable memory in this message, so nothing new was saved."
    });
  });
});

function enabledState(settings: Partial<DesktopRendererState["settings"]> = {}): DesktopRendererState {
  const state = createInitialDesktopRendererState();
  state.settings = {
    ...state.settings,
    llmAtomExtractionEnabled: true,
    ...settings
  };
  return state;
}

function providerReadyState(
  overrides: Partial<DesktopRendererState["settings"]> & { memoryExtraction?: MemoryAtomExtractionStatus | null } = {}
): DesktopRendererState {
  const { memoryExtraction, ...settings } = overrides;
  const state = enabledState({
    providerLLM: "openai-compatible",
    providerBaseUrl: "https://llm.example/v1",
    providerApiKey: "",
    providerHasApiKey: true,
    providerModel: "remote-model",
    providerMemoryModel: "memory-model",
    ...settings
  });
  state.memoryExtraction = memoryExtraction ?? null;
  return state;
}

function extractionStatus(overrides: Partial<MemoryAtomExtractionStatus>): MemoryAtomExtractionStatus {
  return {
    status: "fallback",
    reason: "provider-failure",
    message: "Better memory could not use the chat provider for this message, so Greyfield used standard local memory instead.",
    savedAtomCount: 1,
    llmAttempted: true,
    fallbackUsed: true,
    ...overrides
  };
}
