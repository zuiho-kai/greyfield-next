import { describe, expect, it } from "vitest";
import {
  collapsedMessageCharacterLimit,
  createChatMessageDisclosureKey,
  isLongChatMessage
} from "../chat-message-disclosure";

describe("chat message disclosure", () => {
  it("only treats messages over the collapsed limit as long", () => {
    expect(isLongChatMessage("x".repeat(collapsedMessageCharacterLimit))).toBe(false);
    expect(isLongChatMessage("x".repeat(collapsedMessageCharacterLimit + 1))).toBe(true);
  });

  it("trims surrounding whitespace before applying the long-message threshold", () => {
    expect(isLongChatMessage(`  ${"x".repeat(collapsedMessageCharacterLimit)}  `)).toBe(false);
    expect(isLongChatMessage(`\n${"x".repeat(collapsedMessageCharacterLimit + 1)}\n`)).toBe(true);
  });

  it("keeps disclosure state keys tied to role and text, not index alone", () => {
    const first = createChatMessageDisclosureKey({ role: "assistant", text: "same index, first reply" }, 0);
    const changedText = createChatMessageDisclosureKey({ role: "assistant", text: "same index, next reply" }, 0);
    const changedRole = createChatMessageDisclosureKey({ role: "user", text: "same index, first reply" }, 0);
    const changedIndex = createChatMessageDisclosureKey({ role: "assistant", text: "same index, first reply" }, 1);

    expect(first).not.toBe(changedText);
    expect(first).not.toBe(changedRole);
    expect(first).not.toBe(changedIndex);
  });
});
