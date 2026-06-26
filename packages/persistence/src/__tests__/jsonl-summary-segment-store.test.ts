import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { JsonlSessionStore } from "../jsonl-session-store";
import { JsonlSummarySegmentStore } from "../jsonl-summary-segment-store";

describe("JsonlSummarySegmentStore", () => {
  it("persists source-linked summary segments without replacing raw session turns", async () => {
    const dir = await mkdtemp(join(tmpdir(), "greyfield-summary-segments-"));
    const sessionPath = join(dir, "session.jsonl");
    const summaryPath = join(dir, "summaries.jsonl");
    try {
      const sessions = new JsonlSessionStore("session-a", sessionPath);
      const firstTurn = await sessions.append({
        role: "user",
        content: "我喜欢 Hiyori 模型。",
        createdAt: "2026-06-26T01:00:00.000Z"
      });
      const secondTurn = await sessions.append({
        role: "assistant",
        content: "我会把 Hiyori 作为模型偏好。",
        createdAt: "2026-06-26T01:00:01.000Z"
      });

      const summaries = new JsonlSummarySegmentStore(summaryPath);
      const stored = await summaries.append({
        threadId: "thread-a",
        sessionId: "session-a",
        summary: "User prefers the Hiyori Live2D model.",
        recallCues: ["hiyori", "live2d", "hiyori"],
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

      expect(stored).toMatchObject({
        id: "summary-1",
        threadId: "thread-a",
        sessionId: "session-a",
        recallCues: ["hiyori", "live2d"]
      });
      expect(await summaries.list("thread-a")).toHaveLength(1);
      expect(await summaries.delete(stored.id)).toBe(true);
      expect(await summaries.list("thread-a")).toEqual([]);

      const rawSessionLines = (await readFile(sessionPath, "utf8")).trim().split(/\r?\n/);
      expect(rawSessionLines).toHaveLength(2);
      expect(rawSessionLines.join("\n")).toContain("我喜欢 Hiyori 模型");
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});
