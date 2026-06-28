import { describe, expect, it } from "vitest";
import {
  describeMemorySourceCount,
  describeRecallReason,
  describeSourcePassageBody,
  describeSourcePassageHeading,
  describeSourcePassageMeta,
  describeSourcePassageStatus,
  isSourcePassageShortened
} from "../memory-source-display";
import type { DesktopMemorySourcePassage } from "../../shared/ipc";

describe("memory source display helpers", () => {
  it("summarizes source availability without exposing raw turn ids", () => {
    expect(describeMemorySourceCount({ sourceIds: ["desktop-main-session-1"] })).toBe("1 saved source");
    expect(
      describeMemorySourceCount({
        sourcePassages: [
          makePassage({ status: "available", turnId: "desktop-main-session-1" }),
          makePassage({ status: "missing", turnId: "desktop-main-session-2" })
        ],
        sourceIds: ["desktop-main-session-1", "desktop-main-session-2"]
      })
    ).toBe("1 of 2 source passages ready");
  });

  it("uses ordinary speaker and status labels for source passages", () => {
    const userPassage = makePassage({ role: "user", createdAt: "2026-06-28T00:00:00.000Z" });
    const missingPassage = makePassage({ status: "missing", message: "Source turn is missing." });

    expect(describeSourcePassageHeading(userPassage)).toBe("From you");
    expect(describeSourcePassageStatus(userPassage)).toBe("Saved locally");
    expect(describeSourcePassageMeta(userPassage)).toBe("Saved from conversation on 2026-06-28 00:00");
    expect(describeSourcePassageHeading(missingPassage)).toBe("Original message unavailable");
    expect(describeSourcePassageStatus(missingPassage)).toBe("Original message not found");
    expect(describeSourcePassageBody(missingPassage)).toBe("Source turn is missing.");
  });

  it("bounds long source passages and labels empty available text", () => {
    const longPassage = makePassage({ text: "a".repeat(12) });
    const emptyPassage = makePassage({ text: "" });

    expect(describeSourcePassageBody(longPassage, 5)).toBe("aaaaa...");
    expect(isSourcePassageShortened(longPassage, 5)).toBe(true);
    expect(describeSourcePassageBody(emptyPassage)).toBe("No message text is saved for this source.");
  });

  it("turns recall reasons into product language", () => {
    expect(describeRecallReason("cue:hiyori")).toBe('Matched recall cue "hiyori"');
    expect(describeRecallReason("semantic_match")).toBe("Semantic match");
    expect(describeRecallReason("")).toBe("Matched this memory");
  });
});

function makePassage(overrides: Partial<DesktopMemorySourcePassage> = {}): DesktopMemorySourcePassage {
  return {
    sessionId: "desktop-main-session",
    turnId: "desktop-main-session-1",
    status: "available",
    role: "assistant",
    text: "Saved source text.",
    ...overrides
  };
}
