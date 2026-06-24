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
  side: "left" | "right" | "top";
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
  const screenLeft = input.screenBounds.x + margin;
  const screenRight = input.screenBounds.x + input.screenBounds.width - margin;
  const minLocalX = Math.max(margin, screenLeft - input.windowBounds.x);
  const maxLocalX = Math.min(
    input.windowBounds.width - input.bubbleSize.width - margin,
    screenRight - input.windowBounds.x - input.bubbleSize.width
  );
  const safeMaxLocalX = Math.max(minLocalX, maxLocalX);
  const side = "top";
  const rawX = input.windowBounds.width / 2 - input.bubbleSize.width / 2;

  const screenTop = input.screenBounds.y + margin;
  const screenBottom = input.screenBounds.y + input.screenBounds.height - margin;
  const rawY = margin;
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
