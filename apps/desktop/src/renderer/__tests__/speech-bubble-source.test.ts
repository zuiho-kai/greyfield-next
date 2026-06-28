import { describe, expect, it } from "vitest";
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
});
