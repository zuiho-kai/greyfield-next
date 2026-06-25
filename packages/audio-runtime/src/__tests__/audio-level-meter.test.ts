import { describe, expect, it } from "vitest";
import { createMouthOpenTimelineFromPcm, measureAudioLevel, mapAudioLevelToMouthOpen } from "../audio-level-meter";

describe("audio level meter", () => {
  it("measures unsigned byte audio around the 128 midpoint", () => {
    const quiet = measureAudioLevel(new Uint8Array([128, 129, 127, 128]));
    const loud = measureAudioLevel(new Uint8Array([0, 255, 0, 255]));

    expect(quiet.rms).toBeLessThan(0.01);
    expect(loud.rms).toBeGreaterThan(0.9);
  });

  it("maps level to bounded mouth-open values with a noise gate", () => {
    expect(mapAudioLevelToMouthOpen({ rms: 0.02, peak: 0.04 })).toBe(0);
    expect(mapAudioLevelToMouthOpen({ rms: 0.5, peak: 0.8 })).toBeGreaterThan(0.5);
    expect(mapAudioLevelToMouthOpen({ rms: 2, peak: 2 })).toBe(1);
  });

  it("builds a mouth-open timeline from decoded PCM frames", () => {
    const timeline = createMouthOpenTimelineFromPcm(new Float32Array([0, 0, 0.8, -0.8, 0.9, -0.9, 0, 0]), {
      sampleRate: 4,
      frameMs: 500
    });

    expect(timeline[0]).toBe(0);
    expect(Math.max(...timeline)).toBeGreaterThan(0.5);
    expect(timeline.at(-1)).toBe(0);
  });
});
