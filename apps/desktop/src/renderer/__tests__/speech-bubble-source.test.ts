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
