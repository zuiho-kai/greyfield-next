import { describe, expect, it } from "vitest";
import { detectObservationFrameChange } from "../vision-attachments";

describe("vision attachment helpers", () => {
  it("detects frame changes with the shared hash-then-data-url signature policy", () => {
    expect(detectObservationFrameChange(undefined, { id: "a", dataUrl: "data:a", hash: "same" })).toEqual({
      changed: true,
      signature: "same"
    });
    expect(detectObservationFrameChange("same", { id: "b", dataUrl: "data:b", hash: "same" })).toEqual({
      changed: false,
      signature: "same"
    });
    expect(detectObservationFrameChange("same", { id: "c", dataUrl: "data:c" })).toEqual({
      changed: true,
      signature: "data:c"
    });
  });
});
