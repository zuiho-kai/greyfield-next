import { describe, expect, it } from "vitest";
import {
  bundledLive2DModels,
  findBundledLive2DModel
} from "../bundled-live2d-models";
import { defaultGreyfieldConfig } from "@greyfield/persistence/config-schema";

describe("bundled Live2D model catalog", () => {
  it("lists supported bundled models before unavailable samples", () => {
    expect(bundledLive2DModels.map((model) => model.label)).toEqual(["Momose Hiyori"]);
    expect(bundledLive2DModels.every((model) => model.supported)).toBe(true);
  });

  it("keeps the default config selectable from the Settings model list", () => {
    expect(findBundledLive2DModel(defaultGreyfieldConfig.live2d.modelPath)).toMatchObject({
      label: "Momose Hiyori",
      supported: true
    });
  });
});
