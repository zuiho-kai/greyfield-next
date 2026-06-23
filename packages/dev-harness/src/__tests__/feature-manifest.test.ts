import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const manifest = JSON.parse(
  readFileSync(new URL("../../v1-features.json", import.meta.url), "utf8")
) as {
  version: string;
  nonGoals: string[];
  qaProfiles: Record<string, { tag: string; script: string; ciTrigger: string; scope: string[] }>;
  features: Array<{
    id: string;
    title: string;
    status: string;
    package: string;
    acceptance: string[];
    qa: { script: string };
  }>;
};

describe("v1-features.json", () => {
  it("keeps V1 scope explicit and independently checkable", () => {
    expect(manifest.version).toBe("v1");
    expect(manifest.nonGoals).toEqual(
      expect.arrayContaining(["desktop-control", "multi-agent", "message-platform-gateway"])
    );

    const ids = new Set<string>();
    for (const feature of manifest.features) {
      expect(feature.id).toMatch(/^GFN-V1-\d{3}$/);
      expect(ids.has(feature.id)).toBe(false);
      ids.add(feature.id);
      expect(feature.title.length).toBeGreaterThan(4);
      expect(feature.package).toMatch(/^(apps|packages)\//);
      expect(feature.acceptance.length).toBeGreaterThan(0);
      expect(feature.qa.script.length).toBeGreaterThan(0);
    }

    expect(manifest.qaProfiles["frontend-full"]).toMatchObject({
      tag: "frontend-full",
      script: "pnpm harness:frontend-full"
    });
    expect(manifest.qaProfiles["frontend-full"].ciTrigger).toContain("frontend-visible paths");
    expect(manifest.qaProfiles["frontend-full"].scope).toEqual(
      expect.arrayContaining([
        "real Live2D rendering",
        "transparent pet hit-test, drag, wheel, and pass-through",
        "Settings editable fields, provider readiness, Test LLM, and active-chat rejection",
        "Chat waiting/generating/stopped/failed/retry UI through provider failure and abort harnesses"
      ])
    );
  });
});
