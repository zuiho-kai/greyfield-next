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
  const screenLeft = input.screenBounds.x + margin;
  const rightScreenX = input.windowBounds.x + rightLocalX;
  const screenRight = input.screenBounds.x + input.screenBounds.width - margin;
  const minLocalX = Math.max(margin, screenLeft - input.windowBounds.x);
  const maxLocalX = Math.min(
    input.windowBounds.width - input.bubbleSize.width - margin,
    screenRight - input.windowBounds.x - input.bubbleSize.width
  );
  const safeMaxLocalX = Math.max(minLocalX, maxLocalX);
  const canUseRight = rightLocalX >= minLocalX && rightScreenX + input.bubbleSize.width <= screenRight && rightLocalX <= safeMaxLocalX;
  const canUseLeft = leftLocalX >= minLocalX && leftLocalX <= safeMaxLocalX;
  const rawX = canUseRight ? rightLocalX : leftLocalX;
  const side = canUseRight ? "right" : canUseLeft || leftLocalX < rightLocalX ? "left" : "right";

  const screenTop = input.screenBounds.y + margin;
  const screenBottom = input.screenBounds.y + input.screenBounds.height - margin;
  const rawY = input.modelBounds.y - gap;
  const minLocalY = Math.max(margin, screenTop - input.windowBounds.y);
  const maxLocalY = Math.min(
    input.windowBounds.height - input.bubbleSize.height - margin,
    screenBottom - input.windowBounds.y - input.bubbleSize.height
  );

  return {
    x: Math.round(clamp(rawX, minLocalX, safeMaxLocalX)),
    y: Math.round(clamp(rawY, minLocalY, Math.max(minLocalY, maxLocalY))),
    side
  };
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
