import { describe, expect, it } from "vitest";
import { measureAudioLevel, mapAudioLevelToMouthOpen } from "../audio-level-meter";

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
});
