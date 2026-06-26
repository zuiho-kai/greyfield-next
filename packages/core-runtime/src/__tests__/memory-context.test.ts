import { describe, expect, it } from "vitest";
import {
  buildRecallContext,
  createSummarySegmentDraft,
  formatRecallContextForPrompt,
  type SummarySegment
} from "../memory-context";
import type { SessionTurn } from "../session-store";

describe("memory context", () => {
  it("creates extractive summary drafts with source turn references", () => {
    const turns: SessionTurn[] = [
      {
        id: "session-a-1",
        role: "user",
        content: "我想让 Greyfield 记住我喜欢 Hiyori 模型。",
        createdAt: "2026-06-26T01:00:00.000Z"
      },
      {
        id: "session-a-2",
        role: "assistant",
        content: "记下：默认 Live2D 模型偏好是 Hiyori。",
        createdAt: "2026-06-26T01:00:01.000Z"
      },
      {
        id: "session-a-3",
        role: "event",
        content: "window blurred",
        createdAt: "2026-06-26T01:00:02.000Z"
      }
    ];

    const draft = createSummarySegmentDraft({ sessionId: "session-a", turns });

    expect(draft.summary).toContain("我想让 Greyfield 记住我喜欢 Hiyori 模型");
    expect(draft.summary).toContain("默认 Live2D 模型偏好是 Hiyori");
    expect(draft.summary).not.toContain("window blurred");
    expect(draft.sourceTurns.map((turn) => turn.turnId)).toEqual(["session-a-1", "session-a-2"]);
    expect(draft.recallCues).toContain("hiyori");
  });

  it("recalls matching summary segments and records why they were selected", () => {
    const segments: SummarySegment[] = [
      makeSegment("summary-1", "The user prefers the Hiyori Live2D model.", ["hiyori", "live2d"], [
        "session-a-1"
      ]),
      makeSegment("summary-2", "The team discussed unrelated CI cleanup.", ["ci"], ["session-a-2"])
    ];

    const context = buildRecallContext({
      input: "默认模型还是 Hiyori 吗？",
      summarySegments: segments
    });

    expect(context.items).toHaveLength(1);
    expect(context.items[0]).toMatchObject({
      id: "summary-1",
      reason: "cue:hiyori",
      sourceTurnIds: ["session-a-1"]
    });
    expect(formatRecallContextForPrompt(context)).toContain("Source turns: session-a-1");
  });

  it("keeps recall within the item budget and reports skipped matches", () => {
    const context = buildRecallContext({
      input: "Hiyori Live2D 模型",
      summarySegments: [
        makeSegment("summary-1", "Hiyori model preference.", ["hiyori"], ["session-a-1"]),
        makeSegment("summary-2", "Live2D import discussion.", ["live2d"], ["session-a-2"])
      ],
      maxItems: 1
    });

    expect(context.items).toHaveLength(1);
    expect(context.skipped).toEqual([{ kind: "summary-segment", id: "summary-2", reason: "max_items" }]);
  });
});

function makeSegment(id: string, summary: string, recallCues: string[], sourceTurnIds: string[]): SummarySegment {
  return {
    id,
    threadId: "thread-a",
    sessionId: "session-a",
    summary,
    recallCues,
    sourceTurns: sourceTurnIds.map((turnId) => ({
      sessionId: "session-a",
      turnId,
      role: "user",
      createdAt: "2026-06-26T01:00:00.000Z"
    })),
    createdAt: "2026-06-26T01:00:00.000Z"
  };
}
