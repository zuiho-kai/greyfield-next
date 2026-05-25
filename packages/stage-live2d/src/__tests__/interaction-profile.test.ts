import { describe, expect, it } from "vitest";
import { createDefaultInteractionProfile, resolveEmotionReaction, resolveTouchReaction } from "../interaction-profile";

describe("DigitalMate-style interaction profile", () => {
  it("provides configurable touch reactions instead of hardcoded component behavior", () => {
    const profile = createDefaultInteractionProfile();

    expect(resolveTouchReaction(profile, { x: 210, y: 120 })).toMatchObject({
      areaId: "head",
      motion: { group: "Use", index: 0 },
      expression: "smile"
    });
    expect(resolveTouchReaction(profile, { x: 210, y: 360 })).toMatchObject({
      areaId: "body",
      motion: { group: "Idle", index: 0 }
    });
  });

  it("maps runtime emotions to motion and expression reactions", () => {
    const profile = createDefaultInteractionProfile();

    expect(resolveEmotionReaction(profile, "speaking")).toEqual({
      motion: { group: "Use", index: 0 },
      expression: "smile"
    });
    expect(resolveEmotionReaction(profile, "missing")).toEqual({
      motion: { group: "Idle", index: 0 },
      expression: "default"
    });
  });
});
