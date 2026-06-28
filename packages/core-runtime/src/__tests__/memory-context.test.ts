import { describe, expect, it } from "vitest";
import {
  buildMemorySourceDrilldownResult,
  buildRecallContext,
  createSummarySegmentDraft,
  formatRecallContextForPrompt,
  normalizeSummarySegment,
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
    expect(draft.sourceTurnIds).toEqual(["session-a-1", "session-a-2"]);
    expect(draft.recallCues).toContain("hiyori");
  });

  it("normalizes legacy sourceTurns-only summaries with canonical sourceTurnIds", () => {
    const segment = normalizeSummarySegment({
      id: "summary-1",
      threadId: "thread-a",
      sessionId: "session-a",
      summary: "User disliked a game because combat stuttered and saves broke.",
      recallCues: ["game"],
      sourceTurns: [
        {
          sessionId: "session-a",
          turnId: "session-a-1",
          role: "user",
          createdAt: "2026-06-26T01:00:00.000Z"
        }
      ],
      createdAt: "2026-06-26T01:00:01.000Z"
    });

    const context = buildRecallContext({
      input: "game 为什么差？",
      summarySegments: [segment]
    });

    expect(segment.sourceTurnIds).toEqual(["session-a-1"]);
    expect(context.items[0]?.sourceTurnIds).toEqual(["session-a-1"]);
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
    expect(context.skipped).toEqual([{ kind: "summary-segment", id: "summary-2", reason: "over budget" }]);
    expect(context.budget.itemCount).toEqual({ used: 1, limit: 1, skipped: 1 });
  });

  it("skips disabled summary segments so user-disabled memory is not injected into prompts", () => {
    const context = buildRecallContext({
      input: "Hiyori 还是默认模型吗？",
      summarySegments: [
        {
          ...makeSegment("summary-1", "The user prefers the Hiyori Live2D model.", ["hiyori"], ["session-a-1"]),
          disabled: true
        }
      ]
    });

    expect(context.items).toEqual([]);
    expect(context.skipped).toEqual([{ kind: "summary-segment", id: "summary-1", reason: "disabled" }]);
    expect(formatRecallContextForPrompt(context)).toBe("");
  });

  it("counts rendered metadata against the recall character budget", () => {
    const segment = makeSegment("summary-1", "Hiyori.", ["hiyori"], ["session-a-1"]);
    const renderedLength = formatRecallContextForPrompt({
      items: [
        {
          kind: "summary-segment",
          id: segment.id,
          summary: segment.summary,
          recallCues: segment.recallCues,
          sourceTurnIds: segment.sourceTurns.map((turn) => turn.turnId),
          reason: "cue:hiyori",
          score: 1
        }
      ],
      skipped: []
    }).length;

    const context = buildRecallContext({
      input: "Hiyori",
      summarySegments: [segment],
      maxCharacters: renderedLength - 1
    });

    expect(segment.summary.length).toBeLessThan(renderedLength - 1);
    expect(context.items).toEqual([]);
    expect(context.skipped).toEqual([{ kind: "summary-segment", id: "summary-1", reason: "over budget" }]);
    expect(context.budget.characters).toEqual({ used: 0, limit: renderedLength - 1, skipped: 1 });
  });

  it("records irrelevant skipped summaries without exposing trace in prompt text", () => {
    const context = buildRecallContext({
      input: "明天香港会不会下雨？",
      summarySegments: [makeSegment("summary-1", "The user prefers Hiyori as the default model.", ["hiyori"], ["session-a-1"])]
    });

    expect(context.items).toEqual([]);
    expect(context.skipped).toEqual([{ kind: "summary-segment", id: "summary-1", reason: "irrelevant" }]);
    expect(context.budget).toMatchObject({
      itemCount: { used: 0, limit: 3, skipped: 0 },
      sourcePassages: { usedCharacters: 0, limitCharacters: 0, usedCount: 0, limitCount: 0, skippedCount: 0 }
    });
    expect(formatRecallContextForPrompt(context)).toBe("");
  });

  it("builds source drilldown results with missing raw turn ids surfaced", () => {
    const result = buildMemorySourceDrilldownResult({
      source: { kind: "summary-segment", id: "summary-1" },
      sourceTurnIds: ["session-a-1", "session-a-2", "session-a-1"],
      turns: [
        {
          id: "session-a-1",
          role: "user",
          content: "这个游戏很差，存档会坏。",
          createdAt: "2026-06-26T01:00:00.000Z"
        }
      ]
    });

    expect(result.sourceTurnIds).toEqual(["session-a-1", "session-a-2"]);
    expect(result.turns.map((turn) => turn.content)).toEqual(["这个游戏很差，存档会坏。"]);
    expect(result.missingTurnIds).toEqual(["session-a-2"]);
  });
});

function makeSegment(id: string, summary: string, recallCues: string[], sourceTurnIds: string[]): SummarySegment {
  return {
    id,
    threadId: "thread-a",
    sessionId: "session-a",
    summary,
    recallCues,
    sourceTurnIds,
    sourceTurns: sourceTurnIds.map((turnId) => ({
      sessionId: "session-a",
      turnId,
      role: "user",
      createdAt: "2026-06-26T01:00:00.000Z"
    })),
    createdAt: "2026-06-26T01:00:00.000Z"
  };
}
