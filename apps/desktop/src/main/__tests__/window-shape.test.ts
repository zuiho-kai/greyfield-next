import { describe, expect, it } from "vitest";
import { expandShapeRects, sanitizeShapeRects } from "../window-shape";

describe("sanitizeShapeRects", () => {
  it("clamps shape rects inside the current pet window bounds", () => {
    expect(
      sanitizeShapeRects(
        [
          { x: -4, y: 10, width: 30, height: 20 },
          { x: 390, y: 600, width: 80, height: 80 }
        ],
        { width: 420, height: 620 }
      )
    ).toEqual([
      { x: 0, y: 10, width: 26, height: 20 },
      { x: 390, y: 600, width: 30, height: 20 }
    ]);
  });

  it("drops shape rects that are completely outside the window", () => {
    expect(
      sanitizeShapeRects(
        [
          { x: 440, y: 0, width: 20, height: 20 },
          { x: 12, y: 12, width: 6, height: 6 }
        ],
        { width: 420, height: 620 }
      )
    ).toEqual([{ x: 12, y: 12, width: 6, height: 6 }]);
  });

  it("expands shape rects with padding while staying inside bounds", () => {
    expect(expandShapeRects([{ x: 4, y: 6, width: 10, height: 12 }], { width: 30, height: 30 }, 8)).toEqual([
      { x: 0, y: 0, width: 22, height: 26 }
    ]);
  });
});
