import { describe, expect, it } from "vitest";
import { ACTIVE_CHAT_TEST_LLM_GUIDANCE, describeTestLlmAction } from "../settings-test-llm";

describe("describeTestLlmAction", () => {
  it("disables Test LLM while a provider test is running", () => {
    expect(describeTestLlmAction("idle", "testing")).toEqual({
      disabled: true,
      disableReason: ""
    });
  });

  it("disables Test LLM during thinking or speaking with active-chat guidance", () => {
    expect(describeTestLlmAction("thinking", "idle")).toEqual({
      disabled: true,
      disableReason: ACTIVE_CHAT_TEST_LLM_GUIDANCE
    });
    expect(describeTestLlmAction("speaking", "success")).toEqual({
      disabled: true,
      disableReason: ACTIVE_CHAT_TEST_LLM_GUIDANCE
    });
  });

  it("keeps Test LLM available when the runtime is not busy", () => {
    expect(describeTestLlmAction("idle", "idle")).toEqual({
      disabled: false,
      disableReason: ""
    });
    expect(describeTestLlmAction("listening", "error")).toEqual({
      disabled: false,
      disableReason: ""
    });
  });
});
