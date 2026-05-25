<template>
  <section
    class="live2d-stage-view"
    :data-stage-mode="usingFallback ? 'fallback' : 'live2d'"
    :data-last-touch="lastTouchArea ?? ''"
    :data-current-expression="lastExpression ?? ''"
    :data-current-motion="lastMotion ?? ''"
    :data-model-hit="lastHitModel ? 'true' : 'false'"
    :data-dragging="dragging ? 'true' : 'false'"
    @pointermove="focusFromPointer"
    @mousemove="focusFromPointer"
    @mouseover="focusFromPointer"
    @pointerdown="handlePointerDown"
    @pointerup="handlePointerUp"
    @pointercancel="handlePointerUp"
    @contextmenu="handleContextMenu"
    @wheel="handleWheel"
  >
    <div ref="live2dHost" class="live2d-host" aria-label="Live2D stage"></div>
    <canvas
      v-if="usingFallback"
      ref="fallbackCanvas"
      class="fallback-stage-canvas"
      aria-label="Greyfield fallback stage preview"
    ></canvas>
  </section>
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from "vue";
import {
  createPixiLive2DRenderer,
  createDefaultInteractionProfile,
  Live2DStageDriver,
  resolveTouchReaction,
  type PixiLive2DRenderer,
} from "@greyfield/stage-live2d";
import cubismCoreScriptUrl from "live2dcubismcore/live2dcubismcore.min.js?url";

import { renderFallbackStageCanvas } from "./fallback-stage-canvas";
import { toRendererModelUrl } from "./live2d-model-url";

const props = defineProps<{
  modelPath: string;
  mouthOpen: number;
  status: "idle" | "listening" | "thinking" | "speaking" | "interrupted" | "error";
  modelScale: number;
  modelX: number;
  modelY: number;
  expression?: string;
  motion?: {
    group: string;
    index?: number;
  };
}>();

const emit = defineEmits<{
  hitTest: [payload: { hitModel: boolean }];
  dragStart: [payload: { screenX: number; screenY: number }];
  dragMove: [payload: { screenX: number; screenY: number }];
  dragEnd: [];
  modelWheel: [payload: { deltaY: number; pointerX: number; pointerY: number; viewportWidth: number; viewportHeight: number }];
  modelContextMenu: [payload: { screenX: number; screenY: number }];
  modelBounds: [payload: { x: number; y: number; width: number; height: number } | null];
  modelShape: [payload: Array<{ x: number; y: number; width: number; height: number }>];
}>();

const live2dHost = ref<HTMLElement | null>(null);
const fallbackCanvas = ref<HTMLCanvasElement | null>(null);
const usingFallback = ref(true);
const lastTouchArea = ref<string | null>(null);
const lastExpression = ref<string | null>(null);
const lastMotion = ref<string | null>(null);
const renderer = ref<PixiLive2DRenderer | null>(null);
const driver = ref<Live2DStageDriver | null>(null);
const touchReferenceSize = { width: 420, height: 620 };
const stageSize = ref({ width: 420, height: 620 });
const interactionProfile = createDefaultInteractionProfile();
let frameHandle = 0;
let resizeObserver: ResizeObserver | null = null;
const dragging = ref(false);
let lastHitTestAt = 0;
const lastHitModel = ref(false);

const transform = computed(() => ({
  scale: props.modelScale,
  x: props.modelX,
  y: props.modelY
}));

async function ensureRenderer(): Promise<Live2DStageDriver> {
  if (driver.value) {
    return driver.value;
  }
  if (!live2dHost.value) {
    throw new Error("Live2D host is not mounted");
  }

  renderer.value = await createPixiLive2DRenderer({
    container: live2dHost.value,
    width: stageSize.value.width,
    height: stageSize.value.height,
    cubismCoreScriptUrl,
    resolution: window.devicePixelRatio || 1
  });
  driver.value = new Live2DStageDriver(renderer.value);
  return driver.value;
}

async function loadModel(): Promise<void> {
  const modelUrl = toRendererModelUrl(props.modelPath);
  if (!modelUrl) {
    usingFallback.value = true;
    await nextTick();
    renderFallback();
    return;
  }

  try {
    const nextDriver = await ensureRenderer();
    await nextDriver.loadModel(modelUrl);
    nextDriver.setTransform(transform.value);
    await nextDriver.setMouthOpen(props.mouthOpen);
    usingFallback.value = false;
    requestAnimationFrame(() => emitModelBounds());
  } catch (error) {
    console.error("[Greyfield] Live2D stage failed, showing fallback preview.", error);
    usingFallback.value = true;
    await nextTick();
    renderFallback();
    emitModelBounds();
  }
}

function focusFromPointer(event: MouseEvent): void {
  const hitModel = sampleModelHit(event.clientX, event.clientY);
  emitHitTest(hitModel);
  if (dragging.value) {
    emit("dragMove", { screenX: event.screenX, screenY: event.screenY });
  }
  if (!driver.value || usingFallback.value) {
    return;
  }
  const rect = (event.currentTarget as HTMLElement).getBoundingClientRect();
  const x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
  const y = ((event.clientY - rect.top) / rect.height) * 2 - 1;
  driver.value.focusAt(x, y);
}

async function handlePointerDown(event: PointerEvent): Promise<void> {
  const hitModel = sampleModelHit(event.clientX, event.clientY);
  emitHitTest(hitModel);
  if (!hitModel) {
    return;
  }
  if (event.button === 0) {
    dragging.value = true;
    (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
    emit("dragStart", { screenX: event.screenX, screenY: event.screenY });
  }
  await reactToTouch(event);
}

function handlePointerUp(event: PointerEvent): void {
  if (!dragging.value) {
    return;
  }
  dragging.value = false;
  const target = event.currentTarget as HTMLElement;
  if (target.hasPointerCapture(event.pointerId)) {
    target.releasePointerCapture(event.pointerId);
  }
  emit("dragEnd");
}

function handleWheel(event: WheelEvent): void {
  if (!sampleModelHit(event.clientX, event.clientY)) {
    return;
  }
  event.preventDefault();
  const rect = (event.currentTarget as HTMLElement).getBoundingClientRect();
  emit("modelWheel", {
    deltaY: event.deltaY,
    pointerX: event.clientX,
    pointerY: event.clientY,
    viewportWidth: rect.width,
    viewportHeight: rect.height
  });
}

function handleContextMenu(event: MouseEvent): void {
  if (!sampleModelHit(event.clientX, event.clientY)) {
    return;
  }
  event.preventDefault();
  emit("modelContextMenu", { screenX: event.screenX, screenY: event.screenY });
}

async function reactToTouch(event: PointerEvent): Promise<void> {
  const rect = (event.currentTarget as HTMLElement).getBoundingClientRect();
  const point = {
    x: ((event.clientX - rect.left) / rect.width) * touchReferenceSize.width,
    y: ((event.clientY - rect.top) / rect.height) * touchReferenceSize.height
  };
  const reaction = resolveTouchReaction(interactionProfile, point);
  if (!reaction) {
    return;
  }

  lastTouchArea.value = reaction.areaId;
  if (!driver.value || usingFallback.value) {
    return;
  }

  if (reaction.expression) {
    lastExpression.value = reaction.expression;
    await driver.value.setExpression(reaction.expression);
  }
  if (reaction.motion) {
    lastMotion.value = reaction.motion.index === undefined ? reaction.motion.group : `${reaction.motion.group}:${reaction.motion.index}`;
    await driver.value.playMotion(reaction.motion.group, reaction.motion.index);
  }
}

function sampleModelHit(clientX: number, clientY: number): boolean {
  if (!usingFallback.value && renderer.value) {
    return renderer.value.sampleAlphaAt(clientX, clientY);
  }
  if (fallbackCanvas.value) {
    return sampleFallbackAlpha(clientX, clientY);
  }
  return false;
}

function sampleFallbackAlpha(clientX: number, clientY: number): boolean {
  const canvas = fallbackCanvas.value;
  const context = canvas?.getContext("2d");
  if (!canvas || !context) {
    return false;
  }
  const rect = canvas.getBoundingClientRect();
  if (rect.width <= 0 || rect.height <= 0) {
    return false;
  }
  const x = Math.min(canvas.width - 1, Math.max(0, Math.floor(((clientX - rect.left) / rect.width) * canvas.width)));
  const y = Math.min(canvas.height - 1, Math.max(0, Math.floor(((clientY - rect.top) / rect.height) * canvas.height)));
  return context.getImageData(x, y, 1, 1).data[3] >= 16;
}

function emitHitTest(hitModel: boolean): void {
  const now = performance.now();
  if (hitModel === lastHitModel.value && now - lastHitTestAt < 32) {
    return;
  }
  lastHitModel.value = hitModel;
  lastHitTestAt = now;
  emit("hitTest", { hitModel });
}

function renderFallback(timeMs = performance.now()): void {
  if (!fallbackCanvas.value) {
    return;
  }
  renderFallbackStageCanvas({
    canvas: fallbackCanvas.value,
    width: stageSize.value.width,
    height: stageSize.value.height,
    timeMs,
    mouthOpen: props.mouthOpen,
    status: props.status,
    scale: props.modelScale,
    offsetX: props.modelX,
    offsetY: props.modelY
  });
  emitModelBounds();
}

function syncStageSize(): void {
  const host = live2dHost.value;
  if (!host) {
    return;
  }
  const rect = host.getBoundingClientRect();
  const width = Math.max(1, Math.round(rect.width));
  const height = Math.max(1, Math.round(rect.height));
  if (stageSize.value.width === width && stageSize.value.height === height) {
    return;
  }
  stageSize.value = { width, height };
  renderer.value?.resize(width, height, window.devicePixelRatio || 1);
  renderFallback();
  emitModelBounds();
}

function emitModelBounds(): void {
  if (!usingFallback.value && renderer.value) {
    emit("modelBounds", renderer.value.getVisibleBounds());
    emit("modelShape", renderer.value.getVisibleShapeRects());
    return;
  }
  const fallbackShape = estimateFallbackShapeRects();
  emit("modelBounds", boundsFromShapeRects(fallbackShape));
  emit("modelShape", fallbackShape);
}

function estimateFallbackShapeRects(): Array<{ x: number; y: number; width: number; height: number }> {
  const canvas = fallbackCanvas.value;
  const context = canvas?.getContext("2d");
  if (!canvas || !context || canvas.width <= 0 || canvas.height <= 0) {
    return [];
  }
  const image = context.getImageData(0, 0, canvas.width, canvas.height).data;
  const rects: Array<{ x: number; y: number; width: number; height: number }> = [];
  for (let y = 0; y < canvas.height; y += 4) {
    let spanStart = -1;
    for (let x = 0; x < canvas.width; x += 4) {
      const hit = image[(y * canvas.width + x) * 4 + 3] >= 16;
      if (hit && spanStart < 0) {
        spanStart = x;
      }
      if ((!hit || x + 4 >= canvas.width) && spanStart >= 0) {
        const spanEnd = hit && x + 4 >= canvas.width ? x + 4 : x;
        rects.push({ x: spanStart, y, width: Math.max(1, spanEnd - spanStart + 4), height: 4 });
        spanStart = -1;
      }
    }
  }
  return rects;
}

function boundsFromShapeRects(rects: Array<{ x: number; y: number; width: number; height: number }>): { x: number; y: number; width: number; height: number } | null {
  if (rects.length === 0) {
    return null;
  }
  const minX = Math.min(...rects.map((rect) => rect.x));
  const minY = Math.min(...rects.map((rect) => rect.y));
  const maxX = Math.max(...rects.map((rect) => rect.x + rect.width));
  const maxY = Math.max(...rects.map((rect) => rect.y + rect.height));
  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
}

function startFallbackLoop(): void {
  const tick = (timeMs: number): void => {
    if (usingFallback.value) {
      renderFallback(timeMs);
    }
    frameHandle = requestAnimationFrame(tick);
  };
  frameHandle = requestAnimationFrame(tick);
}

onMounted(async () => {
  (window as typeof window & { __greyfieldStageSmoke?: { sampleModelHit(clientX: number, clientY: number): boolean } }).__greyfieldStageSmoke = {
    sampleModelHit
  };
  await nextTick();
  syncStageSize();
  if (live2dHost.value) {
    resizeObserver = new ResizeObserver(() => syncStageSize());
    resizeObserver.observe(live2dHost.value);
  }
  startFallbackLoop();
  await loadModel();
});

onBeforeUnmount(() => {
  delete (window as typeof window & { __greyfieldStageSmoke?: unknown }).__greyfieldStageSmoke;
  cancelAnimationFrame(frameHandle);
  emit("dragEnd");
  resizeObserver?.disconnect();
  driver.value?.destroy();
});

watch(() => props.modelPath, () => loadModel());
watch(transform, (value) => {
  driver.value?.setTransform(value);
  requestAnimationFrame(() => emitModelBounds());
});
watch(() => props.mouthOpen, (value) => driver.value?.setMouthOpen(value));
watch(() => props.expression, (value) => {
  if (value && driver.value && !usingFallback.value) {
    lastExpression.value = value;
    driver.value.setExpression(value);
  }
});
watch(() => props.motion, (value) => {
  if (value && driver.value && !usingFallback.value) {
    lastMotion.value = value.index === undefined ? value.group : `${value.group}:${value.index}`;
    driver.value.playMotion(value.group, value.index);
  }
});
watch(() => [props.status, props.mouthOpen, props.modelScale, props.modelX, props.modelY], () => renderFallback());
watch(() => [props.status, props.mouthOpen], () => requestAnimationFrame(() => emitModelBounds()));
</script>
