<template>
  <PetWindow
    v-if="isPetWindow"
    :state="state"
    :stage-status="stageStatus"
    :visible-bubble-text="visibleBubbleText"
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
  <ChatWindow
    v-else-if="isChatWindow"
    :state="state"
    v-model:draft="draft"
    @send="send"
    @interrupt="interrupt"
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
    @preview-expression="previewExpression"
    @preview-motion="previewMotion"
    @open-chat="openChat"
  />
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, reactive, ref, watch } from "vue";
import ChatWindow from "./ChatWindow.vue";
import { createDesktopRuntimeBridge } from "./desktop-runtime-bridge";
import type { DesktopRendererState, DesktopSettingsState } from "./desktop-runtime-bridge";
import PetWindow from "./PetWindow.vue";
import SettingsWindow from "./SettingsWindow.vue";
import { beginPetDrag, continuePetDrag, endPetDrag, reducePetWheelScale, resolvePetHitTest, type PetDragState } from "./pet-interaction";
import { createPetWindowShape } from "./pet-window-shape";
import { placeSpeechBubble, type Rect } from "./speech-bubble-placement";
import { formatSpeechBubbleText } from "./speech-bubble-text";
import { isMaskedApiKey } from "../shared/secrets";

const bridge = createDesktopRuntimeBridge(typeof window !== "undefined" ? window.greyfield : undefined);
const initialState = bridge.getState();
const queryModelPath =
  typeof window !== "undefined" ? new URLSearchParams(window.location.search).get("live2dModel") : null;
const windowRole =
  typeof window !== "undefined" ? new URLSearchParams(window.location.search).get("window") : null;
const isPetWindow = windowRole === "pet";
const isChatWindow = windowRole === "chat";

if (typeof document !== "undefined") {
  document.body.classList.toggle("pet-window", isPetWindow);
  document.body.classList.toggle("chat-window", isChatWindow);
  document.body.classList.toggle("settings-window", !isPetWindow && !isChatWindow);
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
const speechBubbleSize = { width: 220, height: 124 } as const;
const stageStatus = computed(() => state.status as "idle" | "listening" | "thinking" | "speaking" | "interrupted" | "error");
const bubbleText = computed(() => state.assistantDraft || [...state.messages].reverse().find((message) => message.role === "assistant")?.text || "");
const visibleBubbleText = computed(() => formatSpeechBubbleText(bubbleText.value));
const bubblePlacement = computed(() =>
  placeSpeechBubble({
    modelBounds: lastModelBounds.value ?? { x: 120, y: 120, width: 180, height: 360 },
    windowBounds: { x: window.screenX, y: window.screenY, width: window.innerWidth, height: window.innerHeight },
    screenBounds: { x: window.screen.availLeft ?? 0, y: window.screen.availTop ?? 0, width: window.screen.availWidth, height: window.screen.availHeight },
    bubbleSize: speechBubbleSize
  })
);
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
      providerBaseUrl: config.provider.baseUrl,
      providerApiKey: isMaskedApiKey(config.provider.apiKey) ? "" : config.provider.apiKey,
      providerHasApiKey: config.provider.hasApiKey,
      voiceId: config.voice.id,
      microphoneId: config.audio.microphoneId,
      characterFile: config.characterFile,
      modelPath: config.live2d.modelPath,
      modelScale: config.live2d.scale,
      modelX: config.live2d.x,
      modelY: config.live2d.y,
      speechBubbleEnabled: config.ui.speechBubbleEnabled
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
  const nextState = await bridge.sendText(draft.value);
  draft.value = "";
  syncState(nextState);
}

async function interrupt(): Promise<void> {
  syncState(await bridge.interrupt());
}

function syncState(nextState: DesktopRendererState): void {
  if (nextState.inputDraft !== state.inputDraft) {
    draft.value = nextState.inputDraft;
  }
  Object.assign(state, nextState);
}

function updateSetting(key: keyof DesktopSettingsState, value: string): void {
  syncState(bridge.updateSettings({ [key]: value }));
}

function updateNumericSetting(key: "modelScale" | "modelX" | "modelY", value: string): void {
  const parsed = Number(value);
  if (Number.isFinite(parsed)) {
    syncState(bridge.updateSettings({ [key]: parsed }));
  }
}

function updateBooleanSetting(key: "speechBubbleEnabled", value: boolean): void {
  syncState(bridge.updateSettings({ [key]: value }));
}

function setModelPassThrough(value: boolean): void {
  syncState(bridge.setWindowState({ modelPassThrough: value }));
  window.greyfield?.send("settings:update", { window: { modelPassThrough: value } });
}

function setLocked(value: boolean): void {
  syncState(bridge.setWindowState({ locked: value }));
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
  if (!isPetWindow || state.window.modelPassThrough) {
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

watch([bubbleShapeRect, () => state.window.modelPassThrough], () => syncPetWindowShape());

onBeforeUnmount(() => {
  for (const detach of detachHostListeners) {
    detach();
  }
});
</script>
