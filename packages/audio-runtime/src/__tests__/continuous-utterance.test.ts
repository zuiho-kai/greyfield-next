import { describe, expect, it, vi } from "vitest";
import { ContinuousUtterance, mergeUtteranceWaves } from "../continuous-utterance";

const frame = (value: number) => {
  const data = new Uint8Array(3200); const view = new DataView(data.buffer);
  for (let i = 0; i < 1600; i++) view.setInt16(i * 2, value, true);
  return data;
};
describe("continuous microphone utterances", () => {
  it("keeps the leading speech frame, endpoints automatically and captures the next interruption", () => {
    const start = vi.fn(); const end = vi.fn(); const segmenter = new ContinuousUtterance(start, end);
    segmenter.push(frame(0), 16000);
    segmenter.push(frame(10000), 16000);
    expect(start).toHaveBeenCalledTimes(1);
    for (let i = 0; i < 5; i++) segmenter.push(frame(0), 16000);
    expect(end).toHaveBeenCalledTimes(1);
    const wav = end.mock.calls[0]![0] as Uint8Array;
    expect(String.fromCharCode(...wav.slice(0, 4))).toBe("RIFF");
    expect(new DataView(wav.buffer).getInt16(44 + 3200, true)).toBe(10000);
    segmenter.push(frame(10000), 16000);
    for (let i = 0; i < 5; i++) segmenter.push(frame(0), 16000);
    expect(start).toHaveBeenCalledTimes(2); expect(end).toHaveBeenCalledTimes(2);
    const combined = mergeUtteranceWaves(end.mock.calls.map((call) => call[0]));
    expect(combined.length).toBe(end.mock.calls.reduce((sum, call) => sum + call[0].length - 44, 44));
    expect(new DataView(combined.buffer).getUint32(40, true)).toBe(combined.length - 44);
  });
  it("drops unfinished speech when the microphone is closed", () => {
    const end = vi.fn(); const segmenter = new ContinuousUtterance(vi.fn(), end);
    segmenter.push(frame(10000), 16000); segmenter.reset();
    for (let i = 0; i < 20; i++) segmenter.push(frame(0), 16000);
    expect(end).not.toHaveBeenCalled();
  });
});
