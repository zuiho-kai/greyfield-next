import { describe, expect, it } from "vitest";
import { detectObservationFrameChange } from "../vision-attachments";

describe("vision attachment helpers", () => {
  it("detects frame changes with the shared hash-then-data-url signature policy", () => {
    expect(detectObservationFrameChange(undefined, { id: "a", dataUrl: "data:a", hash: "same" })).toEqual({
      changed: true,
      signature: "same",
      score: 100
    });
    expect(detectObservationFrameChange("same", { id: "b", dataUrl: "data:b", hash: "same" })).toEqual({
      changed: false,
      signature: "same",
      score: 0
    });
    expect(detectObservationFrameChange("same", { id: "c", dataUrl: "data:c" })).toEqual({
      changed: true,
      signature: "data:c",
      score: 100
    });
  });

  it("uses frame change scores when a threshold is provided", () => {
    expect(detectObservationFrameChange("old", { id: "a", dataUrl: "data:a", hash: "new", changeScore: 4 }, { threshold: 5 })).toEqual({
      changed: false,
      signature: "new",
      score: 4
    });
    expect(detectObservationFrameChange("old", { id: "b", dataUrl: "data:b", hash: "new", changeScore: 8 }, { threshold: 5 })).toEqual({
      changed: true,
      signature: "new",
      score: 8
    });
  });
});
