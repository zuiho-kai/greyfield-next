import { describe, expect, it } from "vitest";
import { toWindowMenuPoint } from "../pet-menu";

describe("toWindowMenuPoint", () => {
  it("converts screen coordinates to BrowserWindow-local popup coordinates", () => {
    expect(toWindowMenuPoint({ screenX: 850, screenY: 260 }, { x: 750, y: 200, width: 420, height: 620 })).toEqual({
      x: 100,
      y: 60
    });
  });

  it("clamps popup coordinates inside the pet window", () => {
    expect(toWindowMenuPoint({ screenX: 1400, screenY: 20 }, { x: 750, y: 200, width: 420, height: 620 })).toEqual({
      x: 419,
      y: 0
    });
  });
});
