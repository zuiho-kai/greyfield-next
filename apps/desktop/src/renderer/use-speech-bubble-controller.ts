import { computed, onBeforeUnmount, ref, watch, type Ref } from "vue";
import { formatSpeechBubbleText } from "./speech-bubble-text";
import { placeSpeechBubble, type Rect } from "./speech-bubble-placement";
import { resolveSpeechBubbleSourceText } from "./speech-bubble-source";
import type { DesktopRendererState } from "./desktop-runtime-bridge";

export function useSpeechBubbleController(params: {
  state: Ref<DesktopRendererState>;
  isPetWindow: boolean;
  windowRef: Window | undefined;
  modelBounds: Ref<Rect | null>;
  modelShape: Ref<Rect[]>;
  bubbleSize: { width: number; height: number };
  onShapeChange: () => void;
}) {
  const visibleBubbleText = ref("");
  const speechBubbleFading = ref(false);
  const lockedBubblePlacement = ref<ReturnType<typeof placeSpeechBubble> | null>(null);
  const dismissedBubbleText = ref("");
  let speechBubbleHoldTimer: ReturnType<typeof setTimeout> | null = null;
  let speechBubbleFadeTimer: ReturnType<typeof setTimeout> | null = null;

  const bubbleText = computed(() =>
    resolveSpeechBubbleSourceText({
      assistantDraft: params.state.value.assistantDraft,
      proactiveMessageText: params.state.value.proactiveMessage?.text,
      messages: params.state.value.messages,
      status: params.state.value.status
    })
  );
  const liveBubblePlacement = computed(() =>
    placeSpeechBubble({
      modelBounds: params.modelBounds.value ?? { x: 120, y: 120, width: 180, height: 360 },
      modelShape: params.modelShape.value,
      windowBounds: {
        x: params.windowRef?.screenX ?? 0,
        y: params.windowRef?.screenY ?? 0,
        width: params.windowRef?.innerWidth ?? 0,
        height: params.windowRef?.innerHeight ?? 0
      },
      screenBounds: {
        x: 0,
        y: 0,
        width: params.windowRef?.screen?.width ?? 0,
        height: params.windowRef?.screen?.height ?? 0
      },
      bubbleSize: params.bubbleSize
    })
  );
  const bubblePlacement = computed(() => lockedBubblePlacement.value ?? liveBubblePlacement.value);
  const bubbleShapeRect = computed<Rect | null>(() => {
    if (!params.isPetWindow || !params.state.value.settings.speechBubbleEnabled || !visibleBubbleText.value) {
      return null;
    }
    return { x: bubblePlacement.value.x, y: bubblePlacement.value.y, ...params.bubbleSize };
  });

  watch(
    [bubbleText, () => params.state.value.status],
    () => {
      updateSpeechBubbleLifecycle();
    },
    { immediate: true }
  );
  watch([bubbleShapeRect, () => params.state.value.window.modelPassThrough], () => params.onShapeChange());

  onBeforeUnmount(() => {
    clearSpeechBubbleTimers();
  });

  function updateSpeechBubbleLifecycle(): void {
    const nextText = formatSpeechBubbleText(bubbleText.value);
    clearSpeechBubbleTimers();
    if (!nextText) {
      visibleBubbleText.value = "";
      speechBubbleFading.value = false;
      lockedBubblePlacement.value = null;
      dismissedBubbleText.value = "";
      return;
    }
    if (params.state.value.assistantDraft) {
      dismissedBubbleText.value = "";
    } else if (dismissedBubbleText.value === nextText) {
      visibleBubbleText.value = "";
      speechBubbleFading.value = false;
      lockedBubblePlacement.value = null;
      return;
    }

    if (!lockedBubblePlacement.value) {
      lockedBubblePlacement.value = liveBubblePlacement.value;
    }
    visibleBubbleText.value = nextText;
    speechBubbleFading.value = false;
    if (params.state.value.assistantDraft || params.state.value.status === "thinking" || params.state.value.status === "speaking") {
      return;
    }

    speechBubbleHoldTimer = setTimeout(() => {
      speechBubbleFading.value = true;
      speechBubbleFadeTimer = setTimeout(() => {
        visibleBubbleText.value = "";
        speechBubbleFading.value = false;
        lockedBubblePlacement.value = null;
        dismissedBubbleText.value = nextText;
        params.onShapeChange();
      }, 450);
    }, 6500);
  }

  function clearSpeechBubbleTimers(): void {
    if (speechBubbleHoldTimer) {
      clearTimeout(speechBubbleHoldTimer);
      speechBubbleHoldTimer = null;
    }
    if (speechBubbleFadeTimer) {
      clearTimeout(speechBubbleFadeTimer);
      speechBubbleFadeTimer = null;
    }
  }

  return {
    visibleBubbleText,
    speechBubbleFading,
    bubblePlacement,
    bubbleShapeRect
  };
}
