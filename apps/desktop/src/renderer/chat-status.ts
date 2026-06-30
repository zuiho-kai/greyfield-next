import type { DesktopRendererState } from "./desktop-runtime-bridge";
import { settingsT, type SettingsLocale } from "./settings-i18n";

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
  currentDraft = state.inputDraft,
  locale?: SettingsLocale
): ChatStatusView {
  if (state.status === "thinking") {
    return {
      label: settingsT(locale, "chat.status.generating.label"),
      detail: settingsT(locale, "chat.status.generating.waiting"),
      tone: "generating",
      canStop: true,
      sendLabel: settingsT(locale, "chat.action.send"),
      stopLabel: settingsT(locale, "chat.action.stop")
    };
  }

  if (state.status === "speaking") {
    return {
      label: settingsT(locale, "chat.status.generating.label"),
      detail: settingsT(locale, "chat.status.generating.replying"),
      tone: "generating",
      canStop: true,
      sendLabel: settingsT(locale, "chat.action.send"),
      stopLabel: settingsT(locale, "chat.action.stop")
    };
  }

  const hasActiveSpeech =
    state.settings.voiceSpeechEnabled && (state.audioQueue.length > 0 || state.stage.mouthOpen > 0);
  if (hasActiveSpeech) {
    return {
      label: settingsT(locale, "chat.status.generating.label"),
      detail: settingsT(locale, "chat.status.generating.speaking"),
      tone: "generating",
      canStop: true,
      sendLabel: settingsT(locale, "chat.action.send"),
      stopLabel: settingsT(locale, "chat.action.stop")
    };
  }

  if (state.status === "interrupted") {
    return {
      label: settingsT(locale, "chat.status.stopped.label"),
      detail: settingsT(locale, "chat.status.stopped.detail"),
      tone: "stopped",
      canStop: false,
      sendLabel: settingsT(locale, "chat.action.send"),
      stopLabel: settingsT(locale, "chat.action.stopped")
    };
  }

  if (state.status === "error") {
    const hasRetryDraft = currentDraft.trim().length > 0;
    return {
      label: hasRetryDraft
        ? settingsT(locale, "chat.status.failed.retryLabel")
        : settingsT(locale, "chat.status.failed.label"),
      detail: hasRetryDraft
        ? settingsT(locale, "chat.status.failed.retryDetail")
        : settingsT(locale, "chat.status.failed.detail"),
      tone: hasRetryDraft ? "retry" : "failed",
      canStop: false,
      sendLabel: hasRetryDraft ? settingsT(locale, "chat.action.retry") : settingsT(locale, "chat.action.send"),
      stopLabel: settingsT(locale, "chat.action.stop")
    };
  }

  if (state.status === "listening") {
    return {
      label: settingsT(locale, "chat.status.waiting.label"),
      detail: settingsT(locale, "chat.status.listening.detail"),
      tone: "waiting",
      canStop: true,
      sendLabel: settingsT(locale, "chat.action.send"),
      stopLabel: settingsT(locale, "chat.action.stop")
    };
  }

  return {
    label: settingsT(locale, "chat.status.waiting.label"),
    detail: settingsT(locale, "chat.status.waiting.detail"),
    tone: "waiting",
    canStop: false,
    sendLabel: settingsT(locale, "chat.action.send"),
    stopLabel: settingsT(locale, "chat.action.stop")
  };
}
