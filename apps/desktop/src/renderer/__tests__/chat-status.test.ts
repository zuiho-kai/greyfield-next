import { describe, expect, it } from "vitest";
import { describeChatStatus } from "../chat-status";

describe("describeChatStatus", () => {
  it("renders idle as a waiting state", () => {
    expect(describeChatStatus({ status: "idle", errorMessage: "", inputDraft: "" })).toMatchObject({
      label: "Waiting",
      tone: "waiting",
      canStop: false,
      sendLabel: "Send"
    });
  });

  it("renders thinking and speaking as stoppable generation", () => {
    expect(describeChatStatus({ status: "thinking", errorMessage: "", inputDraft: "" })).toMatchObject({
      label: "Generating",
      tone: "generating",
      canStop: true,
      stopLabel: "Stop"
    });
    expect(describeChatStatus({ status: "speaking", errorMessage: "", inputDraft: "" })).toMatchObject({
      label: "Generating",
      tone: "generating",
      canStop: true,
      stopLabel: "Stop"
    });
  });

  it("renders interrupted as a stable stopped state", () => {
    expect(describeChatStatus({ status: "interrupted", errorMessage: "", inputDraft: "" })).toMatchObject({
      label: "Stopped",
      tone: "stopped",
      canStop: false,
      stopLabel: "Stopped"
    });
  });

  it("renders failed state as retry-ready when the failed input is restored", () => {
    expect(describeChatStatus({ status: "error", errorMessage: "provider timed out", inputDraft: "try again" })).toMatchObject({
      label: "Retry ready",
      tone: "retry",
      canStop: false,
      sendLabel: "Retry"
    });
  });

  it("renders failed state without a draft as failed", () => {
    expect(describeChatStatus({ status: "error", errorMessage: "provider timed out", inputDraft: "" })).toMatchObject({
      label: "Failed",
      tone: "failed",
      canStop: false,
      sendLabel: "Send"
    });
  });
});
