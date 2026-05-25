import { describe, expect, it } from "vitest";
import {
  mapExpression,
  mapMotion,
  mapVolumeToMouthOpen,
  resolveTouchArea,
  type TouchArea
} from "../stage-config";

describe("stage config mappings", () => {
  it("maps runtime expression states to model expression ids with a neutral fallback", () => {
    const expressions = {
      neutral: "exp_default",
      thinking: "exp_think",
      speaking: "exp_smile"
    };

    expect(mapExpression(expressions, "speaking")).toBe("exp_smile");
    expect(mapExpression(expressions, "missing")).toBe("exp_default");
  });

  it("maps named motions to model motion groups and optional indexes", () => {
    const motions = {
      idle: { group: "Idle" },
      tapHead: { group: "TapHead", index: 2 }
    };

    expect(mapMotion(motions, "tapHead")).toEqual({ group: "TapHead", index: 2 });
    expect(mapMotion(motions, "missing")).toEqual({ group: "Idle" });
  });

  it("resolves the topmost touch area containing a point", () => {
    const areas: TouchArea[] = [
      { id: "body", x: 0, y: 0, width: 300, height: 500, action: { type: "motion", id: "tapBody" } },
      { id: "head", x: 70, y: 20, width: 160, height: 120, action: { type: "expression", id: "happy" } }
    ];

    expect(resolveTouchArea(areas, { x: 120, y: 70 })?.id).toBe("head");
    expect(resolveTouchArea(areas, { x: 10, y: 300 })?.id).toBe("body");
    expect(resolveTouchArea(areas, { x: 400, y: 300 })).toBeUndefined();
  });

  it("maps audio volume to stable mouth-open values", () => {
    expect(mapVolumeToMouthOpen(-1)).toBe(0);
    expect(mapVolumeToMouthOpen(0.05)).toBe(0);
    expect(mapVolumeToMouthOpen(0.4)).toBeGreaterThan(0.55);
    expect(mapVolumeToMouthOpen(2)).toBe(1);
  });
});
