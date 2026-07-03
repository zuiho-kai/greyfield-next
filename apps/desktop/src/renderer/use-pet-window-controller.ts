import { ref, type ComputedRef, type Ref } from "vue";
import { beginPetDrag, continuePetDrag, endPetDrag, reducePetWheelScale, resolvePetHitTest, type PetDragState } from "./pet-interaction";
import { createPetWindowShape } from "./pet-window-shape";
import { type Rect } from "./speech-bubble-placement";
import { type DesktopRendererState } from "./desktop-runtime-bridge";

export function usePetWindowController(params: {
  isPetWindow: boolean;
  state: Ref<DesktopRendererState>;
  bubbleShapeRect: ComputedRef<Rect | null>;
  syncState: (nextState: DesktopRendererState) => void;
  updateSettings: (patch: Partial<DesktopRendererState["settings"]>) => DesktopRendererState;
}) {
  const lastModelBounds = ref<Rect | null>(null);
  const lastModelShape = ref<Rect[]>([]);
  const dragState = ref<PetDragState>(endPetDrag({ active: false, startScreenX: 0, startScreenY: 0, startWindowX: 0, startWindowY: 0, modelScale: 1 }));
  const lastWheelScaleAt = ref(0);

  function syncPetWindowShape(): void {
    if (!params.isPetWindow || typeof window === "undefined") return;
    const rects = createPetWindowShape({
      modelBounds: lastModelBounds.value,
      fallbackShape: lastModelShape.value,
      bubbleRect: params.bubbleShapeRect.value,
      viewportWidth: window.innerWidth,
      viewportHeight: window.innerHeight
    });
    window.greyfield?.send("window:set-shape", { rects, reason: "model-mask" });
  }

  function handlePetHitTest(payload: { hitModel: boolean }): void {
    const hitTest = resolvePetHitTest({ modelPassThrough: params.state.value.window.modelPassThrough, isModelPixel: payload.hitModel });
    window.greyfield?.send("window:set-hit-test", hitTest);
  }

  function handlePetDragStart(payload: { screenX: number; screenY: number }): void {
    dragState.value = beginPetDrag({
      hitModel: true,
      locked: params.state.value.window.locked,
      modelPassThrough: params.state.value.window.modelPassThrough,
      screenX: payload.screenX,
      screenY: payload.screenY,
      windowX: window.screenX,
      windowY: window.screenY,
      modelScale: params.state.value.settings.modelScale
    });
    if (dragState.value.active) window.greyfield?.send("window:drag-start", payload);
  }

  function handlePetDragMove(payload: { screenX: number; screenY: number }): void {
    if (!dragState.value.active) return;
    continuePetDrag(dragState.value, payload);
    window.greyfield?.send("window:drag-move", payload);
  }

  function handlePetDragEnd(): void {
    if (!dragState.value.active) return;
    dragState.value = endPetDrag(dragState.value);
    window.greyfield?.send("window:drag-end", {});
  }

  function handlePetWheel(payload: { deltaY: number; pointerX: number; pointerY: number; viewportWidth: number; viewportHeight: number }): void {
    const result = reducePetWheelScale({
      currentScale: params.state.value.settings.modelScale,
      currentX: params.state.value.settings.modelX,
      currentY: params.state.value.settings.modelY,
      deltaY: payload.deltaY,
      hitModel: true,
      dragging: dragState.value.active,
      modelPassThrough: params.state.value.window.modelPassThrough,
      pointerX: payload.pointerX,
      pointerY: payload.pointerY,
      viewportWidth: payload.viewportWidth,
      viewportHeight: payload.viewportHeight,
      modelBounds: lastModelBounds.value,
      nowMs: performance.now(),
      lastScaleAtMs: lastWheelScaleAt.value
    });
    lastWheelScaleAt.value = result.lastScaleAtMs;
    if (result.changed) params.syncState(params.updateSettings({ modelScale: result.scale, modelX: result.x, modelY: result.y }));
  }

  function handlePetContextMenu(payload: { screenX: number; screenY: number }): void {
    if (!params.state.value.window.modelPassThrough) window.greyfield?.send("window:show-pet-menu", payload);
  }

  function updateModelBounds(bounds: Rect | null): void {
    lastModelBounds.value = bounds;
  }

  function updateModelShape(rects: Rect[]): void {
    lastModelShape.value = rects;
  }

  return {
    dragState,
    lastModelBounds,
    lastModelShape,
    handlePetHitTest,
    handlePetDragStart,
    handlePetDragMove,
    handlePetDragEnd,
    handlePetWheel,
    handlePetContextMenu,
    updateModelBounds,
    updateModelShape,
    syncPetWindowShape
  };
}
