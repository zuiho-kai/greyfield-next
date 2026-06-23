import { describe, expect, it } from "vitest";
import { describeChatStatus } from "../chat-status";
import { createInitialDesktopRendererState } from "../desktop-runtime-bridge";

describe("describeChatStatus", () => {
  it("renders idle as a waiting state", () => {
    expect(describeChatStatus({ ...createInitialDesktopRendererState(), status: "idle" })).toMatchObject({
      label: "Waiting",
      tone: "waiting",
      canStop: false,
      sendLabel: "Send"
    });
  });

  it("renders thinking and speaking as stoppable generation", () => {
    expect(describeChatStatus({ ...createInitialDesktopRendererState(), status: "thinking" })).toMatchObject({
      label: "Generating",
      tone: "generating",
      canStop: true,
      stopLabel: "Stop"
    });
    expect(describeChatStatus({ ...createInitialDesktopRendererState(), status: "speaking" })).toMatchObject({
      label: "Generating",
      tone: "generating",
      canStop: true,
      stopLabel: "Stop"
    });
  });

  it("keeps Stop available while enabled voice output is still queued", () => {
    expect(
      describeChatStatus({
        ...createInitialDesktopRendererState(),
        status: "idle",
        audioQueue: ["Still speaking."],
        settings: {
          ...createInitialDesktopRendererState().settings,
          voiceSpeechEnabled: true
        }
      })
    ).toMatchObject({
      label: "Generating",
      tone: "generating",
      canStop: true,
      stopLabel: "Stop"
    });
  });

  it("renders interrupted as a stable stopped state", () => {
    expect(describeChatStatus({ ...createInitialDesktopRendererState(), status: "interrupted" })).toMatchObject({
      label: "Stopped",
      tone: "stopped",
      canStop: false,
      stopLabel: "Stopped"
    });
  });

  it("renders failed state as retry-ready when the failed input is restored", () => {
    expect(
      describeChatStatus({
        ...createInitialDesktopRendererState(),
        status: "error",
        errorMessage: "provider timed out",
        inputDraft: "try again"
      })
    ).toMatchObject({
      label: "Retry ready",
      tone: "retry",
      canStop: false,
      sendLabel: "Retry"
    });
  });

  it("renders failed state without a draft as failed", () => {
    expect(
      describeChatStatus({
        ...createInitialDesktopRendererState(),
        status: "error",
        errorMessage: "provider timed out",
        inputDraft: ""
      })
    ).toMatchObject({
      label: "Failed",
      tone: "failed",
      canStop: false,
      sendLabel: "Send"
    });
  });

  it("uses the current input draft for retry-ready status", () => {
    const state = {
      ...createInitialDesktopRendererState(),
      status: "error",
      errorMessage: "provider timed out",
      inputDraft: "original failed message"
    };

    expect(describeChatStatus(state, "")).toMatchObject({
      label: "Failed",
      tone: "failed",
      sendLabel: "Send"
    });
    expect(describeChatStatus(state, "edited retry")).toMatchObject({
      label: "Retry ready",
      tone: "retry",
      sendLabel: "Retry"
    });
  });
});
