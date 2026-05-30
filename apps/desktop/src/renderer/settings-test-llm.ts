export type SettingsStageStatus = "idle" | "listening" | "thinking" | "speaking" | "interrupted" | "error";

export const ACTIVE_CHAT_TEST_LLM_GUIDANCE =
  "LLM test is unavailable while a chat response is running. Stop the current reply or wait for it to finish, then retry.";

export interface TestLlmActionView {
  disabled: boolean;
  disableReason: string;
}

export function describeTestLlmAction(
  stageStatus: SettingsStageStatus,
  providerTestStatus: "idle" | "testing" | "success" | "error"
): TestLlmActionView {
  if (providerTestStatus === "testing") {
    return { disabled: true, disableReason: "" };
  }

  if (stageStatus === "thinking" || stageStatus === "speaking") {
    return { disabled: true, disableReason: ACTIVE_CHAT_TEST_LLM_GUIDANCE };
  }

  return { disabled: false, disableReason: "" };
}
