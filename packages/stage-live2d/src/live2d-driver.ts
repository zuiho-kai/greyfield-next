export interface Live2DModelAdapter {
  setExpression(expressionId: string): Promise<void>;
  playMotion(group: string, index?: number): Promise<void>;
  setMouthOpen(value: number): void;
  focusAt(x: number, y: number): void;
}

export interface Live2DRendererAdapter {
  loadModel(modelPath: string): Promise<Live2DModelAdapter>;
  setTransform(input: Live2DStageTransform): void;
  destroy(): void;
}

export interface Live2DStageTransform {
  scale: number;
  x: number;
  y: number;
}

export class Live2DStageDriver {
  private model: Live2DModelAdapter | null = null;

  constructor(private readonly renderer: Live2DRendererAdapter) {}

  async loadModel(modelPath: string): Promise<void> {
    this.model = await this.renderer.loadModel(modelPath);
  }

  async setExpression(expressionId: string): Promise<void> {
    await this.requireModel().setExpression(expressionId);
  }

  async playMotion(group: string, index?: number): Promise<void> {
    await this.requireModel().playMotion(group, index);
  }

  async setMouthOpen(value: number): Promise<void> {
    this.requireModel().setMouthOpen(clamp01(value));
  }

  setTransform(transform: Live2DStageTransform): void {
    this.renderer.setTransform({
      scale: Math.max(0.1, transform.scale),
      x: finiteOrZero(transform.x),
      y: finiteOrZero(transform.y)
    });
  }

  focusAt(x: number, y: number): void {
    this.requireModel().focusAt(clampSignedUnit(x), clampSignedUnit(y));
  }

  destroy(): void {
    this.renderer.destroy();
    this.model = null;
  }

  private requireModel(): Live2DModelAdapter {
    if (!this.model) {
      throw new Error("No Live2D model loaded");
    }
    return this.model;
  }
}

function clamp01(value: number): number {
  if (!Number.isFinite(value)) {
    return 0;
  }
  return Math.min(1, Math.max(0, value));
}

function clampSignedUnit(value: number): number {
  if (!Number.isFinite(value)) {
    return 0;
  }
  return Math.min(1, Math.max(-1, value));
}

function finiteOrZero(value: number): number {
  return Number.isFinite(value) ? value : 0;
}
