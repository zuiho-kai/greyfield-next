import { describe, expect, it } from "vitest";
import { buildFallbackStageFrame, fallbackFrameSignature } from "../fallback-stage-frame";

describe("fallback stage frame builder", () => {
  it("builds a non-empty frame with body, face, and mouth commands", () => {
    const frame = buildFallbackStageFrame({
      width: 420,
      height: 620,
      timeMs: 0,
      mouthOpen: 0.5,
      status: "speaking"
    });

    expect(frame.commands.length).toBeGreaterThan(6);
    expect(frame.commands.map((command) => command.kind)).toEqual(
      expect.arrayContaining(["ellipse", "circle", "mouth"])
    );
    expect(frame.paintedArea).toBeGreaterThan(420 * 620 * 0.1);
  });

  it("changes frame signature as idle animation and mouth-open values change", () => {
    const closed = buildFallbackStageFrame({ width: 420, height: 620, timeMs: 0, mouthOpen: 0, status: "idle" });
    const open = buildFallbackStageFrame({ width: 420, height: 620, timeMs: 160, mouthOpen: 0.9, status: "speaking" });

    expect(fallbackFrameSignature(closed)).not.toBe(fallbackFrameSignature(open));
  });

  it("applies model scale and offset to the body frame", () => {
    const normal = buildFallbackStageFrame({ width: 420, height: 620, timeMs: 0, mouthOpen: 0, status: "idle" });
    const shifted = buildFallbackStageFrame({
      width: 420,
      height: 620,
      timeMs: 0,
      mouthOpen: 0,
      status: "idle",
      scale: 1.4,
      offsetX: 20,
      offsetY: -10
    });

    expect(shifted.paintedArea).toBeGreaterThan(normal.paintedArea);
    expect(fallbackFrameSignature(shifted)).not.toBe(fallbackFrameSignature(normal));
  });
});
