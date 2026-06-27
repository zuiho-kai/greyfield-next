import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { JsonlSessionStore } from "../jsonl-session-store";
import { JsonlSummarySegmentStore, MemorySourceDrilldownStore } from "../jsonl-summary-segment-store";

describe("MemorySourceDrilldownStore", () => {
  it("resolves raw source turns from summary ids, recall items, and sourceTurnIds", async () => {
    const dir = await mkdtemp(join(tmpdir(), "greyfield-source-drilldown-"));
    try {
      const sessions = new JsonlSessionStore("session-a", join(dir, "session.jsonl"));
      const summaries = new JsonlSummarySegmentStore(join(dir, "summaries.jsonl"));
      const drilldown = new MemorySourceDrilldownStore({
        sessionStore: sessions,
        summarySegmentStore: summaries
      });

      const firstTurn = await sessions.append({
        role: "user",
        content: "那个游戏很差：战斗卡顿，存档还会损坏。",
        createdAt: "2026-06-26T01:00:00.000Z"
      });
      const secondTurn = await sessions.append({
        role: "assistant",
        content: "我记下了：差评点是战斗卡顿和坏档。",
        createdAt: "2026-06-26T01:00:01.000Z"
      });
      const summary = await summaries.append({
        threadId: "thread-a",
        sessionId: "session-a",
        summary: "User disliked a game because combat stuttered and saves broke.",
        recallCues: ["game", "bad"],
        sourceTurns: [
          {
            sessionId: "session-a",
            turnId: firstTurn.id,
            role: firstTurn.role,
            createdAt: firstTurn.createdAt
          },
          {
            sessionId: "session-a",
            turnId: secondTurn.id,
            role: secondTurn.role,
            createdAt: secondTurn.createdAt
          }
        ],
        createdAt: "2026-06-26T01:00:02.000Z"
      });

      await sessions.append({
        role: "user",
        content: "后面聊了别的。",
        createdAt: "2026-06-26T01:00:03.000Z"
      });

      await expect(drilldown.resolve({ kind: "summary-segment", id: summary.id })).resolves.toMatchObject({
        source: { kind: "summary-segment", id: "summary-1" },
        sourceTurnIds: [firstTurn.id, secondTurn.id],
        turns: [
          { id: firstTurn.id, content: "那个游戏很差：战斗卡顿，存档还会损坏。" },
          { id: secondTurn.id, content: "我记下了：差评点是战斗卡顿和坏档。" }
        ],
        missingTurnIds: []
      });

      await expect(
        drilldown.resolve({
          kind: "recall-context-item",
          item: {
            kind: "summary-segment",
            id: summary.id,
            sourceTurnIds: [secondTurn.id, "missing-turn", firstTurn.id]
          }
        })
      ).resolves.toMatchObject({
        source: { kind: "summary-segment", id: "summary-1" },
        sourceTurnIds: [secondTurn.id, "missing-turn", firstTurn.id],
        turns: [
          { id: secondTurn.id, content: "我记下了：差评点是战斗卡顿和坏档。" },
          { id: firstTurn.id, content: "那个游戏很差：战斗卡顿，存档还会损坏。" }
        ],
        missingTurnIds: ["missing-turn"]
      });

      expect(await summaries.delete(summary.id)).toBe(true);
      await expect(drilldown.resolve({ kind: "summary-segment", id: summary.id })).resolves.toBeNull();
      await expect(drilldown.resolve({ kind: "source-turns", sourceTurnIds: [firstTurn.id] })).resolves.toMatchObject({
        source: { kind: "source-turns" },
        sourceTurnIds: [firstTurn.id],
        turns: [{ id: firstTurn.id, content: "那个游戏很差：战斗卡顿，存档还会损坏。" }],
        missingTurnIds: []
      });
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});
