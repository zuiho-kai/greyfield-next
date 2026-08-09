import type { DesktopRendererState } from "./desktop-runtime-bridge";
import { settingsT, type SettingsLocale } from "./settings-i18n";
import { describeProviderStatus } from "./settings-provider-status";

export interface ProviderExperienceView {
  tone: "preview" | "blocked" | "configured";
  label: string;
  detail: string;
  actionLabel: string;
}

export interface VoiceInputExperienceView {
  isPreview: boolean;
  label: string;
}

export function describeProviderExperience(
  state: DesktopRendererState,
  locale?: SettingsLocale
): ProviderExperienceView {
  const provider = describeProviderStatus(state, locale);
  if (provider.tone === "preview") {
    return {
      tone: "preview",
      label: settingsT(locale, "experience.preview"),
      detail: provider.detail,
      actionLabel: settingsT(locale, "experience.configure")
    };
  }
  if (provider.tone === "blocked") {
    return {
      tone: "blocked",
      label: settingsT(locale, "experience.incomplete"),
      detail: provider.detail,
      actionLabel: settingsT(locale, "experience.finishSetup")
    };
  }
  if (state.providerTest.status === "error") {
    return {
      tone: "blocked",
      label: settingsT(locale, "experience.testFailed"),
      detail: state.providerTest.message || settingsT(locale, "experience.testRequired"),
      actionLabel: settingsT(locale, "experience.retest")
    };
  }
  if (state.providerTest.status !== "success") {
    return {
      tone: "blocked",
      label: settingsT(locale, state.providerTest.status === "testing" ? "experience.testing" : "experience.untested"),
      detail: state.providerTest.message || settingsT(locale, "experience.testRequired"),
      actionLabel: state.providerTest.status === "testing" ? "" : settingsT(locale, "experience.test")
    };
  }
  return {
    tone: "configured",
    label: settingsT(locale, "experience.configured"),
    detail: provider.detail,
    actionLabel: ""
  };
}

export function describeVoiceInputExperience(
  state: DesktopRendererState,
  locale?: SettingsLocale
): VoiceInputExperienceView {
  const isPreview = state.settings.providerASR.trim() === "fake";
  return {
    isPreview,
    label: settingsT(locale, isPreview ? "voice.preview.fixedTranscript" : "voice.realInput")
  };
}
