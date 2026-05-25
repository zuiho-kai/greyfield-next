import { describe, expect, it } from "vitest";
import { Live2DStageDriver, type Live2DModelAdapter, type Live2DRendererAdapter } from "../live2d-driver";

class RecordingRenderer implements Live2DRendererAdapter {
  destroyed = false;
  scale = 1;
  x = 0;
  y = 0;
  readonly models: string[] = [];
  readonly model: RecordingModel = new RecordingModel();

  async loadModel(modelPath: string): Promise<Live2DModelAdapter> {
    this.models.push(modelPath);
    return this.model;
  }

  setTransform(input: { scale: number; x: number; y: number }): void {
    this.scale = input.scale;
    this.x = input.x;
    this.y = input.y;
  }

  destroy(): void {
    this.destroyed = true;
  }
}

class RecordingModel implements Live2DModelAdapter {
  expression?: string;
  motion?: { group: string; index?: number };
  mouthOpen = 0;
  focus?: { x: number; y: number };

  async setExpression(expressionId: string): Promise<void> {
    this.expression = expressionId;
  }

  async playMotion(group: string, index?: number): Promise<void> {
    this.motion = { group, index };
  }

  setMouthOpen(value: number): void {
    this.mouthOpen = value;
  }

  focusAt(x: number, y: number): void {
    this.focus = { x, y };
  }
}

describe("Live2DStageDriver", () => {
  it("loads a model and forwards expression, motion, mouth, focus, and transform calls", async () => {
    const renderer = new RecordingRenderer();
    const driver = new Live2DStageDriver(renderer);

    await driver.loadModel("E:/models/hiyori/hiyori.model3.json");
    await driver.setExpression("Happy");
    await driver.playMotion("TapHead", 1);
    await driver.setMouthOpen(1.5);
    driver.focusAt(-0.25, 0.75);
    driver.setTransform({ scale: 1.25, x: 12, y: -8 });
    driver.destroy();

    expect(renderer.models).toEqual(["E:/models/hiyori/hiyori.model3.json"]);
    expect(renderer.model.expression).toBe("Happy");
    expect(renderer.model.motion).toEqual({ group: "TapHead", index: 1 });
    expect(renderer.model.mouthOpen).toBe(1);
    expect(renderer.model.focus).toEqual({ x: -0.25, y: 0.75 });
    expect(renderer.scale).toBe(1.25);
    expect(renderer.x).toBe(12);
    expect(renderer.y).toBe(-8);
    expect(renderer.destroyed).toBe(true);
  });

  it("fails stage operations before a model is loaded", async () => {
    const driver = new Live2DStageDriver(new RecordingRenderer());

    await expect(driver.setExpression("Happy")).rejects.toThrow("No Live2D model loaded");
    await expect(driver.playMotion("Idle")).rejects.toThrow("No Live2D model loaded");
    await expect(driver.setMouthOpen(0.5)).rejects.toThrow("No Live2D model loaded");
  });
});
