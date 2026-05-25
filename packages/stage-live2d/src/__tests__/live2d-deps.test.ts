import { afterEach, describe, expect, it, vi } from "vitest";

describe("Live2D rendering dependencies", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("loads the AIRI-proven Pixi 6 and pixi-live2d-display Cubism4 entrypoints", async () => {
    vi.stubGlobal("window", {
      Live2DCubismCore: {}
    });

    const pixiApp = await import("@pixi/app");
    const live2d = await import("pixi-live2d-display/cubism4");

    expect(typeof pixiApp.Application).toBe("function");
    expect(typeof live2d.Live2DModel.from).toBe("function");
    expect(typeof live2d.Live2DModel.registerTicker).toBe("function");
  });
});
