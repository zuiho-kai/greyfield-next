import type { DesktopSettingsPatch, DesktopSettingsState } from "./desktop-runtime-bridge";
import { normalizeSettingsLocale } from "./settings-i18n";

export function createTextSettingPatch(
  settings: DesktopSettingsState,
  key: keyof DesktopSettingsState,
  value: string
): DesktopSettingsPatch {
  const patch: DesktopSettingsPatch = {
    [key]: key === "settingsLocale" ? normalizeSettingsLocale(value) : value
  };
  if (
    settings.providerLLM !== "openai-compatible" &&
    value.trim().length > 0 &&
    (key === "providerBaseUrl" || key === "providerApiKey" || key === "providerModel")
  ) {
    patch.providerLLM = "openai-compatible";
  }
  if (settings.providerASR !== "openai-compatible" && value.trim().length > 0 && key === "providerASRModel") {
    patch.providerASR = "openai-compatible";
  }
  if (settings.providerTTS !== "openai-compatible" && value.trim().length > 0 && key === "providerTTSModel") {
    patch.providerTTS = "openai-compatible";
  }
  return patch;
}
