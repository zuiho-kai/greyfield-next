import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { describe, expect, it } from "vitest";
import { loadCharacterPersona, saveCharacterPersona } from "../character-persona";

describe("loadCharacterPersona", () => {
  it("loads a persona from YAML", async () => {
    const dir = await mkdtemp(join(tmpdir(), "greyfield-persona-"));
    try {
      const path = join(dir, "test.yaml");
      await writeFile(
        path,
        [
          "name: Test Greyfield",
          "userAddress: captain",
          "background: A local Live2D companion.",
          "personality: steady and curious",
          "speakingStyle: crisp and warm",
          "tone: precise",
          "boundaries:",
          "  - Stay in V1 scope.",
          "greeting: Ready when you are.",
          "expressionMap:",
          "  neutral: default",
          "  speaking: smile"
        ].join("\n"),
        "utf8"
      );

      await expect(loadCharacterPersona(path)).resolves.toEqual({
        name: "Test Greyfield",
        userAddress: "captain",
        background: "A local Live2D companion.",
        personality: "steady and curious",
        speakingStyle: "crisp and warm",
        greeting: "Ready when you are.",
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

  it("migrates the legacy tone and prompt fields into the single persona schema", async () => {
    const dir = await mkdtemp(join(tmpdir(), "greyfield-persona-legacy-"));
    try {
      const path = join(dir, "legacy.yaml");
      await writeFile(
        path,
        [
          "name: Legacy Greyfield",
          "tone: gentle",
          "boundaries:",
          "  - Stay local.",
          "expressionMap:",
          "  neutral: default",
          "prompt:",
          "  identity: Legacy desktop companion.",
          "  style:",
          "    - Speak softly.",
          "    - Keep context."
        ].join("\n"),
        "utf8"
      );

      await expect(loadCharacterPersona(path)).resolves.toMatchObject({
        name: "Legacy Greyfield",
        userAddress: "you",
        background: "Legacy desktop companion.",
        personality: "gentle",
        speakingStyle: "Speak softly. Keep context.",
        greeting: "你好，我在。"
      });
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("saves a user-editable persona back to YAML", async () => {
    const dir = await mkdtemp(join(tmpdir(), "greyfield-persona-save-"));
    try {
      const path = join(dir, "saved.yaml");
      await saveCharacterPersona(path, {
        name: "Mira",
        userAddress: "partner",
        background: "A focused desktop companion.",
        personality: "calm, precise",
        speakingStyle: "short sentences with warm callbacks",
        tone: "calm",
        boundaries: ["Do not browse silently.", "Ask before risky actions."],
        greeting: "Welcome back.",
        expressionMap: {
          neutral: "default"
        }
      });

      const raw = await readFile(path, "utf8");
      expect(raw).toContain("name: Mira");
      expect(raw).toContain("userAddress: partner");
      expect(raw).toContain("speakingStyle: short sentences with warm callbacks");
      await expect(loadCharacterPersona(path)).resolves.toMatchObject({
        name: "Mira",
        userAddress: "partner",
        boundaries: ["Do not browse silently.", "Ask before risky actions."]
      });
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("preserves unknown top-level YAML data while overwriting managed persona fields", async () => {
    const dir = await mkdtemp(join(tmpdir(), "greyfield-persona-preserve-"));
    try {
      const path = join(dir, "advanced.yaml");
      await writeFile(
        path,
        [
          "# keep persona metadata",
          "name: Old Greyfield",
          "userAddress: old-user",
          "background: Old background.",
          "personality: old personality",
          "speakingStyle: old style",
          "tone: old tone",
          "boundaries:",
          "  - Old boundary.",
          "greeting: Old greeting.",
          "expressionMap:",
          "  neutral: default",
          "defaultExpression: neutral",
          "voiceProfile:",
          "  id: voice-keep",
          "metadata:",
          "  owner: local-user",
          "customFutureField:",
          "  enabled: true",
          "prompt:",
          "  identity: Legacy identity should remain as source data.",
          "  style:",
          "    - Legacy style should remain as source data."
        ].join("\n"),
        "utf8"
      );

      await saveCharacterPersona(path, {
        name: "Mira",
        userAddress: "captain",
        background: "A focused desktop companion.",
        personality: "calm, precise",
        speakingStyle: "short sentences with warm callbacks",
        tone: "calm",
        boundaries: ["Do not browse silently.", "Ask before risky actions."],
        greeting: "Welcome back.",
        expressionMap: {
          neutral: "default",
          speaking: "smile"
        }
      });

      const raw = await readFile(path, "utf8");
      expect(raw).toContain("# keep persona metadata");
      expect(raw).toContain("name: Mira");
      expect(raw).toContain("userAddress: captain");
      expect(raw).toContain("defaultExpression: neutral");
      expect(raw).toContain("voiceProfile:");
      expect(raw).toContain("id: voice-keep");
      expect(raw).toContain("metadata:");
      expect(raw).toContain("owner: local-user");
      expect(raw).toContain("customFutureField:");
      expect(raw).toContain("enabled: true");
      expect(raw).toContain("prompt:");
      expect(raw).toContain("Legacy identity should remain as source data.");
      await expect(loadCharacterPersona(path)).resolves.toMatchObject({
        name: "Mira",
        userAddress: "captain",
        speakingStyle: "short sentences with warm callbacks",
        boundaries: ["Do not browse silently.", "Ask before risky actions."],
        expressionMap: {
          neutral: "default",
          speaking: "smile"
        }
      });
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("reports readable schema errors for broken persona files", async () => {
    const dir = await mkdtemp(join(tmpdir(), "greyfield-persona-bad-"));
    try {
      const path = join(dir, "bad.yaml");
      await writeFile(path, "name: 123\nboundaries: nope\nexpressionMap: {}\n", "utf8");

      await expect(loadCharacterPersona(path)).rejects.toThrow(`Character persona name must be a non-empty string: ${path}`);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});
