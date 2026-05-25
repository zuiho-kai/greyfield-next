import { resolveModelManifest, type ModelManifestResolution } from "./model-manifest";

export interface StageDriver {
  loadModel(modelPath: string): Promise<void>;
  setExpression(expressionId: string): Promise<void>;
  playMotion(group: string, index?: number): Promise<void>;
  setMouthOpen(value: number): Promise<void>;
}

export interface StageEventRecord {
  type: "loadModel" | "setExpression" | "playMotion" | "setMouthOpen";
  payload: Record<string, unknown>;
}

export class FakeStageDriver implements StageDriver {
  readonly events: StageEventRecord[] = [];
  model?: ModelManifestResolution;

  async loadModel(modelPath: string): Promise<void> {
    this.model = resolveModelManifest(modelPath);
    this.events.push({ type: "loadModel", payload: { modelPath } });
  }

  async setExpression(expressionId: string): Promise<void> {
    this.events.push({ type: "setExpression", payload: { expressionId } });
  }

  async playMotion(group: string, index?: number): Promise<void> {
    this.events.push({ type: "playMotion", payload: { group, index } });
  }

  async setMouthOpen(value: number): Promise<void> {
    this.events.push({ type: "setMouthOpen", payload: { value: clamp01(value) } });
  }
}

function clamp01(value: number): number {
  if (Number.isNaN(value)) {
    return 0;
  }
  return Math.max(0, Math.min(1, value));
}
