export interface ShapeRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface ShapeBounds {
  width: number;
  height: number;
}

export function sanitizeShapeRects(rects: ShapeRect[], bounds: ShapeBounds): ShapeRect[] {
  return rects
    .map((rect) => {
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
    })
    .filter((rect) => rect.width > 0 && rect.height > 0);
}

export function expandShapeRects(rects: ShapeRect[], bounds: ShapeBounds, padding: number): ShapeRect[] {
  const pad = Math.max(0, Math.round(padding));
  return sanitizeShapeRects(
    rects.map((rect) => ({
      x: rect.x - pad,
      y: rect.y - pad,
      width: rect.width + pad * 2,
      height: rect.height + pad * 2
    })),
    bounds
  );
}
