import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { describe, expect, it } from "vitest";
import { loadCharacterPersona } from "../character-persona";

describe("loadCharacterPersona", () => {
  it("loads a persona from YAML", async () => {
    const dir = await mkdtemp(join(tmpdir(), "greyfield-persona-"));
    try {
      const path = join(dir, "test.yaml");
      await writeFile(
        path,
        [
          "name: Test Greyfield",
          "tone: precise",
          "boundaries:",
          "  - Stay in V1 scope.",
          "expressionMap:",
          "  neutral: default",
          "  speaking: smile"
        ].join("\n"),
        "utf8"
      );

      await expect(loadCharacterPersona(path)).resolves.toEqual({
        name: "Test Greyfield",
        tone: "precise",
        boundaries: ["Stay in V1 scope."],
        expressionMap: {
          neutral: "default",
          speaking: "smile"
        }
      });
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});
