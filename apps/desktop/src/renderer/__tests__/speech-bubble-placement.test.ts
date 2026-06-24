import { describe, expect, it } from "vitest";
import { placeSpeechBubble } from "../speech-bubble-placement";

describe("placeSpeechBubble", () => {
  const bubble = { width: 180, height: 72 };

  it("places the bubble in a centered top slot when screen space allows", () => {
    expect(
      placeSpeechBubble({
        modelBounds: { x: 12, y: 180, width: 120, height: 320 },
        windowBounds: { x: 200, y: 120, width: 420, height: 620 },
        screenBounds: { x: 0, y: 0, width: 1440, height: 900 },
        bubbleSize: bubble
      })
    ).toMatchObject({ side: "top", x: 120, y: 8 });
  });

  it("keeps the same top slot when the model is centered", () => {
    expect(
      placeSpeechBubble({
        modelBounds: { x: 150, y: 120, width: 120, height: 320 },
        windowBounds: { x: 200, y: 120, width: 420, height: 620 },
        screenBounds: { x: 0, y: 0, width: 1440, height: 900 },
        bubbleSize: bubble
      })
    ).toMatchObject({ side: "top", x: 120, y: 8 });
  });

  it("keeps a stable window-relative position when the model moves", () => {
    const first = placeSpeechBubble({
      modelBounds: { x: 12, y: 180, width: 120, height: 320 },
      windowBounds: { x: 200, y: 120, width: 420, height: 620 },
      screenBounds: { x: 0, y: 0, width: 1440, height: 900 },
      bubbleSize: bubble
    });
    const second = placeSpeechBubble({
      modelBounds: { x: 44, y: 230, width: 120, height: 320 },
      windowBounds: { x: 200, y: 120, width: 420, height: 620 },
      screenBounds: { x: 0, y: 0, width: 1440, height: 900 },
      bubbleSize: bubble
    });

    expect(second).toEqual(first);
  });

  it("keeps the bubble inside the right desktop edge", () => {
    expect(
      placeSpeechBubble({
        modelBounds: { x: 120, y: 180, width: 180, height: 320 },
        windowBounds: { x: 1040, y: 120, width: 420, height: 620 },
        screenBounds: { x: 0, y: 0, width: 1440, height: 900 },
        bubbleSize: bubble
      })
    ).toMatchObject({ side: "top", x: 120, y: 8 });
  });

  it("keeps the bubble below the top edge when the model reaches the top", () => {
    expect(
      placeSpeechBubble({
        modelBounds: { x: 100, y: 4, width: 160, height: 320 },
        windowBounds: { x: 200, y: 0, width: 420, height: 620 },
        screenBounds: { x: 0, y: 0, width: 1440, height: 900 },
        bubbleSize: bubble
      }).y
    ).toBe(8);
  });

  it("keeps the bubble fully inside the pet window viewport", () => {
    const placement = placeSpeechBubble({
      modelBounds: { x: 120, y: 180, width: 180, height: 320 },
      windowBounds: { x: 200, y: 120, width: 420, height: 620 },
      screenBounds: { x: 0, y: 0, width: 1440, height: 900 },
      bubbleSize: { width: 220, height: 124 }
    });

    expect(placement.x).toBeGreaterThanOrEqual(8);
    expect(placement.x + 220).toBeLessThanOrEqual(412);
  });

  it("clamps vertically inside the pet window viewport even when the screen is taller", () => {
    const placement = placeSpeechBubble({
      modelBounds: { x: 90, y: 590, width: 160, height: 80 },
      windowBounds: { x: 200, y: 120, width: 420, height: 620 },
      screenBounds: { x: 0, y: 0, width: 1440, height: 1200 },
      bubbleSize: { width: 220, height: 124 }
    });

    expect(placement.y + 124).toBeLessThanOrEqual(612);
  });
});
