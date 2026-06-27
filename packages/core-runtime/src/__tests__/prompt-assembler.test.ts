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
      atomRecallContext: {
        items: [
          {
            kind: "memory-atom",
            id: "atom-rose",
            type: "relationship_event",
            text: "Relationship event: the user marked the first meeting anniversary by giving Greyfield a rose.",
            sourceTurnIds: ["session-a-3"],
            matchedKeys: ["初遇"],
            reason: "alias:初遇",
            score: 80,
            ritualAction: "送玫瑰"
          }
        ],
        skipped: []
      },
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

    const systemContent = messages[0]?.content ?? "";
    expect(messages[0]?.role).toBe("system");
    expect(systemContent).toContain("Greyfield");
    expect(systemContent).toContain("V1 cannot control the desktop");
    expect(systemContent).toContain("User wants a Live2D desktop companion");
    expect(systemContent).toContain("Atom recall context:");
    expect(systemContent).toContain("atom-rose");
    expect(systemContent).toContain("Source turns: session-a-3");
    expect(systemContent).toContain("Ritual action: 送玫瑰");
    expect(systemContent).toContain("Recall context:");
    expect(systemContent).toContain("summary-1");
    expect(systemContent).toContain("Source turns: session-a-1, session-a-2");
    expect(systemContent.indexOf("Atom recall context:")).toBeLessThan(systemContent.indexOf("Recall context:"));
    expect(systemContent).toContain("thread-a");
    expect(messages.map((message) => message.content)).toEqual([
      expect.stringContaining("Recent focus"),
      "上次说要做桌宠。",
      "我记得，先让角色活起来。",
      "现在继续。"
    ]);
  });
});
