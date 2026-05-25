import { describe, expect, it } from "vitest";
import { calculateContainScale } from "../pixi-live2d-renderer";

describe("calculateContainScale", () => {
  it("fits a tall model inside the pet window before applying user scale", () => {
    expect(
      calculateContainScale({
        stageWidth: 420,
        stageHeight: 620,
        modelWidth: 1000,
        modelHeight: 2000,
        userScale: 1
      })
    ).toBeCloseTo(0.2852, 4);
  });

  it("keeps user scale relative to the fitted desktop-pet size", () => {
    const base = calculateContainScale({
      stageWidth: 420,
      stageHeight: 620,
      modelWidth: 1000,
      modelHeight: 2000,
      userScale: 1
    });
    const enlarged = calculateContainScale({
      stageWidth: 420,
      stageHeight: 620,
      modelWidth: 1000,
      modelHeight: 2000,
      userScale: 1.5
    });

    expect(enlarged).toBeCloseTo(base * 1.5, 4);
  });
});
