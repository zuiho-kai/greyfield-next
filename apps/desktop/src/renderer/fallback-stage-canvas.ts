import {
  buildFallbackStageFrame,
  type FallbackStageDrawCommand,
  type FallbackStageFrameStatus
} from "@greyfield/stage-live2d";

export interface RenderFallbackStageCanvasOptions {
  canvas: HTMLCanvasElement;
  width: number;
  height: number;
  timeMs: number;
  mouthOpen: number;
  status: FallbackStageFrameStatus;
  scale?: number;
  offsetX?: number;
  offsetY?: number;
}

export function renderFallbackStageCanvas(options: RenderFallbackStageCanvasOptions): string {
  const context = options.canvas.getContext("2d");
  if (!context) {
    return "";
  }

  const ratio = globalThis.devicePixelRatio || 1;
  const pixelWidth = Math.max(1, Math.floor(options.width * ratio));
  const pixelHeight = Math.max(1, Math.floor(options.height * ratio));

  if (options.canvas.width !== pixelWidth || options.canvas.height !== pixelHeight) {
    options.canvas.width = pixelWidth;
    options.canvas.height = pixelHeight;
  }

  options.canvas.style.width = `${options.width}px`;
  options.canvas.style.height = `${options.height}px`;

  context.setTransform(ratio, 0, 0, ratio, 0, 0);
  context.clearRect(0, 0, options.width, options.height);

  const frame = buildFallbackStageFrame(options);
  for (const command of frame.commands) {
    drawCommand(context, command);
  }

  return frame.commands.length > 0 ? `${frame.paintedArea}:${frame.commands.length}` : "";
}

function drawCommand(context: CanvasRenderingContext2D, command: FallbackStageDrawCommand): void {
  context.fillStyle = command.color;

  if (command.kind === "background") {
    context.fillRect(0, 0, command.width, command.height);
    return;
  }

  context.beginPath();

  if (command.kind === "ellipse") {
    context.ellipse(command.x, command.y, command.radiusX, command.radiusY, 0, 0, Math.PI * 2);
  } else if (command.kind === "circle") {
    context.arc(command.x, command.y, command.radius, 0, Math.PI * 2);
  } else {
    context.ellipse(command.x, command.y, command.width / 2, command.height / 2, 0, 0, Math.PI * 2);
  }

  context.fill();
}
