import type { DesktopRendererState } from "./desktop-runtime-bridge";

export interface MemoryExtractionStatusView {
  tone: "standard" | "ready" | "fallback" | "success";
  label: string;
  detail: string;
}

export function describeMemoryExtractionStatus(state: DesktopRendererState): MemoryExtractionStatusView {
  if (!state.settings.llmAtomExtractionEnabled) {
    return {
      tone: "standard",
      label: "Standard memory",
      detail: "Better extraction is off. Greyfield still saves simple local memories such as names, dates, and preferences."
    };
  }

  const providerRequirement = describeMemoryExtractionProviderRequirement(state);
  if (providerRequirement) {
    return {
      tone: "fallback",
      label: "Standard fallback",
      detail: providerRequirement
    };
  }

  if (state.memoryExtraction?.status === "fallback") {
    return {
      tone: "fallback",
      label: "Standard fallback",
      detail: state.memoryExtraction.message
    };
  }

  if (state.memoryExtraction?.status === "better") {
    return {
      tone: "success",
      label: "Better memory used",
      detail: "The last message was checked with the chat provider. Standard local memory stayed available."
    };
  }

  if (state.memoryExtraction?.reason === "skipped-noise") {
    return {
      tone: "standard",
      label: "No memory saved",
      detail: state.memoryExtraction.message
    };
  }

  return {
    tone: "ready",
    label: "Ready for better memory",
    detail: "Greyfield can use the chat provider to notice richer memories. If it fails, standard local memory keeps running."
  };
}

function describeMemoryExtractionProviderRequirement(state: DesktopRendererState): string {
  if (state.settings.providerLLM !== "openai-compatible") {
    return "Better extraction needs the OpenAI-compatible chat provider. Standard local memory stays on until the provider is ready.";
  }
  if (state.settings.providerBaseUrl.trim().length === 0) {
    return "Better extraction needs a chat provider Base URL. Standard local memory stays on until the provider is ready.";
  }
  if (!state.settings.providerHasApiKey && state.settings.providerApiKey.trim().length === 0) {
    return "Better extraction needs a saved API key. Standard local memory stays on until the provider is ready.";
  }
  if (state.settings.providerModel.trim().length === 0) {
    return "Better extraction needs a chat model name. Standard local memory stays on until the provider is ready.";
  }
  return "";
}
