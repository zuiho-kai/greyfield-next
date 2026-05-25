import { describe, expect, it } from "vitest";
import { placeSpeechBubble } from "../speech-bubble-placement";

describe("placeSpeechBubble", () => {
  const bubble = { width: 180, height: 72 };

  it("places the bubble at the model upper right when screen space allows", () => {
    expect(
      placeSpeechBubble({
        modelBounds: { x: 100, y: 180, width: 160, height: 320 },
        windowBounds: { x: 200, y: 120, width: 420, height: 620 },
        screenBounds: { x: 0, y: 0, width: 1440, height: 900 },
        bubbleSize: bubble
      })
    ).toMatchObject({ side: "right", x: 276, y: 164 });
  });

  it("flips to the upper left when the model is near the right desktop edge", () => {
    expect(
      placeSpeechBubble({
        modelBounds: { x: 120, y: 180, width: 180, height: 320 },
        windowBounds: { x: 1040, y: 120, width: 420, height: 620 },
        screenBounds: { x: 0, y: 0, width: 1440, height: 900 },
        bubbleSize: bubble
      })
    ).toMatchObject({ side: "left", x: 0, y: 164 });
  });

  it("clamps vertically inside the screen", () => {
    expect(
      placeSpeechBubble({
        modelBounds: { x: 100, y: 4, width: 160, height: 320 },
        windowBounds: { x: 200, y: 0, width: 420, height: 620 },
        screenBounds: { x: 0, y: 0, width: 1440, height: 900 },
        bubbleSize: bubble
      }).y
    ).toBe(8);
  });
});
