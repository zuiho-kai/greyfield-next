import { describe, expect, it } from "vitest";
import { existsSync } from "node:fs";
import { resolveLive2DFixturePath, toViteFsModelUrl } from "../live2d-fixture";

describe("Live2D fixture resolver", () => {
  it("finds the bundled official sample model used by dev and harness scripts", () => {
    const fixture = resolveLive2DFixturePath();

    expect(fixture.endsWith(".model3.json")).toBe(true);
    expect(fixture).toContain("apps");
    expect(fixture).toContain("momose-hiyori");
    expect(fixture).toContain("hiyori_free");
    expect(fixture).not.toContain("haru_greeter");
    expect(existsSync(fixture)).toBe(true);
  });

  it("converts fixture paths to Vite /@fs URLs", () => {
    expect(toViteFsModelUrl("E:\\models\\haru\\haru.model3.json")).toBe("/@fs/E:/models/haru/haru.model3.json");
  });
});
