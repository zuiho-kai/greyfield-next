import { describe, expect, it } from "vitest";
import { isPlayableAudioHeader } from "../real-tts-audio-header";

describe("isPlayableAudioHeader", () => {
  it("accepts common playable audio headers", () => {
    expect(isPlayableAudioHeader("4944330300000000")).toBe(true);
    expect(isPlayableAudioHeader("ffe3000000000000")).toBe(true);
    expect(isPlayableAudioHeader("fffb000000000000")).toBe(true);
    expect(isPlayableAudioHeader("52494646aabbccdd")).toBe(true);
    expect(isPlayableAudioHeader("4f67675300000000")).toBe(true);
  });

  it("rejects invalid MP3 frame sync bytes", () => {
    expect(isPlayableAudioHeader("ff00000000000000")).toBe(false);
    expect(isPlayableAudioHeader("0000000000000000")).toBe(false);
  });
});
