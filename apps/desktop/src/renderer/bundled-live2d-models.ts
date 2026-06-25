export interface BundledLive2DModel {
  id: string;
  label: string;
  modelPath: string;
  supported: boolean;
  note?: string;
}

export const bundledLive2DModels = [
  {
    id: "momose-hiyori",
    label: "Momose Hiyori",
    modelPath: "assets/live2d/momose-hiyori/runtime/hiyori_free_t08.model3.json",
    supported: true
  }
] as const satisfies readonly BundledLive2DModel[];

export const customLive2DModelValue = "__custom_live2d_model__";

export function findBundledLive2DModel(modelPath: string): BundledLive2DModel | undefined {
  return bundledLive2DModels.find((model) => model.modelPath === modelPath);
}
