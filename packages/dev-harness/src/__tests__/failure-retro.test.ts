import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const retro = readFileSync(new URL("../../../../docs/failure-retro.md", import.meta.url), "utf8");

describe("failure-retro.md", () => {
  it("records the old project failure modes and the V1 guardrails", () => {
    expect(retro).toContain("voice_pipeline.py");
    expect(retro).toContain("main.js");
    expect(retro).toContain("v1-features.json");
    expect(retro).toContain("TS monorepo");
    expect(retro).toContain("V1 禁止");

    for (const nonGoal of [
      "桌面控制",
      "浏览器控制",
      "长期任务",
      "多 Agent",
      "直播",
      "技能自生成"
    ]) {
      expect(retro).toContain(nonGoal);
    }
  });
});
