import type { DesktopRendererState } from "./desktop-runtime-bridge";
import { settingsT, type SettingsLocale } from "./settings-i18n";

export interface MemoryExtractionStatusView {
  tone: "standard" | "ready" | "fallback" | "success";
  label: string;
  detail: string;
}

export function describeMemoryExtractionStatus(state: DesktopRendererState, locale?: SettingsLocale): MemoryExtractionStatusView {
  if (!state.settings.llmAtomExtractionEnabled) {
    return {
      tone: "standard",
      label: settingsT(locale, "memory.standard.label"),
      detail: settingsT(locale, "memory.standard.detail")
    };
  }

  const providerRequirement = describeMemoryExtractionProviderRequirement(state, locale);
  if (providerRequirement) {
    return {
      tone: "fallback",
      label: settingsT(locale, "memory.fallback.label"),
      detail: providerRequirement
    };
  }

  if (state.memoryExtraction?.status === "fallback") {
    return {
      tone: "fallback",
      label: settingsT(locale, "memory.fallback.label"),
      detail: state.memoryExtraction.message
    };
  }

  if (state.memoryExtraction?.status === "better") {
    return {
      tone: "success",
      label: settingsT(locale, "memory.betterUsed.label"),
      detail: settingsT(locale, "memory.betterUsed.detail")
    };
  }

  if (state.memoryExtraction?.reason === "skipped-noise") {
    return {
      tone: "standard",
      label: settingsT(locale, "memory.noSaved.label"),
      detail: state.memoryExtraction.message
    };
  }

  return {
    tone: "ready",
    label: settingsT(locale, "memory.ready.label"),
    detail: settingsT(locale, "memory.ready.detail")
  };
}

function describeMemoryExtractionProviderRequirement(state: DesktopRendererState, locale?: SettingsLocale): string {
  if (state.settings.providerLLM !== "openai-compatible") {
    return settingsT(locale, "memory.needsProvider");
  }
  if (state.settings.providerBaseUrl.trim().length === 0) {
    return settingsT(locale, "memory.needsBaseUrl");
  }
  if (!state.settings.providerHasApiKey && state.settings.providerApiKey.trim().length === 0) {
    return settingsT(locale, "memory.needsApiKey");
  }
  if (state.settings.providerMemoryModel.trim().length === 0) {
    return settingsT(locale, "memory.needsModel");
  }
  return "";
}
