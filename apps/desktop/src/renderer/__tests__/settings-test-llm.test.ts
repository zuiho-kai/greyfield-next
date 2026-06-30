import { describe, expect, it } from "vitest";
import {
  ACTIVE_CHAT_TEST_LLM_GUIDANCE,
  ACTIVE_CHAT_TEST_VOICE_GUIDANCE,
  describeProviderTestStatus,
  describeTestLlmAction,
  describeTestVoiceAction
} from "../settings-test-llm";

describe("describeTestLlmAction", () => {
  it("disables Test LLM while a provider test is running", () => {
    expect(describeTestLlmAction("idle", "testing", "", "en-US")).toEqual({
      disabled: true,
      disableReason: "",
      label: "Testing...",
      tone: "testing"
    });
  });

  it("uses Chinese for the default locale", () => {
    expect(describeTestLlmAction("idle", "idle")).toMatchObject({
      disabled: false,
      label: "测试 LLM"
    });
  });

  it("disables Test LLM during thinking or speaking with active-chat guidance", () => {
    expect(describeTestLlmAction("thinking", "idle", "", "en-US")).toEqual({
      disabled: true,
      disableReason: ACTIVE_CHAT_TEST_LLM_GUIDANCE,
      label: "Test LLM",
      tone: "active-chat"
    });
    expect(describeTestLlmAction("speaking", "success", "", "en-US")).toEqual({
      disabled: true,
      disableReason: ACTIVE_CHAT_TEST_LLM_GUIDANCE,
      label: "Test LLM",
      tone: "active-chat"
    });
  });

  it("disables Test LLM when required provider settings are missing", () => {
    expect(describeTestLlmAction("idle", "idle", "Add an API key before testing.", "en-US")).toEqual({
      disabled: true,
      disableReason: "Add an API key before testing.",
      label: "Test LLM",
      tone: "blocked"
    });
  });

  it("keeps Test LLM available when the runtime is not busy", () => {
    expect(describeTestLlmAction("idle", "idle", "", "en-US")).toEqual({
      disabled: false,
      disableReason: "",
      label: "Test LLM",
      tone: "idle"
    });
    expect(describeTestLlmAction("listening", "error", "", "en-US")).toEqual({
      disabled: false,
      disableReason: "",
      label: "Test LLM",
      tone: "idle"
    });
  });

  it("renders testing, success, and failure as product status text", () => {
    expect(describeProviderTestStatus({ status: "testing", message: "Testing LLM provider..." }, "en-US")).toEqual({
      tone: "testing",
      label: "Testing LLM",
      detail: "Sending a small prompt. This should finish in a moment."
    });
    expect(describeProviderTestStatus({ status: "success", message: "LLM test succeeded: pong", firstToken: "pong" }, "en-US")).toEqual({
      tone: "success",
      label: "Test succeeded",
      detail: "Received first token: pong. Real chat can use this provider."
    });
    expect(describeProviderTestStatus({ status: "error", message: "bad key" }, "en-US")).toEqual({
      tone: "error",
      label: "Test failed",
      detail: "bad key"
    });
    expect(describeProviderTestStatus({ status: "idle", message: "" }, "en-US")).toBeNull();
  });
});

describe("describeTestVoiceAction", () => {
  it("disables Test Voice while a voice test is running", () => {
    expect(describeTestVoiceAction("idle", "testing", "", "en-US")).toEqual({
      disabled: true,
      disableReason: "",
      label: "Testing voice...",
      tone: "testing"
    });
  });

  it("disables Test Voice during thinking or speaking with active-chat guidance", () => {
    expect(describeTestVoiceAction("thinking", "idle", "", "en-US")).toEqual({
      disabled: true,
      disableReason: ACTIVE_CHAT_TEST_VOICE_GUIDANCE,
      label: "Test Voice",
      tone: "active-chat"
    });
    expect(describeTestVoiceAction("speaking", "success", "", "en-US")).toEqual({
      disabled: true,
      disableReason: ACTIVE_CHAT_TEST_VOICE_GUIDANCE,
      label: "Test Voice",
      tone: "active-chat"
    });
  });

  it("keeps existing voice blocked reasons and idle state", () => {
    expect(describeTestVoiceAction("idle", "idle", "Choose the voice before testing.", "en-US")).toEqual({
      disabled: true,
      disableReason: "Choose the voice before testing.",
      label: "Test Voice",
      tone: "blocked"
    });
    expect(describeTestVoiceAction("listening", "error", "", "en-US")).toEqual({
      disabled: false,
      disableReason: "",
      label: "Test Voice",
      tone: "idle"
    });
  });
});
