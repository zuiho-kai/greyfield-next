import type { Rect } from "./speech-bubble-placement";

export function createPetWindowShape(input: {
  modelBounds: Rect | null;
  fallbackShape: Rect[];
  bubbleRect: Rect | null;
  viewportWidth: number;
  viewportHeight: number;
  padding?: number;
}): Rect[] {
  const bounds = { width: input.viewportWidth, height: input.viewportHeight };
  const modelRect = input.modelBounds ?? boundsFromRects(input.fallbackShape);
  const rects: Rect[] = [];

  if (modelRect) {
    rects.push(expandAndClamp(modelRect, bounds, input.padding ?? 24));
  }
  if (input.bubbleRect) {
    rects.push(clampRect(input.bubbleRect, bounds));
  }

  return rects.filter((rect) => rect.width > 0 && rect.height > 0);
}

function boundsFromRects(rects: Rect[]): Rect | null {
  if (rects.length === 0) {
    return null;
  }
  const minX = Math.min(...rects.map((rect) => rect.x));
  const minY = Math.min(...rects.map((rect) => rect.y));
  const maxX = Math.max(...rects.map((rect) => rect.x + rect.width));
  const maxY = Math.max(...rects.map((rect) => rect.y + rect.height));
  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
}

function expandAndClamp(rect: Rect, bounds: { width: number; height: number }, padding: number): Rect {
  const pad = Math.max(0, Math.round(padding));
  return clampRect(
    {
      x: rect.x - pad,
      y: rect.y - pad,
      width: rect.width + pad * 2,
      height: rect.height + pad * 2
    },
    bounds
  );
}

function clampRect(rect: Rect, bounds: { width: number; height: number }): Rect {
  const x = Math.max(0, Math.round(rect.x));
  const y = Math.max(0, Math.round(rect.y));
  const right = Math.min(bounds.width, Math.round(rect.x + rect.width));
  const bottom = Math.min(bounds.height, Math.round(rect.y + rect.height));
  return {
    x,
    y,
    width: Math.max(0, right - x),
    height: Math.max(0, bottom - y)
  };
}
