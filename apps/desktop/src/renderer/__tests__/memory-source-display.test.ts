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
    expect(describeMemorySourceCount({ sourceIds: ["desktop-main-session-1"] }, "en-US")).toBe("1 saved source");
    expect(
      describeMemorySourceCount({
        sourcePassages: [
          makePassage({ status: "available", turnId: "desktop-main-session-1" }),
          makePassage({ status: "missing", turnId: "desktop-main-session-2" })
        ],
        sourceIds: ["desktop-main-session-1", "desktop-main-session-2"]
      }, "en-US")
    ).toBe("1 of 2 source passages ready");
  });

  it("uses ordinary speaker and status labels for source passages", () => {
    const userPassage = makePassage({ role: "user", createdAt: "2026-06-28T00:00:00.000Z" });
    const missingPassage = makePassage({ status: "missing", message: "Source turn is missing." });

    expect(describeSourcePassageHeading(userPassage, "en-US")).toBe("From you");
    expect(describeSourcePassageStatus(userPassage, "en-US")).toBe("Saved locally");
    expect(describeSourcePassageMeta(userPassage, "en-US")).toBe("Saved from conversation on 2026-06-28 00:00");
    expect(describeSourcePassageHeading(missingPassage, "en-US")).toBe("Original message unavailable");
    expect(describeSourcePassageStatus(missingPassage, "en-US")).toBe("Original message not found");
    expect(describeSourcePassageBody(missingPassage, undefined, "en-US")).toBe("Source turn is missing.");
  });

  it("bounds long source passages and labels empty available text", () => {
    const longPassage = makePassage({ text: "a".repeat(12) });
    const emptyPassage = makePassage({ text: "" });

    expect(describeSourcePassageBody(longPassage, 5)).toBe("aaaaa...");
    expect(isSourcePassageShortened(longPassage, 5)).toBe(true);
    expect(describeSourcePassageBody(emptyPassage, undefined, "en-US")).toBe("No message text is saved for this source.");
  });

  it("turns recall reasons into product language", () => {
    expect(describeRecallReason("cue:hiyori", "en-US")).toBe('Matched recall cue "hiyori"');
    expect(describeRecallReason("semantic_match", "en-US")).toBe("Semantic match");
    expect(describeRecallReason("", "en-US")).toBe("Matched this memory");
  });

  it("labels screen-aware memory sources as desktop visual context plus user confirmation", () => {
    const passage = makePassage({ observationSource: true, createdAt: "2026-06-30T00:00:00.000Z" });

    expect(describeSourcePassageMeta(passage, "en-US")).toBe(
      "Saved from conversation on 2026-06-30 00:00 · Source: desktop visual context + user confirmation"
    );
    expect(describeSourcePassageMeta(passage)).toBe("保存自 2026-06-30 00:00 的对话 · 来源：桌面视觉上下文 + 用户确认");
  });

  it("uses Chinese for the default locale", () => {
    const userPassage = makePassage({ role: "user", createdAt: "2026-06-28T00:00:00.000Z" });

    expect(describeMemorySourceCount({ sourceIds: ["desktop-main-session-1", "desktop-main-session-2"] })).toBe("已保存 2 个来源");
    expect(describeMemorySourceCount({ sourcePassages: [userPassage] })).toBe("1 个来源片段可查看");
    expect(describeSourcePassageHeading(userPassage)).toBe("来自你");
    expect(describeSourcePassageStatus(userPassage)).toBe("已本地保存");
    expect(describeSourcePassageMeta(userPassage)).toBe("保存自 2026-06-28 00:00 的对话");
    expect(describeSourcePassageBody(makePassage({ text: "" }))).toBe("这个来源没有保存消息文本。");
    expect(describeRecallReason("cue:hiyori")).toBe("命中召回线索「hiyori」");
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
