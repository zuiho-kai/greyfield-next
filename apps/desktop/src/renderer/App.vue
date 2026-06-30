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
    @open-settings="openSettings"
    @toggle-model-pass-through="setModelPassThrough(!state.window.modelPassThrough)"
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
    @capture-screenshot="captureScreenshot"
    @start-observation="startObservation"
    @stop-observation="stopObservation"
    @delete-observation="deleteObservation"
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
import { computed, onBeforeUnmount, reactive, ref, watch } from "vue";
import { BrowserMicrophoneRecorder, BrowserSpeechSynthesisOutput } from "@greyfield/audio-runtime";
import ChatWindow from "./ChatWindow.vue";
import ControlsWindow from "./ControlsWindow.vue";
import { createDesktopRuntimeBridgeWithSpeech } from "./desktop-runtime-bridge";
import type { DesktopPersonaFormState, DesktopRendererState, DesktopSettingsState } from "./desktop-runtime-bridge";
import PetWindow from "./PetWindow.vue";
import SettingsWindow from "./SettingsWindow.vue";
import { beginPetDrag, continuePetDrag, endPetDrag, reducePetWheelScale, resolvePetHitTest, type PetDragState } from "./pet-interaction";
import { createPetWindowShape } from "./pet-window-shape";
import { placeSpeechBubble, type Rect } from "./speech-bubble-placement";
import { resolveSpeechBubbleSourceText } from "./speech-bubble-source";
import { formatSpeechBubbleText } from "./speech-bubble-text";
import { normalizeSettingsLocale } from "./settings-i18n";
import { isMaskedApiKey } from "../shared/secrets";
import type { RuntimeObservationMode } from "@greyfield/core-runtime";

const queryModelPath =
  typeof window !== "undefined" ? new URLSearchParams(window.location.search).get("live2dModel") : null;
const windowRole =
  typeof window !== "undefined" ? new URLSearchParams(window.location.search).get("window") : null;
const isPetWindow = windowRole === "pet";
const isChatWindow = windowRole === "chat";
const isControlsWindow = windowRole === "controls";
const bridge = createDesktopRuntimeBridgeWithSpeech(
  typeof window !== "undefined" ? window.greyfield : undefined,
  isPetWindow ? new BrowserSpeechSynthesisOutput() : undefined
);
const microphoneRecorder = isChatWindow || isControlsWindow ? new BrowserMicrophoneRecorder() : undefined;
const initialState = bridge.getState();

if (typeof document !== "undefined") {
  document.body.classList.toggle("pet-window", isPetWindow);
  document.body.classList.toggle("chat-window", isChatWindow);
  document.body.classList.toggle("controls-window", isControlsWindow);
  document.body.classList.toggle("settings-window", !isPetWindow && !isChatWindow && !isControlsWindow);
}

if (queryModelPath) {
  initialState.settings.modelPath = queryModelPath;
  bridge.updateSettings({ modelPath: queryModelPath });
}
const state = reactive<DesktopRendererState>(initialState);
const draft = ref("醒了吗？");
const lastModelBounds = ref<Rect | null>(null);
const lastModelShape = ref<Rect[]>([]);
const detachHostListeners: Array<() => void> = [];
const modelInfo = ref<{ modelPath: string; expressions: string[]; motions: Record<string, number> } | null>(null);
const dragState = ref<PetDragState>(endPetDrag({ active: false, startScreenX: 0, startScreenY: 0, startWindowX: 0, startWindowY: 0, modelScale: 1 }));
const lastWheelScaleAt = ref(0);
const speechBubbleSize = { width: 196, height: 78 } as const;
const speechBubbleHoldMs = 6500;
const speechBubbleFadeMs = 450;
const stageStatus = computed(() => state.status as "idle" | "listening" | "thinking" | "speaking" | "interrupted" | "error");
const bubbleText = computed(() =>
  resolveSpeechBubbleSourceText({
    assistantDraft: state.assistantDraft,
    proactiveMessageText: state.proactiveMessage?.text,
    messages: state.messages,
    status: state.status
  })
);
const visibleBubbleText = ref("");
const speechBubbleFading = ref(false);
const lockedBubblePlacement = ref<ReturnType<typeof placeSpeechBubble> | null>(null);
const dismissedBubbleText = ref("");
let speechBubbleHoldTimer: ReturnType<typeof setTimeout> | null = null;
let speechBubbleFadeTimer: ReturnType<typeof setTimeout> | null = null;
const liveBubblePlacement = computed(() =>
  placeSpeechBubble({
    modelBounds: lastModelBounds.value ?? { x: 120, y: 120, width: 180, height: 360 },
    modelShape: lastModelShape.value,
    windowBounds: { x: window.screenX, y: window.screenY, width: window.innerWidth, height: window.innerHeight },
    screenBounds: { x: window.screen.availLeft ?? 0, y: window.screen.availTop ?? 0, width: window.screen.availWidth, height: window.screen.availHeight },
    bubbleSize: speechBubbleSize
  })
);
const bubblePlacement = computed(() => lockedBubblePlacement.value ?? liveBubblePlacement.value);
const bubbleShapeRect = computed<Rect | null>(() => {
  if (!isPetWindow || !state.settings.speechBubbleEnabled || !visibleBubbleText.value) {
    return null;
  }
  return { x: bubblePlacement.value.x, y: bubblePlacement.value.y, ...speechBubbleSize };
});
detachHostListeners.push(bridge.onStateChange((nextState) => syncState(nextState)));

const modelPassThrough = computed(() => state.window.modelPassThrough);
const locked = computed(() => state.window.locked);

if (typeof window !== "undefined") {
  const detachWindowState = window.greyfield?.on("window:state", (windowState) => {
    Object.assign(state.window, windowState);
    syncPetWindowShape();
  });
  const detachSettings = window.greyfield?.on("settings:changed", (config) => {
    Object.assign(state.settings, {
      providerModel: config.provider.model,
      providerLLM: config.provider.llm,
      providerASR: config.provider.asr,
      providerASRModel: config.provider.asrModel,
      providerTTS: config.provider.tts,
      providerTTSModel: config.provider.ttsModel,
      providerBaseUrl: config.provider.baseUrl,
      providerApiKey: isMaskedApiKey(config.provider.apiKey) ? state.settings.providerApiKey : config.provider.apiKey,
      providerHasApiKey: config.provider.hasApiKey,
      voiceId: config.voice.id,
      voiceVolume: config.voice.volume,
      voiceSpeechEnabled: config.voice.speechEnabled,
      microphoneId: config.audio.microphoneId,
      characterFile: config.characterFile,
      modelPath: config.live2d.modelPath,
      modelScale: config.live2d.scale,
      modelX: config.live2d.x,
      modelY: config.live2d.y,
      speechBubbleEnabled: config.ui.speechBubbleEnabled,
      proactiveMemoryEnabled: config.ui.proactiveMemoryEnabled,
      settingsLocale: config.ui.locale,
      proactivityLevel: config.ui.proactivityLevel,
      llmAtomExtractionEnabled: config.memory.llmAtomExtractionEnabled
    });
    state.window.modelPassThrough = config.window.modelPassThrough;
    syncPetWindowShape();
  });
  const detachModelInfo = window.greyfield?.on("stage:model-info", (info) => {
    modelInfo.value = info;
  });
  if (detachWindowState) {
    detachHostListeners.push(detachWindowState);
  }
  if (detachSettings) {
    detachHostListeners.push(detachSettings);
  }
  if (detachModelInfo) {
    detachHostListeners.push(detachModelInfo);
  }
}

async function send(): Promise<void> {
  await sendMessage(draft.value);
  draft.value = "";
}

async function sendMessage(text: string): Promise<void> {
  const nextState = await bridge.sendText(text);
  syncState(nextState);
}

async function interrupt(): Promise<void> {
  microphoneRecorder?.cancel();
  syncState(await bridge.interrupt());
}

async function startVoiceInput(): Promise<void> {
  if (!microphoneRecorder) {
    syncState(bridge.failVoiceInput("Voice input is available from the pet controls or Chat window."));
    return;
  }
  try {
    syncState(bridge.startVoiceInput());
    await microphoneRecorder.start();
  } catch (error) {
    syncState(bridge.failVoiceInput(formatVoiceInputError(error)));
  }
}

async function stopVoiceInput(): Promise<void> {
  if (!microphoneRecorder) {
    syncState(bridge.failVoiceInput("Voice input is available from the pet controls or Chat window."));
    return;
  }
  try {
    const audio = await microphoneRecorder.stop();
    syncState(bridge.finishVoiceInput(audio));
  } catch (error) {
    syncState(bridge.failVoiceInput(formatVoiceInputError(error)));
  }
}

function captureScreenshot(): void {
  syncState(bridge.captureScreenshot());
}

function startObservation(mode: Exclude<RuntimeObservationMode, "single">): void {
  syncState(bridge.startObservation(mode));
}

function stopObservation(): void {
  syncState(bridge.stopObservation());
}

function deleteObservation(): void {
  syncState(bridge.deleteObservation());
}

function syncState(nextState: DesktopRendererState): void {
  if (nextState.inputDraft !== state.inputDraft) {
    draft.value = nextState.inputDraft;
  }
  Object.assign(state, nextState);
}

function updateSetting(key: keyof DesktopSettingsState, value: string): void {
  const patch: Partial<DesktopSettingsState> = {
    [key]: key === "settingsLocale" ? normalizeSettingsLocale(value) : value
  };
  if (
    state.settings.providerLLM !== "openai-compatible" &&
    value.trim().length > 0 &&
    (key === "providerBaseUrl" || key === "providerApiKey" || key === "providerModel")
  ) {
    patch.providerLLM = "openai-compatible";
  }
  if (state.settings.providerASR !== "openai-compatible" && value.trim().length > 0 && key === "providerASRModel") {
    patch.providerASR = "openai-compatible";
  }
  if (state.settings.providerTTS !== "openai-compatible" && value.trim().length > 0 && key === "providerTTSModel") {
    patch.providerTTS = "openai-compatible";
  }
  syncState(bridge.updateSettings(patch));
}

function updateNumericSetting(key: "modelScale" | "modelX" | "modelY" | "voiceVolume" | "proactivityLevel", value: string): void {
  const parsed = Number(value);
  if (Number.isFinite(parsed)) {
    syncState(bridge.updateSettings({ [key]: parsed }));
  }
}

function updateBooleanSetting(
  key: "speechBubbleEnabled" | "voiceSpeechEnabled" | "proactiveMemoryEnabled" | "llmAtomExtractionEnabled",
  value: boolean
): void {
  syncState(bridge.updateSettings({ [key]: value }));
}

function setModelPassThrough(value: boolean): void {
  syncState(bridge.setWindowState({ modelPassThrough: value }));
  window.greyfield?.send("settings:update", { window: { modelPassThrough: value } });
}

function setLocked(value: boolean): void {
  syncState(bridge.setWindowState({ locked: value }));
}

function toggleSpeechOutput(): void {
  updateBooleanSetting("voiceSpeechEnabled", !state.settings.voiceSpeechEnabled);
}

function chooseModel(): void {
  window.greyfield?.send("stage:choose-model", {});
}

function resetTransform(): void {
  syncState(bridge.updateSettings({ modelScale: 1, modelX: 0, modelY: 0 }));
}

function testLLM(): void {
  syncState(bridge.testLLMProvider());
}

function testVoice(): void {
  syncState(bridge.testVoiceProvider());
}

function requestPersona(): void {
  syncState(bridge.requestPersona());
}

function updatePersonaField(key: Exclude<keyof DesktopPersonaFormState, "expressionMap">, value: string): void {
  const currentForm = bridge.getState().persona.form;
  syncState(
    bridge.updatePersonaDraft({
      ...currentForm,
      [key]: value
    })
  );
}

function savePersona(form: DesktopPersonaFormState): void {
  syncState(bridge.savePersona(form));
}

function refreshMemoryDebug(): void {
  syncState(bridge.requestMemoryDebugSnapshot());
}

function updateMemorySummary(payload: { id: string; summary?: string; recallCues?: string[]; disabled?: boolean }): void {
  syncState(bridge.updateMemorySummary(payload));
}

function deleteMemorySummary(payload: { id: string }): void {
  syncState(bridge.deleteMemorySummary(payload.id));
}

function clearMemorySummaries(): void {
  syncState(bridge.clearMemorySummaries());
}

function updateMemoryAtom(payload: { id: string; text?: string; disabled?: boolean }): void {
  syncState(bridge.updateMemoryAtom(payload));
}

function deleteMemoryAtom(payload: { id: string }): void {
  syncState(bridge.deleteMemoryAtom(payload.id));
}

function clearCurrentRoleMemoryAtoms(): void {
  syncState(bridge.clearCurrentRoleMemoryAtoms());
}

function exportMemoryAtom(payload: { id: string }): void {
  syncState(bridge.exportMemoryAtom(payload.id));
}

function exportMemory(): void {
  syncState(bridge.exportMemory());
}

function previewExpression(expression: string): void {
  state.stage.expression = expression;
}

function previewMotion(group: string): void {
  state.stage.motion = { group, index: 0 };
}

function handlePetHitTest(payload: { hitModel: boolean }): void {
  const hitTest = resolvePetHitTest({ modelPassThrough: state.window.modelPassThrough, isModelPixel: payload.hitModel });
  window.greyfield?.send("window:set-hit-test", hitTest);
}

function handlePetDragStart(payload: { screenX: number; screenY: number }): void {
  dragState.value = beginPetDrag({
    hitModel: true,
    locked: state.window.locked,
    modelPassThrough: state.window.modelPassThrough,
    screenX: payload.screenX,
    screenY: payload.screenY,
    windowX: window.screenX,
    windowY: window.screenY,
    modelScale: state.settings.modelScale
  });
  if (dragState.value.active) {
    window.greyfield?.send("window:drag-start", payload);
  }
}

function handlePetDragMove(payload: { screenX: number; screenY: number }): void {
  if (!dragState.value.active) {
    return;
  }
  continuePetDrag(dragState.value, payload);
  window.greyfield?.send("window:drag-move", payload);
}

function handlePetDragEnd(): void {
  if (!dragState.value.active) {
    return;
  }
  dragState.value = endPetDrag(dragState.value);
  window.greyfield?.send("window:drag-end", {});
}

function handlePetWheel(payload: { deltaY: number; pointerX: number; pointerY: number; viewportWidth: number; viewportHeight: number }): void {
  const result = reducePetWheelScale({
    currentScale: state.settings.modelScale,
    currentX: state.settings.modelX,
    currentY: state.settings.modelY,
    deltaY: payload.deltaY,
    hitModel: true,
    dragging: dragState.value.active,
    modelPassThrough: state.window.modelPassThrough,
    pointerX: payload.pointerX,
    pointerY: payload.pointerY,
    viewportWidth: payload.viewportWidth,
    viewportHeight: payload.viewportHeight,
    modelBounds: lastModelBounds.value,
    nowMs: performance.now(),
    lastScaleAtMs: lastWheelScaleAt.value
  });
  lastWheelScaleAt.value = result.lastScaleAtMs;
  if (result.changed) {
    syncState(bridge.updateSettings({ modelScale: result.scale, modelX: result.x, modelY: result.y }));
  }
}

function handlePetContextMenu(payload: { screenX: number; screenY: number }): void {
  if (!state.window.modelPassThrough) {
    window.greyfield?.send("window:show-pet-menu", payload);
  }
}

function updateModelBounds(bounds: Rect | null): void {
  lastModelBounds.value = bounds;
  syncPetWindowShape();
}

function updateModelShape(rects: Rect[]): void {
  lastModelShape.value = rects;
  syncPetWindowShape();
}

function syncPetWindowShape(): void {
  if (!isPetWindow) {
    return;
  }
  const rects = createPetWindowShape({
    modelBounds: lastModelBounds.value,
    fallbackShape: lastModelShape.value,
    bubbleRect: bubbleShapeRect.value,
    viewportWidth: window.innerWidth,
    viewportHeight: window.innerHeight
  });
  window.greyfield?.send("window:set-shape", { rects, reason: "model-mask" });
}

function openSettings(): void {
  window.greyfield?.send("window:open-settings", {});
}

function openChat(): void {
  window.greyfield?.send("window:open-chat", {});
}

function hidePet(): void {
  window.greyfield?.send("window:hide-pet", {});
}

function hideControls(): void {
  window.greyfield?.send("window:hide-controls", {});
}

function handleControlsDragStart(payload: { screenX: number; screenY: number }): void {
  window.greyfield?.send("window:controls-drag-start", payload);
}

function handleControlsDragMove(payload: { screenX: number; screenY: number }): void {
  window.greyfield?.send("window:controls-drag-move", payload);
}

function handleControlsDragEnd(): void {
  window.greyfield?.send("window:controls-drag-end", {});
}

function formatVoiceInputError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  if (message.includes("Permission denied") || message.includes("NotAllowedError")) {
    return "Microphone permission was denied. Allow microphone access and try again.";
  }
  if (message.includes("not available")) {
    return "Microphone recording is not available in this window.";
  }
  return `Voice input failed: ${message}`;
}

watch(
  [bubbleText, () => state.status],
  () => {
    updateSpeechBubbleLifecycle();
  },
  { immediate: true }
);
watch([bubbleShapeRect, () => state.window.modelPassThrough], () => syncPetWindowShape());

onBeforeUnmount(() => {
  microphoneRecorder?.cancel();
  clearSpeechBubbleTimers();
  for (const detach of detachHostListeners) {
    detach();
  }
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
  if (state.assistantDraft) {
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
  if (state.assistantDraft || state.status === "thinking" || state.status === "speaking") {
    return;
  }

  speechBubbleHoldTimer = setTimeout(() => {
    speechBubbleFading.value = true;
    speechBubbleFadeTimer = setTimeout(() => {
      visibleBubbleText.value = "";
      speechBubbleFading.value = false;
      lockedBubblePlacement.value = null;
      dismissedBubbleText.value = nextText;
      syncPetWindowShape();
    }, speechBubbleFadeMs);
  }, speechBubbleHoldMs);
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
</script>
