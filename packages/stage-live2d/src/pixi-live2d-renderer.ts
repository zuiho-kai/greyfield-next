import { Application } from "@pixi/app";
import { extensions } from "@pixi/extensions";
import { Ticker, TickerPlugin } from "@pixi/ticker";
import type { Live2DModel } from "pixi-live2d-display/cubism4";

import { isAlphaHit, mapClientPointToCanvasPixel, type CanvasPixelPoint } from "./alpha-hit-test";
import type { Live2DModelAdapter, Live2DRendererAdapter, Live2DStageTransform } from "./live2d-driver";

export interface CreatePixiLive2DRendererOptions {
  container: HTMLElement;
  width: number;
  height: number;
  cubismCoreScriptUrl: string;
  resolution?: number;
}

type PixiLive2DModel = Live2DModel & {
  internalModel?: {
    coreModel?: {
      setParameterValueById(id: string, value: number): void;
    };
  };
  expression?(expressionId: string): Promise<void> | void;
  motion?(group: string, index?: number): Promise<void> | void;
  focus?(x: number, y: number): void;
  anchor?: { set(x: number, y?: number): void };
  scale: { set(x: number, y?: number): void; x: number; y: number };
  x: number;
  y: number;
  width: number;
  height: number;
  destroy(): void;
};

export async function createPixiLive2DRenderer(
  options: CreatePixiLive2DRendererOptions
): Promise<PixiLive2DRenderer> {
  await ensureCubismCore(options.cubismCoreScriptUrl);
  const live2d = await import("pixi-live2d-display/cubism4");

  live2d.Live2DModel.registerTicker(Ticker);
  extensions.add(TickerPlugin);

  const app = new Application({
    width: options.width * (options.resolution ?? 1),
    height: options.height * (options.resolution ?? 1),
    backgroundAlpha: 0,
    preserveDrawingBuffer: true,
    autoDensity: false,
    resolution: 1
  });

  app.view.classList.add("live2d-stage-canvas");
  app.view.style.width = "100%";
  app.view.style.height = "100%";
  app.view.style.display = "block";
  app.view.style.objectFit = "contain";
  options.container.appendChild(app.view);

  return new PixiLive2DRenderer(app, live2d.Live2DModel);
}

export function calculateContainScale(input: {
  stageWidth: number;
  stageHeight: number;
  modelWidth: number;
  modelHeight: number;
  userScale: number;
  paddingRatio?: number;
}): number {
  const modelWidth = positiveOrOne(input.modelWidth);
  const modelHeight = positiveOrOne(input.modelHeight);
  const stageWidth = positiveOrOne(input.stageWidth);
  const stageHeight = positiveOrOne(input.stageHeight);
  const paddingRatio = Number.isFinite(input.paddingRatio) ? input.paddingRatio ?? 0.92 : 0.92;
  const userScale = Number.isFinite(input.userScale) ? input.userScale : 1;
  return Math.min(stageWidth / modelWidth, stageHeight / modelHeight) * paddingRatio * userScale;
}

export class PixiLive2DRenderer implements Live2DRendererAdapter {
  private model: PixiLive2DModel | null = null;
  private naturalModelSize: { width: number; height: number } | null = null;
  private transform: Live2DStageTransform = { scale: 1, x: 0, y: 0 };

  constructor(
    private readonly app: Application,
    private readonly live2DModel: typeof Live2DModel
  ) {}

  async loadModel(modelPath: string): Promise<Live2DModelAdapter> {
    if (this.model) {
      this.app.stage.removeChild(this.model);
      this.model.destroy();
      this.model = null;
    }

    const model = (await this.live2DModel.from(modelPath, { autoInteract: false })) as PixiLive2DModel;
    model.anchor?.set(0.5, 0.5);
    this.model = model;
    this.naturalModelSize = {
      width: model.width / positiveOrOne(model.scale.x),
      height: model.height / positiveOrOne(model.scale.y)
    };
    this.app.stage.addChild(model);
    this.applyTransform();
    return new PixiLive2DModelAdapter(model);
  }

  setTransform(input: Live2DStageTransform): void {
    this.transform = input;
    this.applyTransform();
  }

  resize(width: number, height: number, resolution = 1): void {
    this.app.renderer.resize(width * resolution, height * resolution);
    this.applyTransform();
  }

  sampleAlphaAt(clientX: number, clientY: number, threshold = 16): boolean {
    const canvas = this.app.view;
    const point = mapClientPointToCanvasPixel({
      clientX,
      clientY,
      rect: canvas.getBoundingClientRect(),
      canvasWidth: canvas.width,
      canvasHeight: canvas.height
    });
    return isAlphaHit(this.readAlphaAt(point), threshold);
  }

  getVisibleBounds(threshold = 16): { x: number; y: number; width: number; height: number } | null {
    const canvas = this.app.view;
    const gl = this.bindScreenFramebuffer();
    if (!gl || canvas.width === 0 || canvas.height === 0) {
      return null;
    }
    const pixels = new Uint8Array(canvas.width * canvas.height * 4);
    gl.readPixels(0, 0, canvas.width, canvas.height, gl.RGBA, gl.UNSIGNED_BYTE, pixels);

    let minX = canvas.width;
    let minY = canvas.height;
    let maxX = -1;
    let maxY = -1;
    for (let y = 0; y < canvas.height; y += 4) {
      for (let x = 0; x < canvas.width; x += 4) {
        const topLeftY = canvas.height - 1 - y;
        const alpha = pixels[(y * canvas.width + x) * 4 + 3];
        if (isAlphaHit(alpha, threshold)) {
          minX = Math.min(minX, x);
          minY = Math.min(minY, topLeftY);
          maxX = Math.max(maxX, x);
          maxY = Math.max(maxY, topLeftY);
        }
      }
    }
    if (maxX < minX || maxY < minY) {
      return null;
    }

    const rect = canvas.getBoundingClientRect();
    const scaleX = rect.width / canvas.width;
    const scaleY = rect.height / canvas.height;
    return {
      x: Math.round(minX * scaleX),
      y: Math.round(minY * scaleY),
      width: Math.round((maxX - minX + 1) * scaleX),
      height: Math.round((maxY - minY + 1) * scaleY)
    };
  }

  getVisibleShapeRects(threshold = 16, sampleStep = 6): Array<{ x: number; y: number; width: number; height: number }> {
    const canvas = this.app.view;
    const gl = this.bindScreenFramebuffer();
    if (!gl || canvas.width === 0 || canvas.height === 0) {
      return [];
    }

    const pixels = new Uint8Array(canvas.width * canvas.height * 4);
    gl.readPixels(0, 0, canvas.width, canvas.height, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
    return pixelsToShapeRects({
      pixels,
      canvasWidth: canvas.width,
      canvasHeight: canvas.height,
      rect: canvas.getBoundingClientRect(),
      threshold,
      sampleStep
    });
  }

  destroy(): void {
    if (this.model) {
      this.app.stage.removeChild(this.model);
      this.model.destroy();
      this.model = null;
    }
    this.app.destroy(true);
  }

  private applyTransform(): void {
    if (!this.model) {
      return;
    }

    const width = this.app.renderer.width;
    const height = this.app.renderer.height;
    const fitScale = calculateContainScale({
      stageWidth: width,
      stageHeight: height,
      modelWidth: this.naturalModelSize?.width ?? this.model.width,
      modelHeight: this.naturalModelSize?.height ?? this.model.height,
      userScale: this.transform.scale
    });
    this.model.scale.set(fitScale, fitScale);
    this.model.x = width / 2 + this.transform.x;
    this.model.y = height / 2 + this.transform.y;
  }

  private readAlphaAt(point: CanvasPixelPoint): number {
    const canvas = this.app.view;
    const gl = this.bindScreenFramebuffer();
    if (!gl) {
      return 0;
    }
    const pixel = new Uint8Array(4);
    gl.readPixels(point.x, canvas.height - 1 - point.y, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, pixel);
    return pixel[3];
  }

  private bindScreenFramebuffer(): WebGLRenderingContext | WebGL2RenderingContext | null {
    const renderer = this.app.renderer as typeof this.app.renderer & {
      gl?: WebGLRenderingContext | WebGL2RenderingContext;
      renderTexture?: { bind(renderTexture?: unknown): void };
    };
    const gl = renderer.gl as WebGLRenderingContext | WebGL2RenderingContext | undefined;
    if (!gl) {
      return getWebGlContext(this.app.view);
    }
    renderer.renderTexture?.bind();
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    return gl;
  }
}

interface PixelsToShapeRectsInput {
  pixels: Uint8Array;
  canvasWidth: number;
  canvasHeight: number;
  rect: DOMRect;
  threshold: number;
  sampleStep: number;
}

function pixelsToShapeRects(input: PixelsToShapeRectsInput): Array<{ x: number; y: number; width: number; height: number }> {
  const rects: Array<{ x: number; y: number; width: number; height: number }> = [];
  const step = Math.max(1, Math.round(input.sampleStep));
  const scaleX = input.rect.width / positiveOrOne(input.canvasWidth);
  const scaleY = input.rect.height / positiveOrOne(input.canvasHeight);

  for (let yTop = 0; yTop < input.canvasHeight; yTop += step) {
    let spanStart = -1;
    for (let x = 0; x < input.canvasWidth; x += step) {
      const readY = input.canvasHeight - 1 - yTop;
      const alpha = input.pixels[(readY * input.canvasWidth + x) * 4 + 3];
      const hit = isAlphaHit(alpha, input.threshold);
      if (hit && spanStart < 0) {
        spanStart = x;
      }
      if ((!hit || x + step >= input.canvasWidth) && spanStart >= 0) {
        const spanEnd = hit && x + step >= input.canvasWidth ? x + step : x;
        rects.push({
          x: Math.floor(spanStart * scaleX),
          y: Math.floor(yTop * scaleY),
          width: Math.max(1, Math.ceil((spanEnd - spanStart + step) * scaleX)),
          height: Math.max(1, Math.ceil(step * scaleY))
        });
        spanStart = -1;
      }
    }
  }

  return mergeVerticalShapeRects(rects);
}

function mergeVerticalShapeRects(
  rects: Array<{ x: number; y: number; width: number; height: number }>
): Array<{ x: number; y: number; width: number; height: number }> {
  const merged: Array<{ x: number; y: number; width: number; height: number }> = [];
  for (const rect of rects) {
    const previous = merged[merged.length - 1];
    if (previous && previous.x === rect.x && previous.width === rect.width && previous.y + previous.height >= rect.y) {
      previous.height = Math.max(previous.height, rect.y + rect.height - previous.y);
      continue;
    }
    merged.push({ ...rect });
  }
  return merged;
}

function getWebGlContext(canvas: HTMLCanvasElement): WebGLRenderingContext | WebGL2RenderingContext | null {
  return canvas.getContext("webgl2") ?? canvas.getContext("webgl");
}

function positiveOrOne(value: number): number {
  return Number.isFinite(value) && value > 0 ? value : 1;
}

class PixiLive2DModelAdapter implements Live2DModelAdapter {
  constructor(private readonly model: PixiLive2DModel) {}

  async setExpression(expressionId: string): Promise<void> {
    await this.model.expression?.(expressionId);
  }

  async playMotion(group: string, index?: number): Promise<void> {
    await this.model.motion?.(group, index);
  }

  setMouthOpen(value: number): void {
    this.model.internalModel?.coreModel?.setParameterValueById("ParamMouthOpenY", value);
  }

  focusAt(x: number, y: number): void {
    this.model.focus?.(x, y);
  }
}

async function ensureCubismCore(scriptUrl: string): Promise<void> {
  const target = globalThis as typeof globalThis & {
    window?: Window & { Live2DCubismCore?: unknown };
  };
  if (target.window?.Live2DCubismCore) {
    return;
  }
  if (typeof document === "undefined") {
    throw new Error("Live2D Cubism runtime requires a browser document");
  }

  await new Promise<void>((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>(`script[data-greyfield-cubism-core="true"]`);
    if (existing) {
      existing.addEventListener("load", () => resolve(), { once: true });
      existing.addEventListener("error", () => reject(new Error("Failed to load Live2D Cubism core")), { once: true });
      return;
    }

    const script = document.createElement("script");
    script.src = scriptUrl;
    script.async = true;
    script.dataset.greyfieldCubismCore = "true";
    script.addEventListener("load", () => resolve(), { once: true });
    script.addEventListener("error", () => reject(new Error(`Failed to load Live2D Cubism core from ${scriptUrl}`)), {
      once: true
    });
    document.head.appendChild(script);
  });

  if (!target.window?.Live2DCubismCore) {
    throw new Error("Live2D Cubism core loaded but did not expose window.Live2DCubismCore");
  }
}
