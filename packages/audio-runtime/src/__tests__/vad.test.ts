import { describe, expect, it } from "vitest";
import { detectVoiceActivity } from "../vad";

describe("detectVoiceActivity", () => {
  it("treats silence and low noise as inactive", () => {
    const result = detectVoiceActivity(new Float32Array([0, 0.002, -0.002]), { threshold: 0.01 });

    expect(result.active).toBe(false);
    expect(result.rms).toBeGreaterThan(0);
    expect(result.peak).toBeCloseTo(0.002);
  });

  it("marks speech-like samples as active and reports rms/peak", () => {
    const result = detectVoiceActivity(new Float32Array([0.1, -0.2, 0.15, -0.05]), { threshold: 0.05 });

    expect(result.active).toBe(true);
    expect(result.rms).toBeGreaterThan(0.1);
    expect(result.peak).toBeCloseTo(0.2);
  });
});
