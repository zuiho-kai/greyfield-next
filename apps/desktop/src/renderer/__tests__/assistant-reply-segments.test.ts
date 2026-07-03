import { describe, expect, it } from "vitest";
import {
  assistantReplySegmentCharacterLimit,
  normalizeAssistantReplyText,
  splitAssistantReplyForDisplay
} from "../assistant-reply-segments";

describe("assistant reply display segments", () => {
  it("keeps short spoken replies as one readable segment", () => {
    expect(splitAssistantReplyForDisplay("你好，我在。")).toEqual(["你好，我在。"]);
  });

  it("splits long assistant replies on natural sentence boundaries without losing content", () => {
    const reply = [
      "我先把重点拆开说。",
      "第一步，先确认现在卡住的是 Chat 长回复，不是桌宠气泡策略。",
      "第二步，把回答保持成短句，这样用户扫一眼就知道 Greyfield 在说什么。",
      "第三步，正常长回复应该像陪伴聊天一样分成几次轻量表达，而不是把所有说明塞进一个巨大气泡。",
      "第四步，如果模型真的吐出大段文字，Chat 再用展开作为兜底。",
      "第五步，分段后的每一段都应该能独立阅读，也要能拼回完整回答。",
      "第六步，这样宠物气泡和聊天窗口都会更接近真实陪伴聊天节奏。"
    ].join("");

    const segments = splitAssistantReplyForDisplay(reply);

    expect(segments.length).toBeGreaterThan(1);
    expect(segments.every((segment) => segment.length <= assistantReplySegmentCharacterLimit)).toBe(true);
    expect(normalizeAssistantReplyText(segments.join(""))).toBe(normalizeAssistantReplyText(reply));
  });

  it("keeps an extreme unbroken span as one segment so Chat disclosure remains the fallback", () => {
    const unbroken = "x".repeat(600);

    expect(splitAssistantReplyForDisplay(unbroken)).toEqual([unbroken]);
  });

  it("splits an oversized individual sentence into short sub-segments", () => {
    const sentence = [
      "This is one deliberately long spoken sentence with natural punctuation at the end,",
      "but it contains enough words to exceed the display segment limit before the sentence boundary arrives",
      "so the renderer must still keep each pet-sized segment short."
    ].join(" ");

    const segments = splitAssistantReplyForDisplay(sentence);

    expect(segments.length).toBeGreaterThan(1);
    expect(segments.every((segment) => segment.length <= assistantReplySegmentCharacterLimit)).toBe(true);
    expect(normalizeAssistantReplyText(segments.join(" "))).toBe(normalizeAssistantReplyText(sentence));
  });
});
