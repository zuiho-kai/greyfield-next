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
  side: "left" | "right" | "top" | "bottom";
}

export function placeSpeechBubble(input: {
  modelBounds: Rect;
  modelShape?: Rect[];
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
  const screenTop = input.screenBounds.y + margin;
  const screenBottom = input.screenBounds.y + input.screenBounds.height - margin;
  const minLocalY = Math.max(margin, screenTop - input.windowBounds.y);
  const maxLocalY = Math.min(
    input.windowBounds.height - input.bubbleSize.height - margin,
    screenBottom - input.windowBounds.y - input.bubbleSize.height
  );
  const safeMaxLocalY = Math.max(minLocalY, maxLocalY);
  const leftSpace = input.modelBounds.x - margin;
  const rightSpace = input.windowBounds.width - (input.modelBounds.x + input.modelBounds.width) - margin;
  const centeredX = input.modelBounds.x + input.modelBounds.width / 2 - input.bubbleSize.width / 2;
  const canUseRightSide = rightSpace >= input.bubbleSize.width + gap;
  const canUseLeftSide = leftSpace >= input.bubbleSize.width + gap;
  const preferredSide =
    canUseRightSide || canUseLeftSide
      ? canUseRightSide && (!canUseLeftSide || rightSpace >= leftSpace)
        ? "right"
        : "left"
      : "top";
  const sideOrder: Array<"left" | "right"> =
    preferredSide === "left"
      ? ["left", "right"]
      : preferredSide === "right"
        ? ["right", "left"]
        : rightSpace >= leftSpace
          ? ["right", "left"]
          : ["left", "right"];
  const sideAnchors = [0.16, 0.28, 0.42, 0.58];
  const candidates: Array<{ side: SpeechBubblePlacement["side"]; rawX: number; rawY: number; priority: number }> = [];

  for (const [sideIndex, side] of sideOrder.entries()) {
    const rawX =
      side === "right"
        ? input.modelBounds.x + input.modelBounds.width + gap
        : input.modelBounds.x - input.bubbleSize.width - gap;
    for (const [index, anchor] of sideAnchors.entries()) {
      candidates.push({
        side,
        rawX,
        rawY: input.modelBounds.y + input.modelBounds.height * anchor,
        priority: index + sideIndex * 10
      });
    }
  }

  candidates.push({
    side: "top",
    rawX: centeredX,
    rawY: input.modelBounds.y - input.bubbleSize.height - gap,
    priority: preferredSide === "top" ? 4 : 20
  });
  candidates.push({
    side: "bottom",
    rawX: centeredX,
    rawY: input.modelBounds.y + input.modelBounds.height + gap,
    priority: 30
  });

  const shape = input.modelShape?.length ? input.modelShape : [input.modelBounds];
  const [best] = candidates
    .map((candidate) => {
      const x = Math.round(clamp(candidate.rawX, minLocalX, safeMaxLocalX));
      const y = Math.round(clamp(candidate.rawY, minLocalY, safeMaxLocalY));
      const rect = { x, y, width: input.bubbleSize.width, height: input.bubbleSize.height };
      return {
        ...candidate,
        x,
        y,
        overlapArea: overlapArea(rect, shape)
      };
    })
    .sort((a, b) => a.overlapArea - b.overlapArea || a.priority - b.priority);

  return {
    x: best.x,
    y: best.y,
    side: best.side
  };
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function overlapArea(rect: Rect, shapes: Rect[]): number {
  return shapes.reduce((total, shape) => total + intersectionArea(rect, shape), 0);
}

function intersectionArea(a: Rect, b: Rect): number {
  const left = Math.max(a.x, b.x);
  const right = Math.min(a.x + a.width, b.x + b.width);
  const top = Math.max(a.y, b.y);
  const bottom = Math.min(a.y + a.height, b.y + b.height);
  return Math.max(0, right - left) * Math.max(0, bottom - top);
}
