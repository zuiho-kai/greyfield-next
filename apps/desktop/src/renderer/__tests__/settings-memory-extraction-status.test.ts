import { describe, expect, it } from "vitest";
import { createInitialDesktopRendererState } from "../desktop-runtime-bridge";
import { describeMemoryExtractionStatus } from "../settings-memory-extraction-status";

describe("describeMemoryExtractionStatus", () => {
  it("marks the memory system as in development regardless of the saved toggle", () => {
    const state = createInitialDesktopRendererState();
    state.settings.llmAtomExtractionEnabled = true;

    expect(describeMemoryExtractionStatus(state, "en-US")).toEqual({
      tone: "disabled",
      label: "In development",
      detail:
        "Memory is paused while recall is redesigned. Greyfield will not recall saved memory, write new memory, create summaries, or call the Memory model."
    });
  });

  it("uses Chinese for the default locale", () => {
    const status = describeMemoryExtractionStatus(createInitialDesktopRendererState());

    expect(status).toMatchObject({
      tone: "disabled",
      label: "开发中，暂不可用"
    });
  });
});
