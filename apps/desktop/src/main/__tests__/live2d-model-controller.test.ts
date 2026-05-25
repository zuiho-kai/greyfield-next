import { describe, expect, it, vi } from "vitest";
import { Live2DModelController } from "../live2d-model-controller";

describe("Live2DModelController", () => {
  it("updates settings and broadcasts model metadata after a model is selected", async () => {
    const updateSettings = vi.fn(async () => undefined);
    const broadcastModelInfo = vi.fn();
    const controller = new Live2DModelController({
      showOpenDialog: vi.fn(async () => ({ canceled: false, filePaths: ["C:/models/Hiyori/Hiyori.model3.json"] })),
      resolveSelection: vi.fn(async () => ({
        modelPath: "C:/models/Hiyori/Hiyori.model3.json",
        manifest: {
          moc: "Hiyori.moc3",
          textures: ["texture_00.png"],
          expressions: [{ name: "smile", file: "exp/smile.exp3.json" }],
          motions: { Idle: ["motions/idle.motion3.json", "motions/idle2.motion3.json"] }
        }
      })),
      updateSettings,
      broadcastModelInfo,
      broadcastLog: vi.fn()
    });

    await controller.chooseModel();

    expect(updateSettings).toHaveBeenCalledWith({ live2d: { modelPath: "C:/models/Hiyori/Hiyori.model3.json" } });
    expect(broadcastModelInfo).toHaveBeenCalledWith({
      modelPath: "C:/models/Hiyori/Hiyori.model3.json",
      expressions: ["smile"],
      motions: { Idle: 2 }
    });
  });

  it("does nothing when the model picker is canceled", async () => {
    const updateSettings = vi.fn(async () => undefined);
    const controller = new Live2DModelController({
      showOpenDialog: vi.fn(async () => ({ canceled: true, filePaths: [] })),
      resolveSelection: vi.fn(),
      updateSettings,
      broadcastModelInfo: vi.fn(),
      broadcastLog: vi.fn()
    });

    await controller.chooseModel();

    expect(updateSettings).not.toHaveBeenCalled();
  });

  it("broadcasts an error log when model resolution fails", async () => {
    const broadcastLog = vi.fn();
    const controller = new Live2DModelController({
      showOpenDialog: vi.fn(async () => ({ canceled: false, filePaths: ["C:/bad"] })),
      resolveSelection: vi.fn(async () => {
        throw new Error("missing model3.json");
      }),
      updateSettings: vi.fn(async () => undefined),
      broadcastModelInfo: vi.fn(),
      broadcastLog
    });

    await controller.chooseModel();

    expect(broadcastLog).toHaveBeenCalledWith("error", "missing model3.json");
  });
});
