import { describe, expect, it } from "vitest";
import { createPetWindowShape } from "../pet-window-shape";

describe("pet window shape", () => {
  it("uses one stable padded model bounds rect instead of alpha stripe rects", () => {
    const rects = createPetWindowShape({
      modelBounds: { x: 100, y: 80, width: 200, height: 420 },
      fallbackShape: [
        { x: 110, y: 90, width: 12, height: 4 },
        { x: 128, y: 94, width: 44, height: 4 },
        { x: 180, y: 98, width: 90, height: 4 }
      ],
      bubbleRect: null,
      viewportWidth: 420,
      viewportHeight: 620,
      padding: 24
    });

    expect(rects).toEqual([{ x: 76, y: 56, width: 248, height: 468 }]);
  });

  it("falls back to the bounding box of alpha rects when model bounds are not available", () => {
    const rects = createPetWindowShape({
      modelBounds: null,
      fallbackShape: [
        { x: 40, y: 10, width: 20, height: 8 },
        { x: 80, y: 50, width: 10, height: 12 }
      ],
      bubbleRect: null,
      viewportWidth: 120,
      viewportHeight: 100,
      padding: 8
    });

    expect(rects).toEqual([{ x: 32, y: 2, width: 66, height: 68 }]);
  });

  it("adds and clamps the speech bubble rect independently", () => {
    const rects = createPetWindowShape({
      modelBounds: { x: 10, y: 10, width: 50, height: 50 },
      fallbackShape: [],
      bubbleRect: { x: 330, y: 590, width: 120, height: 60 },
      viewportWidth: 420,
      viewportHeight: 620,
      padding: 20
    });

    expect(rects).toEqual([
      { x: 0, y: 0, width: 80, height: 80 },
      { x: 330, y: 590, width: 90, height: 30 }
    ]);
  });
});
