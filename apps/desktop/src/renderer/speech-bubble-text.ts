export const DEFAULT_SPEECH_BUBBLE_MAX_CHARS = 72;

export function formatSpeechBubbleText(text: string, maxChars = DEFAULT_SPEECH_BUBBLE_MAX_CHARS): string {
  const normalized = text.replace(/\s+/g, " ").trim();
  if (normalized.length <= maxChars) {
    return normalized;
  }

  return `${normalized.slice(0, Math.max(0, maxChars - 3)).trimEnd()}...`;
}
