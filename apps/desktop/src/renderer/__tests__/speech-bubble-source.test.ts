import { describe, expect, it } from "vitest";
import { assistantReplySegmentCharacterLimit } from "../assistant-reply-segments";
import { resolveSpeechBubbleSourceText } from "../speech-bubble-source";

describe("resolveSpeechBubbleSourceText", () => {
  it("does not show the previous assistant reply after a new user message starts", () => {
    expect(
      resolveSpeechBubbleSourceText({
        assistantDraft: "",
        status: "thinking",
        messages: [
          { role: "user", text: "first" },
          { role: "assistant", text: "old reply" },
          { role: "user", text: "second" }
        ]
      })
    ).toBe("");
  });

  it("shows the active assistant draft instead of the previous final reply", () => {
    expect(
      resolveSpeechBubbleSourceText({
        assistantDraft: "new reply",
        status: "speaking",
        messages: [
          { role: "user", text: "first" },
          { role: "assistant", text: "old reply" },
          { role: "user", text: "second" }
        ]
      })
    ).toBe("new reply");
  });

  it("shows proactive pet text without needing an assistant chat message", () => {
    expect(
      resolveSpeechBubbleSourceText({
        assistantDraft: "",
        proactiveMessageText: "It's raining again. I remembered our hotpot night at home.",
        status: "idle",
        messages: []
      })
    ).toBe("It's raining again. I remembered our hotpot night at home.");
  });

  it("does not show proactive text while a normal reply is active", () => {
    expect(
      resolveSpeechBubbleSourceText({
        assistantDraft: "",
        proactiveMessageText: "It's raining again. I remembered our hotpot night at home.",
        status: "thinking",
        messages: []
      })
    ).toBe("");
  });

  it("keeps the latest assistant reply visible after the turn completes", () => {
    expect(
      resolveSpeechBubbleSourceText({
        assistantDraft: "",
        status: "idle",
        messages: [
          { role: "user", text: "first" },
          { role: "assistant", text: "latest reply" }
        ]
      })
    ).toBe("latest reply");
  });

  it("uses the latest natural reply segment for the final pet bubble text", () => {
    const longReply = [
      "我先短短拆开说。",
      "第一段解释为什么 Chat 不能再用一整块长文本吞掉窗口。",
      "第二段说明 Greyfield 应该像陪伴聊天一样用短句回应。",
      "第三段继续补充，长内容可以进入完整 Chat 历史，但默认阅读节奏要轻一些。",
      "第四段强调桌宠气泡不是文档阅读器，它只负责当前这一下陪伴感。",
      "第五段用来确保这条回复超过展示分段阈值，测试能真正覆盖多段路径。",
      "最后一段留给桌宠气泡显示，保持轻一点。"
    ].join("");

    const source = resolveSpeechBubbleSourceText({
        assistantDraft: "",
        status: "idle",
        messages: [
          { role: "user", text: "说说新的回复节奏" },
          { role: "assistant", text: longReply }
        ]
      });

    expect(source).toContain("最后一段留给桌宠气泡显示");
    expect(source).not.toContain("我先短短拆开说");
    expect(source.length).toBeLessThanOrEqual(assistantReplySegmentCharacterLimit);
  });
});
