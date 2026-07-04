<template>
  <PetWindow
    v-if="isPetWindow"
    :state="state"
    :stage-status="stageStatus"
    :visible-bubble-text="visibleBubbleText"
    :speech-bubble-fading="speechBubbleFading"
    :bubble-placement="bubblePlacement"
    @hit-test="handlePetHitTest"
    @drag-start="handlePetDragStart"
    @drag-move="handlePetDragMove"
    @drag-end="handlePetDragEnd"
    @model-wheel="handlePetWheel"
    @model-context-menu="handlePetContextMenu"
    @model-bounds="updateModelBounds"
    @model-shape="updateModelShape"
  />
  <ControlsWindow
    v-else-if="isControlsWindow"
    :state="state"
    @send-message="sendMessage"
    @interrupt="interrupt"
    @start-voice-input="startVoiceInput"
    @stop-voice-input="stopVoiceInput"
    @toggle-speech-output="toggleSpeechOutput"
    @toggle-screen-awareness="toggleScreenAwareness"
    @open-settings="openSettings"
    @toggle-model-pass-through="toggleModelPassThrough"
    @hide-controls="hideControls"
    @drag-start="handleControlsDragStart"
    @drag-move="handleControlsDragMove"
    @drag-end="handleControlsDragEnd"
  />
  <ChatWindow
    v-else-if="isChatWindow"
    :state="state"
    v-model:draft="draft"
    @send="send"
    @interrupt="interrupt"
    @start-voice-input="startVoiceInput"
    @stop-voice-input="stopVoiceInput"
    @open-settings="openSettings"
  />
  <SettingsWindow
    v-else
    :state="state"
    :stage-status="stageStatus"
    :model-info="modelInfo"
    :model-pass-through="modelPassThrough"
    :locked="locked"
    @update-setting="updateSetting"
    @update-numeric-setting="updateNumericSetting"
    @update-boolean-setting="updateBooleanSetting"
    @update:model-pass-through="setModelPassThrough"
    @update:locked="setLocked"
    @choose-model="chooseModel"
    @reset-transform="resetTransform"
    @test-llm="testLLM"
    @test-voice="testVoice"
    @request-persona="requestPersona"
    @update-persona-field="updatePersonaField"
    @save-persona="savePersona"
    @preview-expression="previewExpression"
    @preview-motion="previewMotion"
    @refresh-memory-debug="refreshMemoryDebug"
    @memory-summary-update="updateMemorySummary"
    @memory-summary-delete="deleteMemorySummary"
    @memory-summary-clear="clearMemorySummaries"
    @memory-atom-update="updateMemoryAtom"
    @memory-atom-delete="deleteMemoryAtom"
    @memory-atom-clear-current-role="clearCurrentRoleMemoryAtoms"
    @memory-atom-export="exportMemoryAtom"
    @memory-export="exportMemory"
    @open-chat="openChat"
  />
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount } from "vue";
import ChatWindow from "./ChatWindow.vue";
import ControlsWindow from "./ControlsWindow.vue";
import PetWindow from "./PetWindow.vue";
import SettingsWindow from "./SettingsWindow.vue";
import { useSpeechBubbleController } from "./use-speech-bubble-controller";
import { useWindowRuntimeState } from "./use-window-runtime-state";
import { usePetWindowController } from "./use-pet-window-controller";
import { useAppShellActions } from "./use-app-shell-actions";
import { submitChatDraft } from "./chat-submit";

const queryModelPath = typeof window !== "undefined" ? new URLSearchParams(window.location.search).get("live2dModel") : null;
const windowRole = typeof window !== "undefined" ? new URLSearchParams(window.location.search).get("window") : null;
const isPetWindow = windowRole === "pet";
const isChatWindow = windowRole === "chat";
const isControlsWindow = windowRole === "controls";

const runtime = useWindowRuntimeState({ isPetWindow, isChatWindow, isControlsWindow, queryModelPath });
const {
  bridge,
  state,
  draft,
  modelInfo,
  modelPassThrough,
  locked,
  syncState,
  sendText,
  interrupt,
  startVoiceInput,
  stopVoiceInput,
  updateSetting,
  updateNumericSetting,
  updateBooleanSetting,
  setModelPassThrough,
  setLocked,
  toggleSpeechOutput,
  toggleScreenAwareness,
  chooseModel,
  resetTransform,
  testLLM,
  testVoice,
  requestPersona,
  updatePersonaField,
  savePersona,
  openSettings,
  openChat,
  hideControls,
  dispose
} = runtime;

const stageStatus = computed(() => state.value.status as "idle" | "listening" | "thinking" | "speaking" | "interrupted" | "error");
const speechBubbleSize = { width: 196, height: 78 } as const;
const bubbleShapeRect = computed(() => {
  if (!isPetWindow || !state.value.settings.speechBubbleEnabled || !visibleBubbleText.value) {
    return null;
  }
  return { x: bubblePlacement.value.x, y: bubblePlacement.value.y, ...speechBubbleSize };
});
const pet = usePetWindowController({
  isPetWindow,
  state,
  bubbleShapeRect,
  syncState,
  updateSettings: (patch) => bridge.updateSettings(patch)
});
const {
  handlePetHitTest,
  handlePetDragStart,
  handlePetDragMove,
  handlePetDragEnd,
  handlePetWheel,
  handlePetContextMenu,
  updateModelBounds,
  updateModelShape
} = pet;
const { visibleBubbleText, speechBubbleFading, bubblePlacement } = useSpeechBubbleController({
  state,
  isPetWindow,
  windowRef: typeof window !== "undefined" ? window : undefined,
  modelBounds: pet.lastModelBounds,
  modelShape: pet.lastModelShape,
  bubbleSize: speechBubbleSize,
  onShapeChange: () => pet.syncPetWindowShape()
});

function sendMessage(text: string): Promise<void> {
  return sendText(text).then(() => undefined);
}

async function send(): Promise<void> {
  await submitChatDraft(draft, sendMessage);
}

const shellActions = useAppShellActions({
  state,
  bridge,
  syncState,
  setModelPassThrough,
  openSettings,
  openChat,
  hideControls
});
const {
  toggleModelPassThrough,
  handleControlsDragStart,
  handleControlsDragMove,
  handleControlsDragEnd,
  previewExpression,
  previewMotion,
  refreshMemoryDebug,
  updateMemorySummary,
  deleteMemorySummary,
  clearMemorySummaries,
  updateMemoryAtom,
  deleteMemoryAtom,
  clearCurrentRoleMemoryAtoms,
  exportMemoryAtom,
  exportMemory
} = shellActions;

onBeforeUnmount(() => {
  dispose();
  window.greyfield?.send("window:hide-pet", {});
});
</script>
