import { settingsT, type SettingsLocale } from "./settings-i18n";

export type SettingsStageStatus = "idle" | "listening" | "thinking" | "speaking" | "interrupted" | "error";

export const ACTIVE_CHAT_TEST_LLM_GUIDANCE =
  "LLM test is unavailable while a chat response is running. Stop the current reply or wait for it to finish, then retry.";
export const ACTIVE_CHAT_TEST_VOICE_GUIDANCE =
  "Voice test is unavailable while a chat response is running. Stop the current reply or wait for it to finish, then retry.";

export interface TestLlmActionView {
  disabled: boolean;
  disableReason: string;
  label: string;
  tone: "idle" | "testing" | "blocked" | "active-chat";
}

export function describeTestLlmAction(
  stageStatus: SettingsStageStatus,
  providerTestStatus: "idle" | "testing" | "success" | "error",
  providerBlockedReason = "",
  locale?: SettingsLocale
): TestLlmActionView {
  if (providerTestStatus === "testing") {
    return { disabled: true, disableReason: "", label: settingsT(locale, "test.llm.testing"), tone: "testing" };
  }

  if (stageStatus === "thinking" || stageStatus === "speaking") {
    return {
      disabled: true,
      disableReason: ACTIVE_CHAT_TEST_LLM_GUIDANCE,
      label: settingsT(locale, "test.llm"),
      tone: "active-chat"
    };
  }

  if (providerBlockedReason.length > 0) {
    return {
      disabled: true,
      disableReason: providerBlockedReason,
      label: settingsT(locale, "test.llm"),
      tone: "blocked"
    };
  }

  return { disabled: false, disableReason: "", label: settingsT(locale, "test.llm"), tone: "idle" };
}

export interface TestVoiceActionView {
  disabled: boolean;
  disableReason: string;
  label: string;
  tone: "idle" | "testing" | "blocked" | "active-chat";
}

export function describeTestVoiceAction(
  stageStatus: SettingsStageStatus,
  voiceTestStatus: "idle" | "testing" | "success" | "error",
  voiceBlockedReason = "",
  locale?: SettingsLocale
): TestVoiceActionView {
  if (voiceTestStatus === "testing") {
    return { disabled: true, disableReason: "", label: settingsT(locale, "test.voice.testing"), tone: "testing" };
  }

  if (stageStatus === "thinking" || stageStatus === "speaking") {
    return {
      disabled: true,
      disableReason: ACTIVE_CHAT_TEST_VOICE_GUIDANCE,
      label: settingsT(locale, "test.voice"),
      tone: "active-chat"
    };
  }

  if (voiceBlockedReason.length > 0) {
    return { disabled: true, disableReason: voiceBlockedReason, label: settingsT(locale, "test.voice"), tone: "blocked" };
  }

  return { disabled: false, disableReason: "", label: settingsT(locale, "test.voice"), tone: "idle" };
}

export interface ProviderTestStatusView {
  tone: "testing" | "success" | "error";
  label: string;
  detail: string;
}

export function describeProviderTestStatus(providerTest: {
  status: "idle" | "testing" | "success" | "error";
  message: string;
  firstToken?: string;
}, locale?: SettingsLocale): ProviderTestStatusView | null {
  if (providerTest.status === "idle" || providerTest.message.trim().length === 0) {
    return null;
  }

  if (providerTest.status === "testing") {
    return {
      tone: "testing",
      label: settingsT(locale, "test.llm.status"),
      detail: settingsT(locale, "test.llm.detail")
    };
  }

  if (providerTest.status === "success") {
    return {
      tone: "success",
      label: settingsT(locale, "test.succeeded"),
      detail: providerTest.firstToken
        ? settingsT(locale, "test.provider.firstToken", { token: providerTest.firstToken })
        : settingsT(locale, "test.provider.replied")
    };
  }

  return {
    tone: "error",
    label: settingsT(locale, "test.failed"),
    detail: providerTest.message
  };
}
