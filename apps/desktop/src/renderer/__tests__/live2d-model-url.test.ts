import { describe, expect, it } from "vitest";
import { toRendererModelUrl } from "../live2d-model-url";

describe("toRendererModelUrl", () => {
  it("converts Windows absolute model paths to Vite fs URLs", () => {
    expect(toRendererModelUrl("E:\\models\\hiyori\\hiyori.model3.json")).toBe(
      "/@fs/E:/models/hiyori/hiyori.model3.json"
    );
  });

  it("leaves browser-safe URLs unchanged", () => {
    expect(toRendererModelUrl("/@fs/E:/models/hiyori.model3.json")).toBe("/@fs/E:/models/hiyori.model3.json");
    expect(toRendererModelUrl("https://example.test/hiyori.model3.json")).toBe(
      "https://example.test/hiyori.model3.json"
    );
  });
});
