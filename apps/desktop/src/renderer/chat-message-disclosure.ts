import type { DesktopMessage } from "./desktop-runtime-bridge";

export const collapsedMessageCharacterLimit = 360;
export const draftMessageKey = "assistant-draft";
export const draftBubbleId = "chat-message-draft";

export function isLongChatMessage(text: string): boolean {
  return text.trim().length > collapsedMessageCharacterLimit;
}

export function createChatMessageDisclosureKey(message: DesktopMessage, index: number): string {
  return `message-${index}-${message.role}-${hashMessageText(message.text)}`;
}

function hashMessageText(text: string): string {
  let hash = 2166136261;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
}
