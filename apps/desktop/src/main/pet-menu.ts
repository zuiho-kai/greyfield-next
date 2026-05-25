export interface ScreenMenuPoint {
  screenX: number;
  screenY: number;
}

export interface WindowBounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

export function toWindowMenuPoint(point: ScreenMenuPoint, bounds: WindowBounds): { x: number; y: number } {
  return {
    x: clamp(Math.round(point.screenX - bounds.x), 0, Math.max(0, bounds.width - 1)),
    y: clamp(Math.round(point.screenY - bounds.y), 0, Math.max(0, bounds.height - 1))
  };
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
