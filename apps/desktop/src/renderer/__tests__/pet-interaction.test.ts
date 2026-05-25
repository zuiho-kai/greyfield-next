import { describe, expect, it } from "vitest";
import {
  beginPetDrag,
  clampPetScale,
  continuePetDrag,
  endPetDrag,
  reducePetWheelScale,
  resolvePetHitTest
} from "../pet-interaction";

describe("pet interaction", () => {
  it("passes through transparent pixels and keeps model pixels interactive by default", () => {
    expect(resolvePetHitTest({ modelPassThrough: false, isModelPixel: false })).toEqual({
      passthrough: true,
      reason: "transparent-area"
    });
    expect(resolvePetHitTest({ modelPassThrough: false, isModelPixel: true })).toEqual({
      passthrough: false,
      reason: "model-hit"
    });
  });

  it("passes through model pixels when model pass-through is enabled", () => {
    expect(resolvePetHitTest({ modelPassThrough: true, isModelPixel: true })).toEqual({
      passthrough: true,
      reason: "model-pass-through"
    });
  });

  it("moves the window during model drag without changing model scale", () => {
    const drag = beginPetDrag({
      hitModel: true,
      locked: false,
      modelPassThrough: false,
      screenX: 100,
      screenY: 200,
      windowX: 40,
      windowY: 70,
      modelScale: 1.25
    });

    expect(drag.active).toBe(true);
    expect(continuePetDrag(drag, { screenX: 130, screenY: 260 })).toEqual({
      x: 70,
      y: 130,
      modelScale: 1.25
    });
    expect(endPetDrag(drag).active).toBe(false);
  });

  it("does not begin dragging from transparent, locked, or pass-through states", () => {
    const base = { screenX: 0, screenY: 0, windowX: 0, windowY: 0, modelScale: 1 };

    expect(beginPetDrag({ ...base, hitModel: false, locked: false, modelPassThrough: false }).active).toBe(false);
    expect(beginPetDrag({ ...base, hitModel: true, locked: true, modelPassThrough: false }).active).toBe(false);
    expect(beginPetDrag({ ...base, hitModel: true, locked: false, modelPassThrough: true }).active).toBe(false);
  });

  it("clamps and throttles wheel scale and ignores wheel while dragging or off model", () => {
    expect(clampPetScale(0.1)).toBe(0.4);
    expect(clampPetScale(3)).toBe(2);

    const first = reducePetWheelScale({
      currentScale: 1,
      currentX: 0,
      currentY: 0,
      deltaY: -120,
      hitModel: true,
      dragging: false,
      modelPassThrough: false,
      pointerX: 210,
      pointerY: 310,
      viewportWidth: 420,
      viewportHeight: 620,
      nowMs: 100,
      lastScaleAtMs: 0
    });
    expect(first).toEqual({ scale: 1.06, x: 0, y: 0, changed: true, lastScaleAtMs: 100 });

    expect(
      reducePetWheelScale({ currentScale: first.scale, currentX: first.x, currentY: first.y, deltaY: -120, hitModel: true, dragging: false, modelPassThrough: false, pointerX: 210, pointerY: 310, viewportWidth: 420, viewportHeight: 620, nowMs: 120, lastScaleAtMs: first.lastScaleAtMs })
    ).toEqual({ scale: 1.06, x: 0, y: 0, changed: false, lastScaleAtMs: 100 });

    expect(
      reducePetWheelScale({ currentScale: 1, currentX: 0, currentY: 0, deltaY: -120, hitModel: false, dragging: false, modelPassThrough: false, pointerX: 210, pointerY: 310, viewportWidth: 420, viewportHeight: 620, nowMs: 200, lastScaleAtMs: 0 })
    ).toEqual({ scale: 1, x: 0, y: 0, changed: false, lastScaleAtMs: 0 });
    expect(
      reducePetWheelScale({ currentScale: 1, currentX: 0, currentY: 0, deltaY: -120, hitModel: true, dragging: true, modelPassThrough: false, pointerX: 210, pointerY: 310, viewportWidth: 420, viewportHeight: 620, nowMs: 200, lastScaleAtMs: 0 })
    ).toEqual({ scale: 1, x: 0, y: 0, changed: false, lastScaleAtMs: 0 });
  });

  it("anchors wheel zoom around the mouse position instead of the stage center", () => {
    const result = reducePetWheelScale({
      currentScale: 1,
      currentX: 0,
      currentY: 0,
      deltaY: -240,
      hitModel: true,
      dragging: false,
      modelPassThrough: false,
      pointerX: 210,
      pointerY: 120,
      viewportWidth: 420,
      viewportHeight: 620,
      nowMs: 100,
      lastScaleAtMs: 0
    });

    expect(result.scale).toBe(1.12);
    expect(result.x).toBe(0);
    expect(result.y).toBe(23);
  });

  it("nudges anchored zoom down when zooming the head would clip the top of the model", () => {
    const result = reducePetWheelScale({
      currentScale: 1,
      currentX: 0,
      currentY: 0,
      deltaY: -240,
      hitModel: true,
      dragging: false,
      modelPassThrough: false,
      pointerX: 210,
      pointerY: 120,
      viewportWidth: 420,
      viewportHeight: 620,
      modelBounds: { x: 100, y: 0, width: 220, height: 620 },
      nowMs: 100,
      lastScaleAtMs: 0
    });

    expect(result.scale).toBe(1.12);
    expect(result.y).toBe(45);
  });
});
