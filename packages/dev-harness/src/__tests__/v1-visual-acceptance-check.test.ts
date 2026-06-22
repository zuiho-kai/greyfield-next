import { describe, expect, it } from "vitest";
import { join, resolve } from "node:path";
import {
  buildV1VisualAcceptanceSummary,
  resolveV1VisualAcceptanceArtifactDir
} from "../v1-visual-acceptance-check";

describe("V1 visual acceptance summary", () => {
  it("records screenshot artifacts and explicit manual review prompts", () => {
    const summary = buildV1VisualAcceptanceSummary({
      artifactDir: "artifact-root",
      pet: {
        role: "pet",
        viewport: { width: 420, height: 620 },
        bodyBackgroundColor: "rgba(0, 0, 0, 0)",
        bodyBackgroundImage: "none",
        hasControls: false,
        hasPetShell: true,
        hasGreyfieldApi: true
      },
      stage: {
        modelPoint: { x: 120, y: 240 },
        transparentPoint: { x: 4, y: 4 },
        modelHitVerified: true,
        transparentHitVerified: true
      },
      chat: {
        assistantReplyVisible: true,
        speechBubbleVisible: true,
        bubbleText: "你好，我醒着。"
      },
      settings: {
        providerPreviewVisible: true,
        settingsShellVisible: true
      },
      artifacts: [
        { name: "pet-initial.png", path: "artifact-root/pet-initial.png", review: "Pet shell" },
        { name: "chat-after-reply.png", path: "artifact-root/chat-after-reply.png", review: "Chat reply" },
        {
          name: "settings-provider-preview.png",
          path: "artifact-root/settings-provider-preview.png",
          review: "Provider preview"
        }
      ]
    });

    expect(summary.ok).toBe(true);
    expect(summary.artifacts.map((artifact) => artifact.name)).toEqual(
      expect.arrayContaining(["pet-initial.png", "chat-after-reply.png", "settings-provider-preview.png"])
    );
    expect(summary.visualReviewRequired.join("\n")).toContain("pet-initial.png");
    expect(summary.visualReviewRequired.join("\n")).toContain("settings-provider-preview.png");
  });

  it("keeps destructive cleanup inside the visual acceptance artifact root", () => {
    const artifactRoot = resolve(".cache", "greyfield-v1-visual-acceptance");

    expect(resolveV1VisualAcceptanceArtifactDir("")).toBe(join(artifactRoot, "latest"));
    expect(resolveV1VisualAcceptanceArtifactDir(join(artifactRoot, "manual-review"))).toBe(
      join(artifactRoot, "manual-review")
    );

    expect(() => resolveV1VisualAcceptanceArtifactDir(".")).toThrow(/must be a child/);
    expect(() => resolveV1VisualAcceptanceArtifactDir(resolve("."))).toThrow(/must be a child/);
    expect(() => resolveV1VisualAcceptanceArtifactDir(artifactRoot)).toThrow(/must be a child/);
    expect(() => resolveV1VisualAcceptanceArtifactDir(join(".cache", "outside-visual-root"))).toThrow(
      /must be a child/
    );
  });
});
