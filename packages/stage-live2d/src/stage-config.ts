export type ExpressionMap = Record<string, string>;

export interface MotionTarget {
  group: string;
  index?: number;
}

export type MotionMap = Record<string, MotionTarget>;

export interface TouchPoint {
  x: number;
  y: number;
}

export interface TouchAction {
  type: "motion" | "expression" | "event";
  id: string;
}

export interface TouchArea {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  action: TouchAction;
}

export interface MouthOpenOptions {
  noiseGate?: number;
  gain?: number;
  curve?: number;
}

export function mapExpression(
  expressions: ExpressionMap,
  state: string,
  fallbackState = "neutral",
): string {
  return expressions[state] ?? expressions[fallbackState] ?? Object.values(expressions)[0] ?? state;
}

export function mapMotion(motions: MotionMap, id: string, fallbackId = "idle"): MotionTarget {
  const target = motions[id] ?? motions[fallbackId] ?? Object.values(motions)[0];

  if (!target) {
    return { group: id };
  }

  return target.index === undefined ? { group: target.group } : { group: target.group, index: target.index };
}

export function resolveTouchArea(areas: TouchArea[], point: TouchPoint): TouchArea | undefined {
  for (let index = areas.length - 1; index >= 0; index -= 1) {
    const area = areas[index];
    if (
      point.x >= area.x &&
      point.x <= area.x + area.width &&
      point.y >= area.y &&
      point.y <= area.y + area.height
    ) {
      return area;
    }
  }

  return undefined;
}

export function mapVolumeToMouthOpen(volume: number, options: MouthOpenOptions = {}): number {
  const noiseGate = options.noiseGate ?? 0.08;
  const gain = options.gain ?? 1.35;
  const curve = options.curve ?? 0.65;

  if (!Number.isFinite(volume) || volume <= noiseGate) {
    return 0;
  }

  const normalized = clamp01((volume - noiseGate) / (1 - noiseGate));
  return clamp01(Math.pow(normalized, curve) * gain);
}

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}
