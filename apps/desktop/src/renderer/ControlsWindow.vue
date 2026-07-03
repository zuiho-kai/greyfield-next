<template>
  <main class="desktop-controls-shell" :aria-label="t('controls.shell')">
    <form
      class="desktop-control-panel"
      :class="{ 'desktop-control-panel--collapsed': controlsCollapsed }"
      :aria-label="t('controls.panel')"
      data-testid="desktop-control-panel"
      @submit.prevent="submitInlineMessage"
    >
      <div class="desktop-control-header">
        <button
          type="button"
          class="desktop-control-handle"
          :title="t('controls.move')"
          :aria-label="t('controls.move')"
          @pointerdown.prevent="startDrag"
          @mousedown.prevent="startDrag"
        >
          <GripHorizontal :size="16" stroke-width="2.25" />
        </button>
        <span class="desktop-control-status" :class="`desktop-control-status--${chatStatus.tone}`">
          {{ chatStatus.label }}
        </span>
        <button
          type="button"
          class="desktop-control-button desktop-control-button--ghost"
          :title="controlsCollapsed ? t('controls.expand') : t('controls.collapse')"
          :aria-label="controlsCollapsed ? t('controls.expand') : t('controls.collapse')"
          @click="controlsCollapsed = !controlsCollapsed"
        >
          <ChevronDown v-if="!controlsCollapsed" :size="16" stroke-width="2.35" />
          <ChevronUp v-else :size="16" stroke-width="2.35" />
        </button>
      </div>

      <div v-if="!controlsCollapsed" class="desktop-control-compose">
        <input
          v-model="inlineDraft"
          class="desktop-control-input"
          :aria-label="t('controls.message')"
          :placeholder="t('controls.placeholder')"
          autocomplete="off"
          spellcheck="false"
        />
        <button
          type="submit"
          class="desktop-control-button desktop-control-button--primary"
          :disabled="!inlineDraft.trim()"
          :title="t('controls.send')"
          :aria-label="t('controls.send')"
        >
          <SendHorizontal :size="17" stroke-width="2.35" />
        </button>
      </div>

      <div v-if="!controlsCollapsed" class="desktop-control-actions" :aria-label="t('controls.actions')">
        <button
          type="button"
          class="desktop-control-button"
          :class="{ 'desktop-control-button--active': state.voiceInput.status === 'listening' }"
          :disabled="state.voiceInput.status === 'transcribing'"
          :title="voiceInputTitle"
          :aria-label="voiceInputTitle"
          @click="$emit(state.voiceInput.status === 'listening' ? 'stop-voice-input' : 'start-voice-input')"
        >
          <Mic :size="16" stroke-width="2.35" />
        </button>
        <button
          type="button"
          class="desktop-control-button"
          :class="{ 'desktop-control-button--active': state.settings.voiceSpeechEnabled }"
          :title="speechOutputTitle"
          :aria-label="speechOutputTitle"
          @click="$emit('toggle-speech-output')"
        >
          <Volume2 v-if="state.settings.voiceSpeechEnabled" :size="16" stroke-width="2.35" />
          <VolumeX v-else :size="16" stroke-width="2.35" />
        </button>
        <button
          type="button"
          class="desktop-control-button"
          :class="{ 'desktop-control-button--active': state.screenAwareness.enabled }"
          :title="screenAwarenessTitle"
          :aria-label="screenAwarenessTitle"
          @click="$emit('toggle-screen-awareness')"
        >
          <ScanEye :size="16" stroke-width="2.35" />
        </button>
        <button type="button" class="desktop-control-button" :title="t('controls.openSettings')" :aria-label="t('controls.openSettings')" @click="$emit('open-settings')">
          <Settings :size="16" stroke-width="2.35" />
        </button>
        <button
          type="button"
          class="desktop-control-button"
          :class="{ 'desktop-control-button--active': state.window.modelPassThrough }"
          :title="modelPassThroughTitle"
          :aria-label="modelPassThroughTitle"
          @click="$emit('toggle-model-pass-through')"
        >
          <MousePointer2 :size="16" stroke-width="2.35" />
        </button>
        <button type="button" class="desktop-control-button" :title="t('controls.hide')" :aria-label="t('controls.hide')" @click="$emit('hide-controls')">
          <Minimize2 :size="16" stroke-width="2.35" />
        </button>
        <button
          type="button"
          class="desktop-control-button desktop-control-button--stop"
          :disabled="!canStop"
          :title="t('controls.stop')"
          :aria-label="t('controls.stop')"
          @click="$emit('interrupt')"
        >
          <Square :size="15" stroke-width="2.45" />
        </button>
      </div>
    </form>
  </main>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, ref } from "vue";
import {
  ChevronDown,
  ChevronUp,
  GripHorizontal,
  Mic,
  Minimize2,
  MousePointer2,
  ScanEye,
  SendHorizontal,
  Settings,
  Square,
  Volume2,
  VolumeX
} from "lucide-vue-next";
import { describeChatStatus } from "./chat-status";
import type { DesktopRendererState } from "./desktop-runtime-bridge";
import { normalizeSettingsLocale, settingsT, type SettingsI18nKey } from "./settings-i18n";

const props = defineProps<{
  state: DesktopRendererState;
}>();

const emit = defineEmits<{
  "send-message": [text: string];
  interrupt: [];
  "start-voice-input": [];
  "stop-voice-input": [];
  "toggle-speech-output": [];
  "toggle-screen-awareness": [];
  "open-settings": [];
  "toggle-model-pass-through": [];
  "hide-controls": [];
  "drag-start": [payload: { screenX: number; screenY: number }];
  "drag-move": [payload: { screenX: number; screenY: number }];
  "drag-end": [];
}>();

const inlineDraft = ref("");
const controlsCollapsed = ref(false);
const activeDragPointerId = ref<number | null>(null);
const locale = computed(() => normalizeSettingsLocale(props.state.settings.settingsLocale));
const t = (key: SettingsI18nKey, values?: Record<string, string | number>): string =>
  settingsT(locale.value, key, values);
const chatStatus = computed(() => describeChatStatus(props.state, inlineDraft.value, locale.value));
const canStop = computed(() => chatStatus.value.canStop || props.state.voiceInput.status === "listening" || props.state.voiceInput.status === "transcribing");
const voiceInputTitle = computed(() => {
  if (props.state.voiceInput.status === "listening") {
    return t("controls.mic.stop");
  }
  if (props.state.voiceInput.status === "transcribing") {
    return t("controls.mic.transcribing");
  }
  return t("controls.mic.start");
});
const speechOutputTitle = computed(() =>
  props.state.settings.voiceSpeechEnabled ? t("controls.voice.off") : t("controls.voice.on")
);
const screenAwarenessTitle = computed(() =>
  props.state.screenAwareness.enabled ? t("controls.screenAwareness.off") : t("controls.screenAwareness.on")
);
const modelPassThroughTitle = computed(() =>
  props.state.window.modelPassThrough ? t("controls.passThrough.on") : t("controls.passThrough.off")
);

function submitInlineMessage(): void {
  const text = inlineDraft.value.trim();
  if (!text) {
    return;
  }
  emit("send-message", text);
  inlineDraft.value = "";
}

function startDrag(event: PointerEvent | MouseEvent): void {
  if (activeDragPointerId.value !== null) {
    return;
  }
  activeDragPointerId.value = "pointerId" in event ? event.pointerId : -1;
  emit("drag-start", { screenX: event.screenX, screenY: event.screenY });
  window.addEventListener("pointermove", moveDrag);
  window.addEventListener("pointerup", endDrag);
  window.addEventListener("pointercancel", endDrag);
  window.addEventListener("mousemove", moveDrag);
  window.addEventListener("mouseup", endDrag);
}

function moveDrag(event: PointerEvent | MouseEvent): void {
  if (activeDragPointerId.value === null || ("pointerId" in event && activeDragPointerId.value !== -1 && event.pointerId !== activeDragPointerId.value)) {
    return;
  }
  emit("drag-move", { screenX: event.screenX, screenY: event.screenY });
}

function endDrag(event?: PointerEvent | MouseEvent): void {
  if (
    activeDragPointerId.value === null ||
    (event && "pointerId" in event && activeDragPointerId.value !== -1 && event.pointerId !== activeDragPointerId.value)
  ) {
    return;
  }
  activeDragPointerId.value = null;
  window.removeEventListener("pointermove", moveDrag);
  window.removeEventListener("pointerup", endDrag);
  window.removeEventListener("pointercancel", endDrag);
  window.removeEventListener("mousemove", moveDrag);
  window.removeEventListener("mouseup", endDrag);
  emit("drag-end");
}

onBeforeUnmount(() => {
  endDrag();
});
</script>
