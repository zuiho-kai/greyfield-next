import { describe, expect, it } from "vitest";
import { resolveModelManifest } from "../model-manifest";

describe("resolveModelManifest", () => {
  it("accepts a direct .model3.json file path", () => {
    expect(resolveModelManifest("models/Hiyori/Hiyori.model3.json")).toEqual({
      manifestPath: "models/Hiyori/Hiyori.model3.json",
      rootDir: "models/Hiyori"
    });
  });

  it("finds exactly one model3 manifest inside a model directory", () => {
    expect(
      resolveModelManifest("models/Hiyori", [
        "textures/texture_00.png",
        "motions/idle.motion3.json",
        "Hiyori.model3.json"
      ])
    ).toEqual({
      manifestPath: "models/Hiyori/Hiyori.model3.json",
      rootDir: "models/Hiyori"
    });
  });

  it("throws when a directory has no unambiguous model manifest", () => {
    expect(() => resolveModelManifest("models/Bad", [])).toThrow(/No Live2D model3 manifest/);
    expect(() => resolveModelManifest("models/Bad", ["a.model3.json", "b.model3.json"])).toThrow(/Multiple Live2D model3 manifests/);
  });
});
