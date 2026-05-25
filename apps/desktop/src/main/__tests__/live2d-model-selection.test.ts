import { describe, expect, it } from "vitest";
import { resolveLive2DModelSelection } from "../live2d-model-selection";

describe("resolveLive2DModelSelection", () => {
  it("accepts a direct .model3.json file and parses expressions and motions", async () => {
    const result = await resolveLive2DModelSelection("C:/models/Hiyori/Hiyori.model3.json", {
      stat: async () => ({ isDirectory: false }),
      readdir: async () => {
        throw new Error("readdir should not be called for direct manifests");
      },
      readFile: async () =>
        JSON.stringify({
          Version: 3,
          FileReferences: {
            Moc: "Hiyori.moc3",
            Textures: ["textures/texture_00.png"],
            Expressions: [{ Name: "smile", File: "expressions/smile.exp3.json" }],
            Motions: { Idle: [{ File: "motions/idle.motion3.json" }] }
          }
        })
    });

    expect(result.modelPath).toBe("C:/models/Hiyori/Hiyori.model3.json");
    expect(result.manifest.expressions.map((expression) => expression.name)).toEqual(["smile"]);
    expect(Object.keys(result.manifest.motions)).toEqual(["Idle"]);
  });

  it("accepts a model directory with exactly one .model3.json manifest", async () => {
    const result = await resolveLive2DModelSelection("C:/models/Hiyori", {
      stat: async () => ({ isDirectory: true }),
      readdir: async () => ["Hiyori.model3.json", "textures"],
      readFile: async () =>
        JSON.stringify({
          FileReferences: {
            Moc: "Hiyori.moc3",
            Textures: []
          }
        })
    });

    expect(result.modelPath).toBe("C:/models/Hiyori/Hiyori.model3.json");
    expect(result.rootDir).toBe("C:/models/Hiyori");
  });

  it("rejects directories with multiple model3 manifests", async () => {
    await expect(
      resolveLive2DModelSelection("C:/models/Mixed", {
        stat: async () => ({ isDirectory: true }),
        readdir: async () => ["A.model3.json", "B.model3.json"],
        readFile: async () => "{}"
      })
    ).rejects.toThrow("Multiple Live2D model3 manifests");
  });
});
