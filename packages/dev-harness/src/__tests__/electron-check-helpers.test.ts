import { describe, expect, it } from "vitest";
import { chooseStagePointFromAlpha, findStagePointOutsideRects } from "../electron-check-helpers";

describe("electron check helpers", () => {
  it("chooses the strongest model pixel instead of the first animated edge pixel", () => {
    const result = chooseStagePointFromAlpha({
      width: 16,
      height: 1,
      wantHit: true,
      alphaAt: (x) => [20, 255, 180, 0][x / 4] ?? 0,
      toPoint: (x, y) => ({ x: x * 10, y: y * 10 })
    });

    expect(result).toEqual({ x: 40, y: 0 });
  });

  it("falls back to the next strongest model pixel when a smoke check rejects the strongest point", () => {
    const result = chooseStagePointFromAlpha({
      width: 16,
      height: 1,
      wantHit: true,
      alphaAt: (x) => [20, 255, 180, 0][x / 4] ?? 0,
      toPoint: (x, y) => ({ x: x * 10, y: y * 10 }),
      acceptPoint: (point) => point.x !== 40
    });

    expect(result).toEqual({ x: 80, y: 0 });
  });

  it("keeps transparent point selection away from model pixels", () => {
    const result = chooseStagePointFromAlpha({
      width: 16,
      height: 1,
      wantHit: false,
      alphaAt: (x) => [255, 180, 20, 0][x / 4] ?? 0,
      toPoint: (x, y) => ({ x: x * 10, y: y * 10 })
    });

    expect(result).toEqual({ x: 120, y: 0 });
  });

  it("can reject candidate points that fall inside a reserved rect", async () => {
    const page = {
      evaluate: async (callback: Function, arg: unknown) => {
        const previousWindow = globalThis.window;
        const previousDocument = globalThis.document;
        const canvas = createFakeCanvas();
        const document = {
          querySelectorAll: () => [canvas]
        };
        Object.defineProperty(globalThis, "window", {
          configurable: true,
          value: {
            __greyfieldStageSmoke: {
              sampleModelHit: () => false
            }
          }
        });
        Object.defineProperty(globalThis, "document", { configurable: true, value: document });
        try {
          return callback(arg);
        } finally {
          Object.defineProperty(globalThis, "window", { configurable: true, value: previousWindow });
          Object.defineProperty(globalThis, "document", { configurable: true, value: previousDocument });
        }
      }
    };

    const point = await findStagePointOutsideRects(page as never, false, [{ x: 0, y: 0, width: 10, height: 10 }]);

    expect(point).toEqual({ x: 12, y: 0 });
  });
});

function createFakeCanvas() {
  return {
    width: 16,
    height: 4,
    className: "fallback-stage-canvas",
    getBoundingClientRect: () => ({ left: 0, top: 0, width: 16, height: 4 }),
    getContext: (kind: string) =>
      kind === "2d"
        ? {
            getImageData: () => ({
              data: new Uint8ClampedArray(16 * 4 * 4)
            })
          }
        : null
  };
}
