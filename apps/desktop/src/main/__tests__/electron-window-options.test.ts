import { describe, expect, it } from "vitest";
import { defaultGreyfieldConfig } from "@greyfield/persistence/config-schema";
import { createPetWindowOptions, createSettingsWindowOptions, resolveRendererHtmlPath } from "../electron-window-options";

describe("Electron window options", () => {
  it("keeps the pet window transparent, frameless, and scoped to config dimensions", () => {
    const options = createPetWindowOptions(defaultGreyfieldConfig, "E:/project/apps/desktop/dist-preload/index.cjs");

    expect(options).toMatchObject({
      transparent: true,
      frame: false,
      alwaysOnTop: true,
      width: 420,
      height: 620,
      resizable: false
    });
    expect(options.webPreferences).toMatchObject({
      contextIsolation: true,
      nodeIntegration: false,
      preload: "E:/project/apps/desktop/dist-preload/index.cjs"
    });
  });

  it("keeps settings as a normal utility window", () => {
    const options = createSettingsWindowOptions();

    expect(options).toMatchObject({
      width: 820,
      height: 620,
      show: false,
      frame: true,
      transparent: false
    });
  });

  it("resolves renderer html next to dist-main output", () => {
    expect(resolveRendererHtmlPath("E:/project/apps/desktop/dist-main")).toBe(
      "E:\\project\\apps\\desktop\\dist-renderer\\index.html"
    );
  });
});
