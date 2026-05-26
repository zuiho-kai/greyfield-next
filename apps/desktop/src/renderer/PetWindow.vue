<template>
  <main class="pet-shell" aria-label="Greyfield pet">
    <Live2DStageView
      :model-path="state.settings.modelPath"
      :mouth-open="state.stage.mouthOpen"
      :status="stageStatus"
      :model-scale="state.settings.modelScale"
      :model-x="state.settings.modelX"
      :model-y="state.settings.modelY"
      :expression="state.stage.expression"
      :motion="state.stage.motion"
      @hit-test="$emit('hit-test', $event)"
      @drag-start="$emit('drag-start', $event)"
      @drag-move="$emit('drag-move', $event)"
      @drag-end="$emit('drag-end')"
      @model-wheel="$emit('model-wheel', $event)"
      @model-context-menu="$emit('model-context-menu', $event)"
      @model-bounds="$emit('model-bounds', $event)"
      @model-shape="$emit('model-shape', $event)"
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
</template>

<script setup lang="ts">
import type { DesktopRendererState } from "./desktop-runtime-bridge";
import Live2DStageView from "./Live2DStageView.vue";
import type { Rect, SpeechBubblePlacement } from "./speech-bubble-placement";

defineProps<{
  state: DesktopRendererState;
  stageStatus: "idle" | "listening" | "thinking" | "speaking" | "interrupted" | "error";
  visibleBubbleText: string;
  bubblePlacement: SpeechBubblePlacement;
}>();

defineEmits<{
  "hit-test": [payload: { hitModel: boolean }];
  "drag-start": [payload: { screenX: number; screenY: number }];
  "drag-move": [payload: { screenX: number; screenY: number }];
  "drag-end": [];
  "model-wheel": [payload: { deltaY: number; pointerX: number; pointerY: number; viewportWidth: number; viewportHeight: number }];
  "model-context-menu": [payload: { screenX: number; screenY: number }];
  "model-bounds": [bounds: Rect | null];
  "model-shape": [rects: Rect[]];
}>();
</script>
