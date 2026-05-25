import { describe, expect, it } from "vitest";
import { parseModel3Manifest } from "../model3-parser";

describe("parseModel3Manifest", () => {
  it("extracts model, textures, expressions, and motion groups from model3 json", () => {
    const manifest = parseModel3Manifest({
      Version: 3,
      FileReferences: {
        Moc: "Greyfield.moc3",
        Textures: ["textures/texture_00.png"],
        Expressions: [
          { Name: "neutral", File: "expressions/neutral.exp3.json" },
          { Name: "happy", File: "expressions/happy.exp3.json" }
        ],
        Motions: {
          Idle: [{ File: "motions/idle_00.motion3.json" }],
          TapHead: [{ File: "motions/tap_head_00.motion3.json" }, { File: "motions/tap_head_01.motion3.json" }]
        }
      }
    });

    expect(manifest).toEqual({
      version: 3,
      moc: "Greyfield.moc3",
      textures: ["textures/texture_00.png"],
      expressions: [
        { name: "neutral", file: "expressions/neutral.exp3.json" },
        { name: "happy", file: "expressions/happy.exp3.json" }
      ],
      motions: {
        Idle: ["motions/idle_00.motion3.json"],
        TapHead: ["motions/tap_head_00.motion3.json", "motions/tap_head_01.motion3.json"]
      }
    });
  });

  it("throws a clear error when the required FileReferences block is missing", () => {
    expect(() => parseModel3Manifest({ Version: 3 })).toThrow(/FileReferences/);
  });
});
