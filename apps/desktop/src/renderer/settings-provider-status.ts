import type { DesktopRendererState } from "./desktop-runtime-bridge";

export interface ProviderStatusView {
  tone: "ready" | "blocked" | "preview";
  label: string;
  detail: string;
}

export function describeProviderStatus(state: DesktopRendererState): ProviderStatusView {
  const llm = state.settings.providerLLM.trim();
  if (llm !== "openai-compatible") {
    return {
      tone: "preview",
      label: "Preview",
      detail: "Fake provider is active. Use OpenAI-compatible for a real LLM chat."
    };
  }

  if (state.settings.providerBaseUrl.trim().length === 0) {
    return {
      tone: "blocked",
      label: "Needs Base URL",
      detail: "OpenAI-compatible chat needs a Base URL such as https://host/v1."
    };
  }

  if (!state.settings.providerHasApiKey && state.settings.providerApiKey.trim().length === 0) {
    return {
      tone: "blocked",
      label: "Needs API key",
      detail: "Add an API key before testing or chatting with the real provider."
    };
  }

  if (state.settings.providerModel.trim().length === 0) {
    return {
      tone: "blocked",
      label: "Needs model",
      detail: "Choose the provider model name before testing the LLM."
    };
  }

  return {
    tone: "ready",
    label: "Ready to test",
    detail: "Provider settings are complete. Run Test LLM before a real chat."
  };
}
