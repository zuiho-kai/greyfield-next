import type { GreyfieldConfigPatch } from "@greyfield/persistence/config-schema";

export interface Live2DModelSelection {
  modelPath: string;
  manifest: {
    expressions: Array<{ name: string }>;
    motions: Record<string, unknown[]>;
  };
}

export interface Live2DModelInfo {
  modelPath: string;
  expressions: string[];
  motions: Record<string, number>;
}

export interface Live2DModelControllerOptions {
  showOpenDialog(): Promise<{ canceled: boolean; filePaths: string[] }>;
  resolveSelection(path: string): Promise<Live2DModelSelection>;
  updateSettings(patch: GreyfieldConfigPatch): Promise<void>;
  broadcastModelInfo(info: Live2DModelInfo): void;
  broadcastLog(level: "debug" | "info" | "warn" | "error", message: string): void;
}

export class Live2DModelController {
  constructor(private readonly options: Live2DModelControllerOptions) {}

  async chooseModel(): Promise<void> {
    const result = await this.options.showOpenDialog();
    if (result.canceled || result.filePaths.length === 0) {
      return;
    }

    try {
      const selection = await this.options.resolveSelection(result.filePaths[0]);
      await this.options.updateSettings({ live2d: { modelPath: selection.modelPath } });
      this.options.broadcastModelInfo(toModelInfo(selection));
    } catch (error) {
      this.options.broadcastLog("error", error instanceof Error ? error.message : String(error));
    }
  }
}

function toModelInfo(selection: Live2DModelSelection): Live2DModelInfo {
  return {
    modelPath: selection.modelPath,
    expressions: selection.manifest.expressions.map((expression) => expression.name),
    motions: Object.fromEntries(Object.entries(selection.manifest.motions).map(([group, files]) => [group, files.length]))
  };
}
