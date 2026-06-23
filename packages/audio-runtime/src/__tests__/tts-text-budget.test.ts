import { describe, expect, it } from "vitest";
import { takeTtsTextWithinBudget } from "../tts-text-budget";

describe("TTS text budget", () => {
  it("normalizes speech text and tracks used characters", () => {
    expect(takeTtsTextWithinBudget("  First   sentence.  ", 0, 80)).toEqual({
      text: "First sentence.",
      usedCharacters: 15,
      exhausted: false
    });
  });

  it("truncates long speech text instead of allowing unbounded playback", () => {
    expect(takeTtsTextWithinBudget("This sentence is too long to read fully.", 0, 12)).toEqual({
      text: "This senten…",
      usedCharacters: 12,
      exhausted: true
    });
  });
});
