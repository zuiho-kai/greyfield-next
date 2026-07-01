import { describe, expect, it, vi } from "vitest";
import { applyWindowLayerMode } from "../window-layer-mode";

describe("applyWindowLayerMode", () => {
  it("keeps click-decides mode by leaving both windows at the same layer", () => {
    const petWindow = createFakeWindow();
    const controlsWindow = createFakeWindow();

    applyWindowLayerMode("follow-click", { petWindow, controlsWindow });

    expect(petWindow.setAlwaysOnTop).toHaveBeenCalledWith(true, "normal");
    expect(controlsWindow.setAlwaysOnTop).toHaveBeenCalledWith(true, "normal");
    expect(petWindow.moveTop).not.toHaveBeenCalled();
    expect(controlsWindow.moveTop).not.toHaveBeenCalled();
  });

  it("keeps the controls window in front when the input-first mode is selected", () => {
    const petWindow = createFakeWindow();
    const controlsWindow = createFakeWindow();

    applyWindowLayerMode("controls-front", { petWindow, controlsWindow });

    expect(petWindow.setAlwaysOnTop).toHaveBeenCalledWith(true, "normal");
    expect(controlsWindow.setAlwaysOnTop).toHaveBeenCalledWith(true, "floating");
    expect(controlsWindow.moveTop).toHaveBeenCalledTimes(1);
    expect(petWindow.moveTop).not.toHaveBeenCalled();
  });

  it("keeps the pet window in front when the model-first mode is selected", () => {
    const petWindow = createFakeWindow();
    const controlsWindow = createFakeWindow();

    applyWindowLayerMode("pet-front", { petWindow, controlsWindow });

    expect(petWindow.setAlwaysOnTop).toHaveBeenCalledWith(true, "floating");
    expect(controlsWindow.setAlwaysOnTop).toHaveBeenCalledWith(true, "normal");
    expect(petWindow.moveTop).toHaveBeenCalledTimes(1);
    expect(controlsWindow.moveTop).not.toHaveBeenCalled();
  });
});

function createFakeWindow() {
  return {
    setAlwaysOnTop: vi.fn(),
    moveTop: vi.fn()
  };
}
