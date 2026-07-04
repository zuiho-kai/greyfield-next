import { describe, expect, it } from "vitest";
import { submitChatDraft } from "../chat-submit";

describe("submitChatDraft", () => {
  it("clears the composer before sending so provider failure can restore the retry draft", async () => {
    const draft = { value: "  错误 key 重试  " };

    await submitChatDraft(draft, async (text) => {
      expect(text).toBe("错误 key 重试");
      expect(draft.value).toBe("");
      draft.value = text;
    });

    expect(draft.value).toBe("错误 key 重试");
  });

  it("does not send blank drafts", async () => {
    const draft = { value: "   " };
    let sent = false;

    await submitChatDraft(draft, async () => {
      sent = true;
    });

    expect(sent).toBe(false);
    expect(draft.value).toBe("   ");
  });
});
