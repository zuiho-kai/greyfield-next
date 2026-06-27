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
  providerBlockedReason = ""
): TestLlmActionView {
  if (providerTestStatus === "testing") {
    return { disabled: true, disableReason: "", label: "Testing...", tone: "testing" };
  }

  if (stageStatus === "thinking" || stageStatus === "speaking") {
    return {
      disabled: true,
      disableReason: ACTIVE_CHAT_TEST_LLM_GUIDANCE,
      label: "Test LLM",
      tone: "active-chat"
    };
  }

  if (providerBlockedReason.length > 0) {
    return {
      disabled: true,
      disableReason: providerBlockedReason,
      label: "Test LLM",
      tone: "blocked"
    };
  }

  return { disabled: false, disableReason: "", label: "Test LLM", tone: "idle" };
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
  voiceBlockedReason = ""
): TestVoiceActionView {
  if (voiceTestStatus === "testing") {
    return { disabled: true, disableReason: "", label: "Testing voice...", tone: "testing" };
  }

  if (stageStatus === "thinking" || stageStatus === "speaking") {
    return {
      disabled: true,
      disableReason: ACTIVE_CHAT_TEST_VOICE_GUIDANCE,
      label: "Test Voice",
      tone: "active-chat"
    };
  }

  if (voiceBlockedReason.length > 0) {
    return { disabled: true, disableReason: voiceBlockedReason, label: "Test Voice", tone: "blocked" };
  }

  return { disabled: false, disableReason: "", label: "Test Voice", tone: "idle" };
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
}): ProviderTestStatusView | null {
  if (providerTest.status === "idle" || providerTest.message.trim().length === 0) {
    return null;
  }

  if (providerTest.status === "testing") {
    return {
      tone: "testing",
      label: "Testing LLM",
      detail: "Sending a small prompt. This should finish in a moment."
    };
  }

  if (providerTest.status === "success") {
    return {
      tone: "success",
      label: "Test succeeded",
      detail: providerTest.firstToken
        ? `Received first token: ${providerTest.firstToken}. Real chat can use this provider.`
        : "The provider replied. Real chat can use this provider."
    };
  }

  return {
    tone: "error",
    label: "Test failed",
    detail: providerTest.message
  };
}
