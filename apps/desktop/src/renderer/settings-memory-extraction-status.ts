import type { DesktopRendererState } from "./desktop-runtime-bridge";
import { settingsT, type SettingsLocale } from "./settings-i18n";

export interface MemoryExtractionStatusView {
  tone: "standard" | "ready" | "fallback" | "success" | "disabled";
  label: string;
  detail: string;
}

export function describeMemoryExtractionStatus(state: DesktopRendererState, locale?: SettingsLocale): MemoryExtractionStatusView {
  void state;
  return {
    tone: "disabled",
    label: settingsT(locale, "memory.development.label"),
    detail: settingsT(locale, "memory.development.detail")
  };
}
