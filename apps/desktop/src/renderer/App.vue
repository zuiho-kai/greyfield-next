<template>
  <main v-if="isPetWindow" class="pet-shell" aria-label="Greyfield pet">
    <Live2DStageView
      :model-path="state.settings.modelPath"
      :mouth-open="state.stage.mouthOpen"
      :status="stageStatus"
      :model-scale="state.settings.modelScale"
      :model-x="state.settings.modelX"
      :model-y="state.settings.modelY"
      :expression="state.stage.expression"
      :motion="state.stage.motion"
      @hit-test="handlePetHitTest"
      @drag-start="handlePetDragStart"
      @drag-move="handlePetDragMove"
      @drag-end="handlePetDragEnd"
      @model-wheel="handlePetWheel"
      @model-context-menu="handlePetContextMenu"
      @model-bounds="updateModelBounds"
      @model-shape="updateModelShape"
    />
    <div
      v-if="state.settings.speechBubbleEnabled && visibleBubbleText"
      class="speech-bubble"
      :class="`speech-bubble--${bubblePlacement.side}`"
      :style="{ left: `${bubblePlacement.x}px`, top: `${bubblePlacement.y}px` }"
    >
      <span class="speech-bubble__text">{{ visibleBubbleText }}</span>
    </div>
  </main>

  <main v-else-if="isChatWindow" class="chat-shell">
    <header class="window-titlebar">
      <div class="chat-heading">
        <span>Chat</span>
        <span class="status-pill">{{ state.status }}</span>
      </div>
      <button type="button" @click="openSettings">Settings</button>
    </header>
    <div v-if="state.errorMessage" class="chat-error" role="alert">
      {{ state.errorMessage }}
    </div>
    <div class="message-list" aria-live="polite">
      <p v-for="(message, index) in state.messages" :key="index" :class="message.role">
        {{ message.text }}
      </p>
      <p v-if="state.assistantDraft" class="assistant draft">{{ state.assistantDraft }}</p>
    </div>
    <form class="composer" @submit.prevent="send">
      <input v-model="draft" aria-label="Message" autocomplete="off" spellcheck="false" />
      <button type="submit">Send</button>
      <button type="button" class="interrupt-button" @click="interrupt">Stop</button>
    </form>
  </main>

  <main v-else class="greyfield-shell">
    <nav class="settings-nav" aria-label="Settings sections">
      <strong>Greyfield</strong>
      <button type="button">Model</button>
      <button type="button">Voice</button>
      <button type="button">Window</button>
      <button type="button" @click="openChat">Chat</button>
    </nav>
    <section class="stage-surface" :class="{ speaking: state.status === 'speaking' }">
      <Live2DStageView
        :model-path="state.settings.modelPath"
        :mouth-open="state.stage.mouthOpen"
        :status="stageStatus"
        :model-scale="state.settings.modelScale"
        :model-x="state.settings.modelX"
        :model-y="state.settings.modelY"
        :expression="state.stage.expression"
        :motion="state.stage.motion"
      />
    </section>

    <aside class="control-surface">
      <header>
        <h1>Greyfield Next</h1>
        <span class="status-pill">{{ state.status }}</span>
      </header>

      <section class="settings-panel" aria-label="Settings">
        <label>
          <span>LLM</span>
          <input
            :value="state.settings.providerLLM"
            autocomplete="off"
            spellcheck="false"
            @input="updateSetting('providerLLM', valueFrom($event))"
          />
        </label>
        <label>
          <span>Base URL</span>
          <input
            :value="state.settings.providerBaseUrl"
            autocomplete="off"
            spellcheck="false"
            @input="updateSetting('providerBaseUrl', valueFrom($event))"
          />
        </label>
        <label>
          <span>API Key</span>
          <input
            :value="state.settings.providerApiKey"
            autocomplete="off"
            spellcheck="false"
            :placeholder="state.settings.providerHasApiKey ? 'Saved API key' : ''"
            type="password"
            @input="updateSetting('providerApiKey', valueFrom($event))"
          />
        </label>
        <label>
          <span>Model</span>
          <input
            :value="state.settings.providerModel"
            autocomplete="off"
            spellcheck="false"
            @input="updateSetting('providerModel', valueFrom($event))"
          />
        </label>
        <label>
          <span>Voice</span>
          <input
            :value="state.settings.voiceId"
            autocomplete="off"
            spellcheck="false"
            @input="updateSetting('voiceId', valueFrom($event))"
          />
        </label>
        <label>
          <span>Mic</span>
          <input
            :value="state.settings.microphoneId"
            autocomplete="off"
            spellcheck="false"
            @input="updateSetting('microphoneId', valueFrom($event))"
          />
        </label>
        <label>
          <span>Character</span>
          <input
            :value="state.settings.characterFile"
            autocomplete="off"
            spellcheck="false"
            @input="updateSetting('characterFile', valueFrom($event))"
          />
        </label>
        <label>
          <span>Live2D</span>
          <input
            :value="state.settings.modelPath"
            autocomplete="off"
            spellcheck="false"
            @input="updateSetting('modelPath', valueFrom($event))"
          />
        </label>
        <div class="settings-actions">
          <button type="button" @click="chooseModel">Choose model</button>
          <button type="button" @click="resetTransform">Reset transform</button>
        </div>
        <label>
          <span>Scale</span>
          <input
            :value="state.settings.modelScale"
            aria-label="Scale"
            type="number"
            min="0.2"
            max="3"
            step="0.05"
            @input="updateNumericSetting('modelScale', valueFrom($event))"
          />
        </label>
        <label>
          <span>X</span>
          <input :value="state.settings.modelX" aria-label="Model X" type="number" step="1" @input="updateNumericSetting('modelX', valueFrom($event))" />
        </label>
        <label>
          <span>Y</span>
          <input :value="state.settings.modelY" aria-label="Model Y" type="number" step="1" @input="updateNumericSetting('modelY', valueFrom($event))" />
        </label>
        <label>
          <span>Bubble</span>
          <input
            :checked="state.settings.speechBubbleEnabled"
            aria-label="Speech Bubble"
            type="checkbox"
            @change="updateBooleanSetting('speechBubbleEnabled', checkedFrom($event))"
          />
        </label>
      </section>

      <section v-if="modelInfo" class="model-inspector" aria-label="Live2D model info">
        <header>
          <h2>Live2D</h2>
          <span>{{ modelInfo.expressions.length }} exp / {{ motionCount }} mot</span>
        </header>
        <div v-if="modelInfo.expressions.length > 0" class="chip-group" aria-label="Expressions">
          <button
            v-for="expression in modelInfo.expressions"
            :key="expression"
            type="button"
            @click="previewExpression(expression)"
          >
            {{ expression }}
          </button>
        </div>
        <div v-if="Object.keys(modelInfo.motions).length > 0" class="chip-group" aria-label="Motions">
          <button
            v-for="(count, group) in modelInfo.motions"
            :key="group"
            type="button"
            @click="previewMotion(group)"
          >
            {{ group }} {{ count }}
          </button>
        </div>
      </section>

      <div class="toggles">
        <label>
          <input v-model="modelPassThrough" type="checkbox" />
          Model Pass Through
        </label>
        <label>
          <input v-model="locked" type="checkbox" />
          Lock
        </label>
      </div>

      <div class="audio-strip">
        <span v-for="(item, index) in state.audioQueue" :key="index">{{ item }}</span>
      </div>
    </aside>
  </main>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, reactive, ref, watch } from "vue";
import { createDesktopRuntimeBridge } from "./desktop-runtime-bridge";
import type { DesktopRendererState, DesktopSettingsState } from "./desktop-runtime-bridge";
import Live2DStageView from "./Live2DStageView.vue";
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
const motionCount = computed(() =>
  Object.values(modelInfo.value?.motions ?? {}).reduce((total, count) => total + count, 0)
);

detachHostListeners.push(bridge.onStateChange((nextState) => syncState(nextState)));

const modelPassThrough = computed({
  get: () => state.window.modelPassThrough,
  set: (value: boolean) => {
    syncState(bridge.setWindowState({ modelPassThrough: value }));
    window.greyfield?.send("settings:update", { window: { modelPassThrough: value } });
  }
});

const locked = computed({
  get: () => state.window.locked,
  set: (value: boolean) => syncState(bridge.setWindowState({ locked: value }))
});

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

function chooseModel(): void {
  window.greyfield?.send("stage:choose-model", {});
}

function resetTransform(): void {
  syncState(bridge.updateSettings({ modelScale: 1, modelX: 0, modelY: 0 }));
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

function valueFrom(event: Event): string {
  return event.target instanceof HTMLInputElement ? event.target.value : "";
}

function checkedFrom(event: Event): boolean {
  return event.target instanceof HTMLInputElement ? event.target.checked : false;
}

watch([bubbleShapeRect, () => state.window.modelPassThrough], () => syncPetWindowShape());

onBeforeUnmount(() => {
  for (const detach of detachHostListeners) {
    detach();
  }
});
</script>
