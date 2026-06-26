import { describe, expect, it } from "vitest";
import { formatSpeechBubbleText } from "../speech-bubble-text";

describe("formatSpeechBubbleText", () => {
  it("normalizes whitespace for compact pet-window display", () => {
    expect(formatSpeechBubbleText("  你好，\n我醒着。   现在可以继续做桌宠了。  ")).toBe(
      "你好， 我醒着。 现在可以继续做桌宠了。"
    );
  });

  it("keeps long replies short enough for the bubble while preserving chat as the full surface", () => {
    const text = "这是一段会流式输出到桌宠气泡里的很长回复，用来证明气泡不会尝试承载完整聊天历史。".repeat(4);

    const formatted = formatSpeechBubbleText(text, 48);

    expect(formatted).toHaveLength(48);
    expect(formatted.endsWith("...")).toBe(true);
  });

  it("uses a short default preview so the pet bubble stays subtitle-sized", () => {
    const text = "这是一段会流式输出到桌宠气泡里的很长回复，用来证明气泡只是短字幕，完整内容应该留在聊天窗口里。".repeat(2);

    const formatted = formatSpeechBubbleText(text);

    expect(formatted).toHaveLength(72);
    expect(formatted.endsWith("...")).toBe(true);
  });
});
