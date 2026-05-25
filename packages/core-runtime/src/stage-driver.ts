export interface StageDriver {
  loadModel(modelPath: string): Promise<void>;
  setExpression(expressionId: string): Promise<void>;
  playMotion(group: string, index?: number): Promise<void>;
  setMouthOpen(value: number): Promise<void>;
}
