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
        userAddress: "captain",
        background: "A local Live2D companion with persistent memory.",
        personality: "warm, observant, and steady",
        speakingStyle: "short spoken replies with gentle humor",
        greeting: "Welcome back.",
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
        skipped: [],
        budget: {
          itemCount: { used: 1, limit: 4, skipped: 0 },
          characters: { used: 0, limit: 1400, skipped: 0 },
          sourcePassages: { usedCharacters: 0, limitCharacters: 0, usedCount: 0, limitCount: 0, skippedCount: 0 }
        }
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
        skipped: [],
        budget: {
          itemCount: { used: 1, limit: 3, skipped: 0 },
          characters: { used: 0, limit: 1200, skipped: 0 },
          sourcePassages: { usedCharacters: 0, limitCharacters: 0, usedCount: 0, limitCount: 0, skippedCount: 0 }
        }
      }
    });

    const systemContent = typeof messages[0]?.content === "string" ? messages[0].content : "";
    expect(messages[0]?.role).toBe("system");
    expect(systemContent).toContain("Greyfield");
    expect(systemContent).toContain("User address: captain");
    expect(systemContent).toContain("A local Live2D companion with persistent memory.");
    expect(systemContent).toContain("warm, observant, and steady");
    expect(systemContent).toContain("short spoken replies with gentle humor");
    expect(systemContent).toContain("Welcome back.");
    expect(systemContent).toContain("V1 cannot control the desktop");
    expect(systemContent).toContain("User wants a Live2D desktop companion");
    expect(systemContent).toContain("Long-term recall context:");
    expect(systemContent).toContain("Source-linked relationship memory");
    expect(systemContent).not.toContain("atom-rose");
    expect(systemContent).not.toContain("memory-atom");
    expect(systemContent).toContain("Source turns: session-a-3");
    expect(systemContent).toContain("Ritual action: 送玫瑰");
    expect(systemContent).toContain("Recall context:");
    expect(systemContent).toContain("summary-1");
    expect(systemContent).toContain("Source turns: session-a-1, session-a-2");
    expect(systemContent.indexOf("Long-term recall context:")).toBeLessThan(systemContent.indexOf("Recall context:"));
    expect(systemContent).toContain("thread-a");
    expect(messages.map((message) => (typeof message.content === "string" ? message.content : ""))).toEqual([
      expect.stringContaining("Recent focus"),
      "上次说要做桌宠。",
      "我记得，先让角色活起来。",
      "现在继续。"
    ]);
  });

  it("describes screen awareness as temporary desktop visual context", () => {
    const messages = assemblePrompt({
      persona: { name: "Greyfield", tone: "alive", boundaries: [], expressionMap: {} },
      memory: "",
      handoff: "",
      recent: [],
      input: "看一下桌面",
      inputAttachments: [
        {
          id: "screen-frame-1",
          dataUrl: "data:image/png;base64,QQ==",
          mimeType: "image/png",
          createdAt: "2026-06-30T00:00:00.000Z",
          source: "observation-frame"
        }
      ],
      observation: {
        kind: "visual-observation",
        mode: "normal",
        frameCount: 1,
        dedupedFrameCount: 1,
        source: "desktop-screen-awareness"
      },
      sessionId: "session-screen",
      threadId: "thread-screen"
    });

    const systemContent = typeof messages[0]?.content === "string" ? messages[0].content : "";
    expect(systemContent).toContain("recent desktop visual context from Screen awareness mode");
    expect(systemContent).toContain("Raw screenshots, frame data, and local file paths are temporary input only.");
    expect(systemContent).not.toContain("user-requested screenshot");
    expect(messages.at(-1)?.content).toEqual([
      { type: "text", text: "看一下桌面" },
      { type: "image_url", image_url: { url: "data:image/png;base64,QQ==", detail: "low" } }
    ]);
  });
});
