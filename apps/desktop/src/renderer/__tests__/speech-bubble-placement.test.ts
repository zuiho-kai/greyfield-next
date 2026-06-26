import { describe, expect, it } from "vitest";
import { placeSpeechBubble } from "../speech-bubble-placement";

describe("placeSpeechBubble", () => {
  const bubble = { width: 180, height: 72 };

  it("places the bubble beside the model instead of covering the face", () => {
    expect(
      placeSpeechBubble({
        modelBounds: { x: 12, y: 180, width: 120, height: 320 },
        windowBounds: { x: 200, y: 120, width: 420, height: 620 },
        screenBounds: { x: 0, y: 0, width: 1440, height: 900 },
        bubbleSize: bubble
      })
    ).toMatchObject({ side: "right", x: 148, y: 231 });
  });

  it("uses the top subtitle slot when both sides are too cramped", () => {
    expect(
      placeSpeechBubble({
        modelBounds: { x: 150, y: 120, width: 120, height: 320 },
        windowBounds: { x: 200, y: 120, width: 420, height: 620 },
        screenBounds: { x: 0, y: 0, width: 1440, height: 900 },
        bubbleSize: bubble
      })
    ).toMatchObject({ side: "top", x: 120, y: 32 });
  });

  it("keeps the bubble near the model when the model moves", () => {
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

    expect(second.x).toBeGreaterThan(first.x);
    expect(second.y).toBeGreaterThan(first.y);
  });

  it("keeps the bubble inside the right desktop edge", () => {
    expect(
      placeSpeechBubble({
        modelBounds: { x: 120, y: 180, width: 180, height: 320 },
        windowBounds: { x: 1040, y: 120, width: 420, height: 620 },
        screenBounds: { x: 0, y: 0, width: 1440, height: 900 },
        bubbleSize: bubble
      })
    ).toMatchObject({ side: "top", x: 120, y: 92 });
  });

  it("keeps the bubble below the top edge when the model reaches the top", () => {
    expect(
      placeSpeechBubble({
        modelBounds: { x: 100, y: 4, width: 160, height: 320 },
        windowBounds: { x: 200, y: 0, width: 420, height: 620 },
        screenBounds: { x: 0, y: 0, width: 1440, height: 900 },
        bubbleSize: bubble
      }).y
    ).toBe(340);
  });

  it("uses a top subtitle when side slots are cramped and the top is clear", () => {
    expect(
      placeSpeechBubble({
        modelBounds: { x: 110, y: 90, width: 200, height: 320 },
        windowBounds: { x: 200, y: 120, width: 420, height: 620 },
        screenBounds: { x: 0, y: 0, width: 1440, height: 900 },
        bubbleSize: { width: 260, height: 72 }
      })
    ).toMatchObject({ side: "top", x: 80, y: 8 });
  });

  it("uses the visible model shape to avoid covering rendered pixels", () => {
    expect(
      placeSpeechBubble({
        modelBounds: { x: 100, y: 40, width: 220, height: 400 },
        modelShape: [{ x: 250, y: 40, width: 40, height: 400 }],
        windowBounds: { x: 200, y: 120, width: 420, height: 620 },
        screenBounds: { x: 0, y: 0, width: 1440, height: 900 },
        bubbleSize: { width: 196, height: 78 }
      })
    ).toMatchObject({ side: "left", x: 8, y: 104 });
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
