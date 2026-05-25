export type FallbackStageFrameStatus = "idle" | "listening" | "thinking" | "speaking" | "interrupted" | "error";

export type FallbackStageDrawCommand =
  | { kind: "background"; color: string; width: number; height: number }
  | { kind: "ellipse"; id: string; x: number; y: number; radiusX: number; radiusY: number; color: string }
  | { kind: "circle"; id: string; x: number; y: number; radius: number; color: string }
  | { kind: "mouth"; x: number; y: number; width: number; height: number; color: string };

export interface FallbackStageFrameInput {
  width: number;
  height: number;
  timeMs: number;
  mouthOpen: number;
  status: FallbackStageFrameStatus;
  scale?: number;
  offsetX?: number;
  offsetY?: number;
}

export interface FallbackStageFrame {
  width: number;
  height: number;
  commands: FallbackStageDrawCommand[];
  paintedArea: number;
}

export function buildFallbackStageFrame(input: FallbackStageFrameInput): FallbackStageFrame {
  const width = Math.max(1, input.width);
  const height = Math.max(1, input.height);
  const unit = Math.min(width, height);
  const scale = Math.max(0.2, input.scale ?? 1);
  const mouthOpen = clamp01(input.mouthOpen);
  const bob = Math.sin(input.timeMs / 360) * unit * (input.status === "speaking" ? 0.018 : 0.012);
  const centerX = width / 2 + (input.offsetX ?? 0);
  const bodyCenterY = height * 0.58 + bob + (input.offsetY ?? 0);
  const bodyRadiusX = unit * 0.26 * scale;
  const bodyRadiusY = unit * 0.36 * scale;
  const faceY = bodyCenterY - bodyRadiusY * 0.35;
  const eyeOffsetX = bodyRadiusX * 0.34;
  const eyeRadius = unit * 0.026 * scale;
  const mouthHeight = unit * (0.018 + mouthOpen * 0.052) * scale;

  const commands: FallbackStageDrawCommand[] = [
    { kind: "background", color: "rgba(255,255,255,0)", width, height },
    {
      kind: "ellipse",
      id: "shadow",
      x: centerX,
      y: height * 0.91,
      radiusX: bodyRadiusX * 0.9,
      radiusY: unit * 0.035 * scale,
      color: "rgba(39,48,67,0.18)"
    },
    {
      kind: "ellipse",
      id: "body",
      x: centerX,
      y: bodyCenterY,
      radiusX: bodyRadiusX,
      radiusY: bodyRadiusY,
      color: statusColor(input.status)
    },
    { kind: "circle", id: "left-eye", x: centerX - eyeOffsetX, y: faceY, radius: eyeRadius, color: "#273043" },
    { kind: "circle", id: "right-eye", x: centerX + eyeOffsetX, y: faceY, radius: eyeRadius, color: "#273043" },
    {
      kind: "circle",
      id: "left-eye-highlight",
      x: centerX - eyeOffsetX + eyeRadius * 0.28,
      y: faceY - eyeRadius * 0.22,
      radius: eyeRadius * 0.34,
      color: "rgba(255,255,255,0.68)"
    },
    {
      kind: "circle",
      id: "right-eye-highlight",
      x: centerX + eyeOffsetX + eyeRadius * 0.28,
      y: faceY - eyeRadius * 0.22,
      radius: eyeRadius * 0.34,
      color: "rgba(255,255,255,0.68)"
    },
    {
      kind: "mouth",
      x: centerX,
      y: faceY + bodyRadiusY * 0.18,
      width: unit * 0.09 * scale,
      height: mouthHeight,
      color: "#7f263c"
    }
  ];

  return {
    width,
    height,
    commands,
    paintedArea: estimatePaintedArea(commands)
  };
}

export function fallbackFrameSignature(frame: FallbackStageFrame): string {
  return frame.commands
    .map((command) => {
      if (command.kind === "background") {
        return `${command.kind}:${command.width}x${command.height}`;
      }
      if (command.kind === "circle") {
        return `${command.kind}:${command.id}:${round(command.x)},${round(command.y)},${round(command.radius)}`;
      }
      if (command.kind === "ellipse") {
        return `${command.kind}:${command.id}:${round(command.x)},${round(command.y)},${round(command.radiusX)},${round(command.radiusY)}`;
      }
      return `${command.kind}:${round(command.x)},${round(command.y)},${round(command.width)},${round(command.height)}`;
    })
    .join("|");
}

function estimatePaintedArea(commands: FallbackStageDrawCommand[]): number {
  return commands.reduce((total, command) => {
    if (command.kind === "circle") {
      return total + Math.PI * command.radius * command.radius;
    }
    if (command.kind === "ellipse") {
      return total + Math.PI * command.radiusX * command.radiusY;
    }
    if (command.kind === "mouth") {
      return total + command.width * command.height;
    }
    return total;
  }, 0);
}

function statusColor(status: FallbackStageFrameStatus): string {
  if (status === "interrupted") {
    return "#e7b6c8";
  }
  if (status === "thinking") {
    return "#c7d8ff";
  }
  if (status === "speaking") {
    return "#b9e6d8";
  }
  return "#d7c9ff";
}

function clamp01(value: number): number {
  if (!Number.isFinite(value)) {
    return 0;
  }
  return Math.min(1, Math.max(0, value));
}

function round(value: number): number {
  return Math.round(value * 100) / 100;
}
