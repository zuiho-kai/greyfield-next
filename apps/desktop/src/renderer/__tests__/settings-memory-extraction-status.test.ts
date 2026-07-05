import { describe, expect, it } from "vitest";
import { createInitialDesktopRendererState } from "../desktop-runtime-bridge";
import { describeMemoryExtractionStatus } from "../settings-memory-extraction-status";

describe("describeMemoryExtractionStatus", () => {
  it("shows the local memory system as active when the memory model is off", () => {
    const state = createInitialDesktopRendererState();

    expect(describeMemoryExtractionStatus(state, "en-US")).toEqual({
      tone: "standard",
      label: "Basic memory on",
      detail:
        "Basic memory saves explicit facts from local chat, such as names, dates, and preferences. Recall itself does not use a model: before each reply, Greyfield locally scores memory items by cues and keywords, then inserts the matching text into the prompt context."
    });
  });

  it("shows enhanced memory as ready when the memory model toggle is on", () => {
    const state = createInitialDesktopRendererState();
    state.settings.llmAtomExtractionEnabled = true;

    expect(describeMemoryExtractionStatus(state)).toMatchObject({
      tone: "ready",
      label: "已准备好记住更多细节"
    });
  });

  it("uses Chinese for the default locale", () => {
    const status = describeMemoryExtractionStatus(createInitialDesktopRendererState());

    expect(status).toMatchObject({
      tone: "standard",
      label: "基础记忆开启"
    });
  });
});
