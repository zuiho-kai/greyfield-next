import { describe, expect, it } from "vitest";
import { assemblePrompt } from "../prompt-assembler";
import type { SessionTurn } from "../session-store";

describe("assemblePrompt", () => {
  it("injects persona, boundaries, memory, handoff, and recent turns", () => {
    const recent: SessionTurn[] = [
      { id: "1", role: "user", content: "上次说要做桌宠。", createdAt: "2026-05-23T00:00:00.000Z" },
      { id: "2", role: "assistant", content: "我记得，先让角色活起来。", createdAt: "2026-05-23T00:00:01.000Z" }
    ];

    const messages = assemblePrompt({
      persona: {
        name: "Greyfield",
        tone: "warm, concise, slightly playful",
        boundaries: ["V1 cannot control the desktop", "V1 cannot browse the web on its own"],
        expressionMap: {
          neutral: "default",
          thinking: "thinking"
        }
      },
      memory: "- User wants a Live2D desktop companion, not a task agent.",
      handoff: "Recent focus: make the character visible and interruptible.",
      recent,
      input: "现在继续。",
      sessionId: "session-a",
      threadId: "thread-a",
      recallContext: {
        items: [
          {
            kind: "summary-segment",
            id: "summary-1",
            summary: "Earlier chat established Hiyori as the preferred bundled model.",
            recallCues: ["hiyori", "model"],
            sourceTurnIds: ["session-a-1", "session-a-2"],
            reason: "cue:hiyori",
            score: 6
          }
        ],
        skipped: []
      }
    });

    expect(messages[0]?.role).toBe("system");
    expect(messages[0]?.content).toContain("Greyfield");
    expect(messages[0]?.content).toContain("V1 cannot control the desktop");
    expect(messages[0]?.content).toContain("User wants a Live2D desktop companion");
    expect(messages[0]?.content).toContain("Recall context:");
    expect(messages[0]?.content).toContain("summary-1");
    expect(messages[0]?.content).toContain("Source turns: session-a-1, session-a-2");
    expect(messages[0]?.content).toContain("thread-a");
    expect(messages.map((message) => message.content)).toEqual([
      expect.stringContaining("Recent focus"),
      "上次说要做桌宠。",
      "我记得，先让角色活起来。",
      "现在继续。"
    ]);
  });
});
