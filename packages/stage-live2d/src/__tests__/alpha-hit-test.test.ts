import { describe, expect, it } from "vitest";
import { isAlphaHit, mapClientPointToCanvasPixel } from "../alpha-hit-test";

describe("alpha hit test", () => {
  it("treats only visible pixels as model hits", () => {
    expect(isAlphaHit(0)).toBe(false);
    expect(isAlphaHit(15)).toBe(false);
    expect(isAlphaHit(16)).toBe(true);
    expect(isAlphaHit(255)).toBe(true);
  });

  it("maps client coordinates to backing canvas pixels", () => {
    expect(
      mapClientPointToCanvasPixel({
        clientX: 150,
        clientY: 260,
        rect: { left: 100, top: 200, width: 200, height: 100 },
        canvasWidth: 400,
        canvasHeight: 200
      })
    ).toEqual({ x: 100, y: 120 });
  });
});
