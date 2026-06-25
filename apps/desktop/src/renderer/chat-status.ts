import type { DesktopRendererState } from "./desktop-runtime-bridge";

export interface ChatStatusView {
  label: string;
  detail: string;
  tone: "waiting" | "generating" | "stopped" | "failed" | "retry";
  canStop: boolean;
  sendLabel: string;
  stopLabel: string;
}

export function describeChatStatus(
  state: Pick<DesktopRendererState, "status" | "errorMessage" | "inputDraft" | "audioQueue" | "settings" | "stage">,
  currentDraft = state.inputDraft
): ChatStatusView {
  if (state.status === "thinking") {
    return {
      label: "Generating",
      detail: "Waiting for the reply to start.",
      tone: "generating",
      canStop: true,
      sendLabel: "Send",
      stopLabel: "Stop"
    };
  }

  if (state.status === "speaking") {
    return {
      label: "Generating",
      detail: "Greyfield is replying. Stop stays available while this runs.",
      tone: "generating",
      canStop: true,
      sendLabel: "Send",
      stopLabel: "Stop"
    };
  }

  const hasActiveSpeech =
    state.settings.voiceSpeechEnabled && (state.audioQueue.length > 0 || state.stage.mouthOpen > 0);
  if (hasActiveSpeech) {
    return {
      label: "Generating",
      detail: "Greyfield is still speaking. Stop will interrupt the current voice playback.",
      tone: "generating",
      canStop: true,
      sendLabel: "Send",
      stopLabel: "Stop"
    };
  }

  if (state.status === "interrupted") {
    return {
      label: "Stopped",
      detail: "The last reply was stopped. Send again when ready.",
      tone: "stopped",
      canStop: false,
      sendLabel: "Send",
      stopLabel: "Stopped"
    };
  }

  if (state.status === "error") {
    const hasRetryDraft = currentDraft.trim().length > 0;
    return {
      label: hasRetryDraft ? "Retry ready" : "Failed",
      detail: hasRetryDraft
        ? "The failed message is back in the message box."
        : "Something went wrong. Check the message above, then try again.",
      tone: hasRetryDraft ? "retry" : "failed",
      canStop: false,
      sendLabel: hasRetryDraft ? "Retry" : "Send",
      stopLabel: "Stop"
    };
  }

  if (state.status === "listening") {
    return {
      label: "Waiting",
      detail: "Listening for input.",
      tone: "waiting",
      canStop: true,
      sendLabel: "Send",
      stopLabel: "Stop"
    };
  }

  return {
    label: "Waiting",
    detail: "Ready for your next message.",
    tone: "waiting",
    canStop: false,
    sendLabel: "Send",
    stopLabel: "Stop"
  };
}
