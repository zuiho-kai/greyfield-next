import { describe, expect, it } from "vitest";
import { createInitialDesktopRendererState } from "../desktop-runtime-bridge";
import {
  describeMemoryExtractionStatus,
  isMemoryExtractionToggleChecked
} from "../settings-memory-extraction-status";

describe("describeMemoryExtractionStatus", () => {
  it("shows long-term memory as paused when the desktop capability is off", () => {
    const state = createInitialDesktopRendererState();

    expect(describeMemoryExtractionStatus(state, "en-US")).toEqual({
      tone: "disabled",
      label: "Long-term memory is paused",
      detail: "The desktop runtime is not writing or recalling long-term memory. Recent message continuity is separate and remains bounded."
    });
  });

  it("keeps the paused capability authoritative over a saved extraction toggle", () => {
    const state = createInitialDesktopRendererState();
    state.settings.llmAtomExtractionEnabled = true;

    expect(describeMemoryExtractionStatus(state)).toMatchObject({
      tone: "disabled",
      label: "长期记忆当前暂停"
    });
    expect(isMemoryExtractionToggleChecked(state)).toBe(false);

    state.sessionContinuity.longTermMemoryEnabled = true;
    expect(isMemoryExtractionToggleChecked(state)).toBe(true);
  });

  it("uses Chinese for the default locale", () => {
    const status = describeMemoryExtractionStatus(createInitialDesktopRendererState());

    expect(status).toMatchObject({
      tone: "disabled",
      label: "长期记忆当前暂停"
    });
  });

  it("retains the existing extraction status logic when the capability is explicitly available", () => {
    const state = createInitialDesktopRendererState();
    Object.assign(state, {
      sessionContinuity: {
        restoredRecentMessageCount: 0,
        longTermMemoryEnabled: true
      }
    });

    expect(describeMemoryExtractionStatus(state, "en-US")).toMatchObject({
      tone: "standard"
    });
  });
});
