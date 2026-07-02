import { describe, expect, it } from "vitest";
import { join, resolve } from "node:path";
import {
  buildV1VisualAcceptanceSummary,
  readAvatarSectionEvidenceFromDocument,
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
      controls: {
        role: "controls",
        viewport: { width: 420, height: 140 },
        hasPanel: true,
        panelWithinViewport: true,
        draggable: true,
        activeButtonContrastOk: true
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
        speechBubbleAvoidsModel: true,
        bubbleText: "你好，我醒着。"
      },
      settings: {
        avatarNavVisible: true,
        modelServiceNavVisible: true,
        genericModelNavAbsent: true,
        navFirstGlanceOrderCorrect: true,
        modelServiceActiveAfterClick: true,
        avatarActiveAfterClick: true,
        live2dAvatarSectionVisible: true,
        providerPreviewVisible: true,
        providerPreviewInViewport: true,
        taskModelSlotsVisible: true,
        memoryExtractionVisible: true,
        memoryExtractionDisabledVisible: true,
        memoryExtractionManualCandidateControlsAbsent: true,
        settingsShellVisible: true,
        noHorizontalOverflow: true,
        narrowNoHorizontalOverflow: true,
        windowControlsUsable: true,
        viewportWidth: 820,
        scrollWidth: 820
      },
      artifacts: [
        { name: "pet-initial.png", path: "artifact-root/pet-initial.png", review: "Pet shell" },
        { name: "controls-initial.png", path: "artifact-root/controls-initial.png", review: "Controls shell" },
        { name: "controls-active-state.png", path: "artifact-root/controls-active-state.png", review: "Controls active" },
        { name: "chat-after-reply.png", path: "artifact-root/chat-after-reply.png", review: "Chat reply" },
        {
          name: "settings-first-glance-nav.png",
          path: "artifact-root/settings-first-glance-nav.png",
          review: "First-glance Settings nav"
        },
        {
          name: "settings-model-service-task-models.png",
          path: "artifact-root/settings-model-service-task-models.png",
          review: "Model service task models"
        },
        {
          name: "settings-live2d-avatar.png",
          path: "artifact-root/settings-live2d-avatar.png",
          review: "Live2D avatar"
        },
        {
          name: "settings-memory-extraction.png",
          path: "artifact-root/settings-memory-extraction.png",
          review: "Memory extraction"
        },
        {
          name: "settings-window-controls.png",
          path: "artifact-root/settings-window-controls.png",
          review: "Window controls"
        }
      ]
    });

    expect(summary.ok).toBe(true);
    expect(summary.artifacts.map((artifact) => artifact.name)).toEqual(
      expect.arrayContaining([
        "pet-initial.png",
        "chat-after-reply.png",
        "settings-first-glance-nav.png",
        "settings-model-service-task-models.png",
        "settings-live2d-avatar.png"
      ])
    );
    expect(summary.visualReviewRequired.join("\n")).toContain("pet-initial.png");
    expect(summary.visualReviewRequired.join("\n")).toContain("controls-initial.png");
    expect(summary.visualReviewRequired.join("\n")).toContain("controls-active-state.png");
    expect(summary.visualReviewRequired.join("\n")).toContain("settings-first-glance-nav.png");
    expect(summary.visualReviewRequired.join("\n")).toContain("settings-model-service-task-models.png");
    expect(summary.visualReviewRequired.join("\n")).toContain("settings-live2d-avatar.png");
    expect(summary.visualReviewRequired.join("\n")).toContain("distinct Live2D/avatar");
    expect(summary.visualReviewRequired.join("\n")).toContain("task models");
    expect(summary.visualReviewRequired.join("\n")).toContain("settings-memory-extraction.png");
    expect(summary.visualReviewRequired.join("\n")).toContain("settings-window-controls.png");
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

  it("recognizes the Live2D avatar section from stable controls instead of exact copy", () => {
    const cleanup = installAvatarEvidenceDom({
      activeButtonText: "Avatar appearance",
      live2DOptionCount: 2,
      actionButtonCount: 2
    });

    try {
      expect(readAvatarSectionEvidenceFromDocument()).toEqual({
        avatarActiveAfterClick: true,
        live2dAvatarSectionVisible: true
      });
    } finally {
      cleanup();
    }
  });

  it("rejects non-avatar sections even when generic model wording is active", () => {
    const cleanup = installAvatarEvidenceDom({
      activeButtonText: "Model service",
      live2DOptionCount: 0,
      actionButtonCount: 0
    });

    try {
      expect(readAvatarSectionEvidenceFromDocument()).toEqual({
        avatarActiveAfterClick: false,
        live2dAvatarSectionVisible: false
      });
    } finally {
      cleanup();
    }
  });
});

function installAvatarEvidenceDom(input: {
  activeButtonText: string;
  live2DOptionCount: number;
  actionButtonCount: number;
}): () => void {
  const originalDocument = globalThis.document;
  const originalWindow = globalThis.window;
  const activeButton = createVisibleElement({
    textContent: input.activeButtonText,
    getAttribute: (name: string) => (name === "aria-current" ? "true" : null)
  });
  const live2DSelect = createVisibleElement({
    options: Array.from({ length: input.live2DOptionCount })
  });
  const live2DModelNote = createVisibleElement();
  const actionButtons = Array.from({ length: input.actionButtonCount }, () => createVisibleElement());
  const modelSection = createVisibleElement({
    querySelector: (selector: string) => {
      if (selector === 'select[aria-label="Live2D model"]') {
        return live2DSelect;
      }
      if (selector === ".live2d-model-note") {
        return live2DModelNote;
      }
      return null;
    },
    querySelectorAll: (selector: string) => (selector === ".settings-actions button" ? actionButtons : [])
  });
  const documentStub = {
    querySelector: (selector: string) => {
      if (selector === ".settings-nav__button--active") {
        return activeButton;
      }
      if (selector === '[data-settings-section="model"]') {
        return modelSection;
      }
      return null;
    }
  };

  Object.defineProperty(globalThis, "document", { configurable: true, value: documentStub });
  Object.defineProperty(globalThis, "window", { configurable: true, value: { innerHeight: 600, innerWidth: 800 } });

  return () => {
    Object.defineProperty(globalThis, "document", { configurable: true, value: originalDocument });
    Object.defineProperty(globalThis, "window", { configurable: true, value: originalWindow });
  };
}

function createVisibleElement(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    textContent: "",
    getAttribute: () => null,
    getBoundingClientRect: () => ({ width: 120, height: 32, bottom: 120, right: 240, top: 88, left: 32 }),
    querySelector: () => null,
    querySelectorAll: () => [],
    ...overrides
  };
}
