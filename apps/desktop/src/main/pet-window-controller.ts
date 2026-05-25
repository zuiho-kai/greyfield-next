import { defaultGreyfieldConfig } from "@greyfield/persistence/config-schema";
import { expandShapeRects, sanitizeShapeRects, type ShapeRect } from "./window-shape";

export type PetHitTestReason = "transparent-area" | "model-pass-through" | "model-hit";
export type PetWindowShapeReason = "model-mask" | "drag-full-window" | "reset";

export interface PetNativeWindow {
  getBounds(): { x: number; y: number; width: number; height: number };
  setBounds(bounds: { x: number; y: number; width: number; height: number }): void;
  setIgnoreMouseEvents(ignore: boolean, options?: { forward: boolean }): void;
  setMovable(movable: boolean): void;
  setShape(rects: ShapeRect[]): void;
}

export interface PetWindowControllerOptions {
  getWindow(): PetNativeWindow | undefined;
  nativeShapeEnabled?: boolean;
}

export class PetWindowController {
  private modelPassThrough = false;
  private locked = false;
  private lastShapeRects: ShapeRect[] = [];
  private activeDrag:
    | {
        startScreenX: number;
        startScreenY: number;
        startWindowX: number;
        startWindowY: number;
        startWindowWidth: number;
        startWindowHeight: number;
      }
    | undefined;

  constructor(private readonly options: PetWindowControllerOptions) {}

  isModelPassThrough(): boolean {
    return this.modelPassThrough;
  }

  isLocked(): boolean {
    return this.locked;
  }

  setModelPassThrough(enabled: boolean): void {
    this.modelPassThrough = enabled;
    if (enabled) {
      this.activeDrag = undefined;
      this.applyHitTest({ passthrough: true, reason: "model-pass-through" });
    }
  }

  setLocked(locked: boolean): void {
    this.locked = locked;
    this.options.getWindow()?.setMovable(!locked);
    if (locked) {
      this.activeDrag = undefined;
    }
  }

  applyHitTest(payload: { passthrough: boolean; reason: PetHitTestReason }): void {
    const window = this.options.getWindow();
    if (!window) {
      return;
    }
    if (this.canUseWindowShape() && !this.modelPassThrough) {
      window.setIgnoreMouseEvents(false);
      return;
    }
    const passthrough = this.modelPassThrough ? true : payload.passthrough;
    if (passthrough) {
      this.activeDrag = undefined;
    }
    window.setIgnoreMouseEvents(passthrough, { forward: true });
  }

  applyWindowShape(rects: ShapeRect[], reason: PetWindowShapeReason): void {
    const window = this.options.getWindow();
    const bounds = window?.getBounds() ?? defaultGreyfieldConfig.window;
    const cleanRects = reason === "model-mask" ? expandShapeRects(rects, bounds, 8) : sanitizeShapeRects(rects, bounds);
    if (reason === "model-mask" || reason === "reset") {
      this.lastShapeRects = cleanRects;
    }
    if (!this.canUseWindowShape() || !window || this.modelPassThrough || this.activeDrag) {
      return;
    }
    window.setIgnoreMouseEvents(false);
    window.setShape(cleanRects);
  }

  applyStoredShape(): void {
    const window = this.options.getWindow();
    if (!this.canUseWindowShape() || !window || this.modelPassThrough) {
      return;
    }
    window.setIgnoreMouseEvents(false);
    window.setShape(this.lastShapeRects);
  }

  startDrag(payload: { screenX: number; screenY: number }): void {
    const window = this.options.getWindow();
    if (this.locked || this.modelPassThrough || !window) {
      return;
    }
    const bounds = window.getBounds();
    this.activeDrag = {
      startScreenX: payload.screenX,
      startScreenY: payload.screenY,
      startWindowX: bounds.x,
      startWindowY: bounds.y,
      startWindowWidth: bounds.width,
      startWindowHeight: bounds.height
    };
  }

  moveDrag(payload: { screenX: number; screenY: number }): void {
    if (!this.activeDrag) {
      return;
    }
    this.movePetWindowWithoutResizing({
      x: Math.round(this.activeDrag.startWindowX + payload.screenX - this.activeDrag.startScreenX),
      y: Math.round(this.activeDrag.startWindowY + payload.screenY - this.activeDrag.startScreenY),
      width: this.activeDrag.startWindowWidth,
      height: this.activeDrag.startWindowHeight
    });
  }

  endDrag(): void {
    this.activeDrag = undefined;
  }

  private movePetWindowWithoutResizing(target: { x: number; y: number; width: number; height: number }): void {
    const window = this.options.getWindow();
    if (!window) {
      return;
    }

    let next = target;
    for (let attempt = 0; attempt < 3; attempt += 1) {
      window.setBounds(next);
      const actual = window.getBounds();
      if (actual.width === target.width && actual.height === target.height) {
        return;
      }
      next = {
        x: target.x,
        y: target.y,
        width: Math.max(1, next.width - (actual.width - target.width)),
        height: Math.max(1, next.height - (actual.height - target.height))
      };
    }
  }

  private canUseWindowShape(): boolean {
    return this.options.nativeShapeEnabled === true;
  }
}
