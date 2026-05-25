export type PetHitTestReason = "transparent-area" | "model-pass-through" | "model-hit";

export interface PetHitTestState {
  passthrough: boolean;
  reason: PetHitTestReason;
}

export interface PetDragState {
  active: boolean;
  startScreenX: number;
  startScreenY: number;
  startWindowX: number;
  startWindowY: number;
  modelScale: number;
}

export interface BeginPetDragInput {
  hitModel: boolean;
  locked: boolean;
  modelPassThrough: boolean;
  screenX: number;
  screenY: number;
  windowX: number;
  windowY: number;
  modelScale: number;
}

export interface PetWheelScaleInput {
  currentScale: number;
  currentX: number;
  currentY: number;
  deltaY: number;
  hitModel: boolean;
  dragging: boolean;
  modelPassThrough: boolean;
  pointerX: number;
  pointerY: number;
  viewportWidth: number;
  viewportHeight: number;
  modelBounds?: {
    x: number;
    y: number;
    width: number;
    height: number;
  } | null;
  nowMs: number;
  lastScaleAtMs: number;
}

export interface PetWheelScaleResult {
  scale: number;
  x: number;
  y: number;
  changed: boolean;
  lastScaleAtMs: number;
}

export const PET_SCALE_MIN = 0.4;
export const PET_SCALE_MAX = 2;
export const PET_WHEEL_THROTTLE_MS = 50;

export function resolvePetHitTest(input: { modelPassThrough: boolean; isModelPixel: boolean }): PetHitTestState {
  if (input.modelPassThrough && input.isModelPixel) {
    return { passthrough: true, reason: "model-pass-through" };
  }
  if (input.isModelPixel) {
    return { passthrough: false, reason: "model-hit" };
  }
  return { passthrough: true, reason: "transparent-area" };
}

export function beginPetDrag(input: BeginPetDragInput): PetDragState {
  if (!input.hitModel || input.locked || input.modelPassThrough) {
    return inactiveDrag(input.modelScale);
  }
  return {
    active: true,
    startScreenX: input.screenX,
    startScreenY: input.screenY,
    startWindowX: input.windowX,
    startWindowY: input.windowY,
    modelScale: input.modelScale
  };
}

export function continuePetDrag(state: PetDragState, point: { screenX: number; screenY: number }): { x: number; y: number; modelScale: number } {
  return {
    x: Math.round(state.startWindowX + point.screenX - state.startScreenX),
    y: Math.round(state.startWindowY + point.screenY - state.startScreenY),
    modelScale: state.modelScale
  };
}

export function endPetDrag(state: PetDragState): PetDragState {
  return { ...state, active: false };
}

export function reducePetWheelScale(input: PetWheelScaleInput): PetWheelScaleResult {
  if (!input.hitModel || input.dragging || input.modelPassThrough) {
    return { scale: input.currentScale, x: input.currentX, y: input.currentY, changed: false, lastScaleAtMs: input.lastScaleAtMs };
  }
  if (input.nowMs - input.lastScaleAtMs < PET_WHEEL_THROTTLE_MS) {
    return { scale: input.currentScale, x: input.currentX, y: input.currentY, changed: false, lastScaleAtMs: input.lastScaleAtMs };
  }

  const direction = input.deltaY < 0 ? 1 : -1;
  const step = Math.min(0.12, Math.max(0.02, Math.abs(input.deltaY) / 2000));
  const scale = clampPetScale(input.currentScale + direction * step);
  const ratio = scale / input.currentScale;
  const centerX = input.viewportWidth / 2;
  const centerY = input.viewportHeight / 2;
  const adjusted = keepZoomedFocusVisible({
    x: Math.round(input.currentX + (1 - ratio) * (input.pointerX - centerX - input.currentX)),
    y: Math.round(input.currentY + (1 - ratio) * (input.pointerY - centerY - input.currentY)),
    ratio,
    input
  });
  return {
    scale,
    x: adjusted.x,
    y: adjusted.y,
    changed: true,
    lastScaleAtMs: input.nowMs
  };
}

export function clampPetScale(value: number): number {
  if (!Number.isFinite(value)) {
    return 1;
  }
  return Math.round(Math.min(PET_SCALE_MAX, Math.max(PET_SCALE_MIN, value)) * 100) / 100;
}

function inactiveDrag(modelScale: number): PetDragState {
  return {
    active: false,
    startScreenX: 0,
    startScreenY: 0,
    startWindowX: 0,
    startWindowY: 0,
    modelScale
  };
}

function keepZoomedFocusVisible(input: {
  x: number;
  y: number;
  ratio: number;
  input: PetWheelScaleInput;
}): { x: number; y: number } {
  const bounds = input.input.modelBounds;
  if (!bounds) {
    return { x: input.x, y: input.y };
  }

  const centerX = input.input.viewportWidth / 2;
  const centerY = input.input.viewportHeight / 2;
  const nextTop = centerY + input.y + input.ratio * (bounds.y - centerY - input.input.currentY);
  const nextBottom =
    centerY + input.y + input.ratio * (bounds.y + bounds.height - centerY - input.input.currentY);
  const margin = 8;
  let y = input.y;
  if (input.input.pointerY < centerY && nextTop < margin) {
    y += Math.round(margin - nextTop);
  } else if (input.input.pointerY > centerY && nextBottom > input.input.viewportHeight - margin) {
    y -= Math.round(nextBottom - (input.input.viewportHeight - margin));
  }
  return { x: input.x, y };
}
