import { describe, expect, it } from "vitest";
import { createInitialDesktopRendererState } from "../desktop-runtime-bridge";
import { describeMemoryExtractionStatus } from "../settings-memory-extraction-status";

describe("describeMemoryExtractionStatus", () => {
  it("shows the local memory system as active when the memory model is off", () => {
    const state = createInitialDesktopRendererState();

    expect(describeMemoryExtractionStatus(state, "en-US")).toEqual({
      tone: "standard",
      label: "Local memory is on",
      detail:
        "Greyfield can save and reuse useful details from your chats. The Memory model enhancement is off, so it will not call an extra model to tidy new memories."
    });
  });

  it("shows enhanced memory as ready when the memory model toggle is on", () => {
    const state = createInitialDesktopRendererState();
    state.settings.llmAtomExtractionEnabled = true;

    expect(describeMemoryExtractionStatus(state)).toMatchObject({
      tone: "ready",
      label: "记忆模型增强已开启"
    });
  });

  it("uses Chinese for the default locale", () => {
    const status = describeMemoryExtractionStatus(createInitialDesktopRendererState());

    expect(status).toMatchObject({
      tone: "standard",
      label: "本地记忆已开启"
    });
  });
});
