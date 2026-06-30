import type { DesktopRendererState } from "./desktop-runtime-bridge";
import { settingsT, type SettingsLocale } from "./settings-i18n";

export interface ProviderStatusView {
  tone: "ready" | "blocked" | "preview";
  label: string;
  detail: string;
}

export function describeProviderStatus(state: DesktopRendererState, locale?: SettingsLocale): ProviderStatusView {
  const llm = state.settings.providerLLM.trim();
  if (llm !== "openai-compatible") {
    return {
      tone: "preview",
      label: settingsT(locale, "provider.preview.label"),
      detail: settingsT(locale, "provider.preview.detail")
    };
  }

  if (state.settings.providerBaseUrl.trim().length === 0) {
    return {
      tone: "blocked",
      label: settingsT(locale, "provider.baseUrl.label"),
      detail: settingsT(locale, "provider.baseUrl.detail")
    };
  }

  if (!state.settings.providerHasApiKey && state.settings.providerApiKey.trim().length === 0) {
    return {
      tone: "blocked",
      label: settingsT(locale, "provider.apiKey.label"),
      detail: settingsT(locale, "provider.apiKey.detail")
    };
  }

  if (state.settings.providerModel.trim().length === 0) {
    return {
      tone: "blocked",
      label: settingsT(locale, "provider.model.label"),
      detail: settingsT(locale, "provider.model.detail")
    };
  }

  return {
    tone: "ready",
    label: settingsT(locale, "provider.ready.label"),
    detail: settingsT(locale, "provider.ready.detail")
  };
}
