import { describe, expect, it, vi } from "vitest";
import { PetWindowController } from "../pet-window-controller";

describe("PetWindowController", () => {
  it("moves the pet window during drag without changing native width or height", () => {
    const window = createFakePetWindow({ x: 10, y: 20, width: 421, height: 620 });
    const controller = new PetWindowController({ getWindow: () => window });

    controller.startDrag({ screenX: 100, screenY: 200 });
    controller.moveDrag({ screenX: 130, screenY: 250 });

    expect(window.setBounds).toHaveBeenCalledWith({ x: 40, y: 70, width: 421, height: 620 });
  });

  it("keeps an active drag alive when the pointer crosses transparent model pixels", () => {
    const window = createFakePetWindow({ x: 10, y: 20, width: 421, height: 620 });
    const controller = new PetWindowController({ getWindow: () => window });

    controller.startDrag({ screenX: 100, screenY: 200 });
    controller.applyHitTest({ passthrough: true, reason: "transparent-area" });
    controller.moveDrag({ screenX: 130, screenY: 250 });

    expect(window.setIgnoreMouseEvents).toHaveBeenLastCalledWith(false);
    expect(window.setBounds).toHaveBeenCalledWith({ x: 40, y: 70, width: 421, height: 620 });
  });

  it("ignores subpixel drag jitter until movement reaches a full native pixel", () => {
    const window = createFakePetWindow({ x: 10, y: 20, width: 421, height: 620 });
    const controller = new PetWindowController({ getWindow: () => window });

    controller.startDrag({ screenX: 100.1, screenY: 200.1 });
    controller.moveDrag({ screenX: 100.6, screenY: 200.6 });
    controller.moveDrag({ screenX: 100.49, screenY: 200.49 });

    expect(window.setBounds).not.toHaveBeenCalled();

    controller.moveDrag({ screenX: 101.2, screenY: 201.2 });
    controller.moveDrag({ screenX: 100.61, screenY: 200.61 });

    expect(window.setBounds).toHaveBeenCalledTimes(1);
    expect(window.setBounds).toHaveBeenCalledWith({ x: 11, y: 21, width: 421, height: 620 });
  });

  it("does not start a drag when locked or model pass-through is enabled", () => {
    const window = createFakePetWindow({ x: 10, y: 20, width: 421, height: 620 });
    const controller = new PetWindowController({ getWindow: () => window });

    controller.setLocked(true);
    controller.startDrag({ screenX: 100, screenY: 200 });
    controller.moveDrag({ screenX: 130, screenY: 250 });
    controller.setLocked(false);
    controller.setModelPassThrough(true);
    controller.startDrag({ screenX: 100, screenY: 200 });
    controller.moveDrag({ screenX: 130, screenY: 250 });

    expect(window.setBounds).not.toHaveBeenCalled();
  });

  it("forces mouse pass-through when model pass-through is enabled", () => {
    const window = createFakePetWindow({ x: 10, y: 20, width: 421, height: 620 });
    const controller = new PetWindowController({ getWindow: () => window });

    controller.setModelPassThrough(true);
    controller.applyHitTest({ passthrough: false, reason: "model-hit" });

    expect(window.setIgnoreMouseEvents).toHaveBeenLastCalledWith(true, { forward: true });
  });

  it("does not apply native window shape unless explicitly enabled", () => {
    const window = createFakePetWindow({ x: 10, y: 20, width: 421, height: 620 });
    const controller = new PetWindowController({ getWindow: () => window, nativeShapeEnabled: false });

    controller.applyWindowShape([{ x: 0, y: 0, width: 120, height: 240 }], "model-mask");

    expect(window.setShape).not.toHaveBeenCalled();
  });
});

function createFakePetWindow(bounds: { x: number; y: number; width: number; height: number }) {
  let currentBounds = { ...bounds };
  return {
    getBounds: vi.fn(() => currentBounds),
    setBounds: vi.fn((next: typeof bounds) => {
      currentBounds = { ...next };
    }),
    setIgnoreMouseEvents: vi.fn(),
    setMovable: vi.fn(),
    setShape: vi.fn()
  };
}
