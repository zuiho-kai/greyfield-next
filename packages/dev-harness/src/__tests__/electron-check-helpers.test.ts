import { describe, expect, it } from "vitest";
import { chooseStagePointFromAlpha } from "../electron-check-helpers";

describe("electron check helpers", () => {
  it("chooses the strongest model pixel instead of the first animated edge pixel", () => {
    const result = chooseStagePointFromAlpha({
      width: 16,
      height: 1,
      wantHit: true,
      alphaAt: (x) => [20, 255, 180, 0][x / 4] ?? 0,
      toPoint: (x, y) => ({ x: x * 10, y: y * 10 })
    });

    expect(result).toEqual({ x: 40, y: 0 });
  });

  it("keeps transparent point selection away from model pixels", () => {
    const result = chooseStagePointFromAlpha({
      width: 16,
      height: 1,
      wantHit: false,
      alphaAt: (x) => [255, 180, 20, 0][x / 4] ?? 0,
      toPoint: (x, y) => ({ x: x * 10, y: y * 10 })
    });

    expect(result).toEqual({ x: 120, y: 0 });
  });
});
