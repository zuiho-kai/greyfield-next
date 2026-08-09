import type { DesktopRendererState } from "./desktop-runtime-bridge";
import { settingsT, type SettingsLocale } from "./settings-i18n";

export interface MemoryExtractionStatusView {
  tone: "standard" | "ready" | "fallback" | "success" | "disabled";
  label: string;
  detail: string;
}

export function describeMemoryExtractionStatus(state: DesktopRendererState, locale?: SettingsLocale): MemoryExtractionStatusView {
  if (!state.sessionContinuity.longTermMemoryEnabled) {
    return {
      tone: "disabled",
      label: settingsT(locale, "memory.paused.label"),
      detail: settingsT(locale, "memory.paused.detail")
    };
  }

  if (!state.settings.llmAtomExtractionEnabled) {
    return {
      tone: "standard",
      label: settingsT(locale, "memory.standard.label"),
      detail: settingsT(locale, "memory.standard.detail")
    };
  }

  if (state.memoryExtraction?.status === "better") {
    return {
      tone: state.memoryExtraction.savedAtomCount > 0 ? "success" : "ready",
      label:
        state.memoryExtraction.savedAtomCount > 0
          ? settingsT(locale, "memory.betterUsed.label")
          : settingsT(locale, "memory.noSaved.label"),
      detail:
        state.memoryExtraction.savedAtomCount > 0
          ? settingsT(locale, "memory.betterUsed.detail")
          : state.memoryExtraction.message
    };
  }

  if (state.memoryExtraction?.status === "fallback") {
    return {
      tone: "fallback",
      label: settingsT(locale, "memory.fallback.label"),
      detail: state.memoryExtraction.message
    };
  }

  return {
    tone: "ready",
    label: settingsT(locale, "memory.ready.label"),
    detail: settingsT(locale, "memory.ready.detail")
  };
}
