export interface CanvasPointMappingInput {
  clientX: number;
  clientY: number;
  rect: {
    left: number;
    top: number;
    width: number;
    height: number;
  };
  canvasWidth: number;
  canvasHeight: number;
}

export interface CanvasPixelPoint {
  x: number;
  y: number;
}

export function isAlphaHit(alpha: number, threshold = 16): boolean {
  return Number.isFinite(alpha) && alpha >= threshold;
}

export function mapClientPointToCanvasPixel(input: CanvasPointMappingInput): CanvasPixelPoint {
  const relativeX = input.rect.width > 0 ? (input.clientX - input.rect.left) / input.rect.width : 0;
  const relativeY = input.rect.height > 0 ? (input.clientY - input.rect.top) / input.rect.height : 0;
  return {
    x: clampInteger(Math.floor(relativeX * input.canvasWidth), 0, Math.max(0, input.canvasWidth - 1)),
    y: clampInteger(Math.floor(relativeY * input.canvasHeight), 0, Math.max(0, input.canvasHeight - 1))
  };
}

function clampInteger(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) {
    return min;
  }
  return Math.min(max, Math.max(min, value));
}
