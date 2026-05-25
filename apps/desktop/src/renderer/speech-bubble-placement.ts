export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface Size {
  width: number;
  height: number;
}

export interface SpeechBubblePlacement {
  x: number;
  y: number;
  side: "left" | "right";
}

export function placeSpeechBubble(input: {
  modelBounds: Rect;
  windowBounds: Rect;
  screenBounds: Rect;
  bubbleSize: Size;
  gap?: number;
  margin?: number;
}): SpeechBubblePlacement {
  const gap = input.gap ?? 16;
  const margin = input.margin ?? 8;
  const rightLocalX = input.modelBounds.x + input.modelBounds.width + gap;
  const leftLocalX = input.modelBounds.x - input.bubbleSize.width - gap;
  const rightScreenX = input.windowBounds.x + rightLocalX;
  const screenRight = input.screenBounds.x + input.screenBounds.width - margin;
  const canUseRight = rightScreenX + input.bubbleSize.width <= screenRight;
  const rawX = canUseRight ? rightLocalX : leftLocalX;
  const side = canUseRight ? "right" : "left";

  const screenTop = input.screenBounds.y + margin;
  const screenBottom = input.screenBounds.y + input.screenBounds.height - margin;
  const rawY = input.modelBounds.y - gap;
  const minLocalY = screenTop - input.windowBounds.y;
  const maxLocalY = screenBottom - input.windowBounds.y - input.bubbleSize.height;

  return {
    x: Math.round(side === "left" ? Math.max(0, rawX) : rawX),
    y: Math.round(clamp(rawY, minLocalY, Math.max(minLocalY, maxLocalY))),
    side
  };
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
