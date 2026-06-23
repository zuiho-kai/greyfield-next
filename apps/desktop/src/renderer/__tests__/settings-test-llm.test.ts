import { describe, expect, it } from "vitest";
import { ACTIVE_CHAT_TEST_LLM_GUIDANCE, describeProviderTestStatus, describeTestLlmAction } from "../settings-test-llm";

describe("describeTestLlmAction", () => {
  it("disables Test LLM while a provider test is running", () => {
    expect(describeTestLlmAction("idle", "testing")).toEqual({
      disabled: true,
      disableReason: "",
      label: "Testing...",
      tone: "testing"
    });
  });

  it("disables Test LLM during thinking or speaking with active-chat guidance", () => {
    expect(describeTestLlmAction("thinking", "idle")).toEqual({
      disabled: true,
      disableReason: ACTIVE_CHAT_TEST_LLM_GUIDANCE,
      label: "Test LLM",
      tone: "active-chat"
    });
    expect(describeTestLlmAction("speaking", "success")).toEqual({
      disabled: true,
      disableReason: ACTIVE_CHAT_TEST_LLM_GUIDANCE,
      label: "Test LLM",
      tone: "active-chat"
    });
  });

  it("disables Test LLM when required provider settings are missing", () => {
    expect(describeTestLlmAction("idle", "idle", "Add an API key before testing.")).toEqual({
      disabled: true,
      disableReason: "Add an API key before testing.",
      label: "Test LLM",
      tone: "blocked"
    });
  });

  it("keeps Test LLM available when the runtime is not busy", () => {
    expect(describeTestLlmAction("idle", "idle")).toEqual({
      disabled: false,
      disableReason: "",
      label: "Test LLM",
      tone: "idle"
    });
    expect(describeTestLlmAction("listening", "error")).toEqual({
      disabled: false,
      disableReason: "",
      label: "Test LLM",
      tone: "idle"
    });
  });

  it("renders testing, success, and failure as product status text", () => {
    expect(describeProviderTestStatus({ status: "testing", message: "Testing LLM provider..." })).toEqual({
      tone: "testing",
      label: "Testing LLM",
      detail: "Sending a small prompt. This should finish in a moment."
    });
    expect(describeProviderTestStatus({ status: "success", message: "LLM test succeeded: pong", firstToken: "pong" })).toEqual({
      tone: "success",
      label: "Test succeeded",
      detail: "Received first token: pong. Real chat can use this provider."
    });
    expect(describeProviderTestStatus({ status: "error", message: "bad key" })).toEqual({
      tone: "error",
      label: "Test failed",
      detail: "bad key"
    });
    expect(describeProviderTestStatus({ status: "idle", message: "" })).toBeNull();
  });
});
