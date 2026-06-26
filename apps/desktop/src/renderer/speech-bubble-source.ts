export interface SpeechBubbleMessage {
  role: "assistant" | "user" | "system";
  text: string;
}

export function resolveSpeechBubbleSourceText(input: {
  assistantDraft: string;
  messages: SpeechBubbleMessage[];
  status: string;
}): string {
  if (input.assistantDraft) {
    return input.assistantDraft;
  }
  const lastAssistantIndex = findLastMessageIndex(input.messages, "assistant");
  const lastUserIndex = findLastMessageIndex(input.messages, "user");
  if (
    lastAssistantIndex < 0 ||
    lastUserIndex > lastAssistantIndex ||
    input.status === "thinking" ||
    input.status === "listening"
  ) {
    return "";
  }
  return input.messages[lastAssistantIndex]?.text ?? "";
}

function findLastMessageIndex(messages: SpeechBubbleMessage[], role: "assistant" | "user"): number {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    if (messages[index]?.role === role) {
      return index;
    }
  }
  return -1;
}
