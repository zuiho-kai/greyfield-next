export const assistantReplySegmentCharacterLimit = 100;

const sentenceBoundaryPattern = /[.!?。！？…]+["'”’）)]*/u;

export function splitAssistantReplyForDisplay(text: string): string[] {
  const normalized = normalizeAssistantReplyText(text);
  if (normalized.length === 0) {
    return [];
  }
  if (normalized.length <= assistantReplySegmentCharacterLimit) {
    return [normalized];
  }

  const sentences = splitNaturalSentences(normalized);
  if (sentences.length <= 1) {
    return chunkOversizedSentence(normalized);
  }

  const segments: string[] = [];
  let current = "";
  for (const sentence of sentences.flatMap(chunkOversizedSentence)) {
    if (current.length === 0) {
      current = sentence;
      continue;
    }
    const next = `${current}${segmentJoiner(current, sentence)}${sentence}`;
    if (next.length <= assistantReplySegmentCharacterLimit) {
      current = next;
      continue;
    }
    segments.push(current);
    current = sentence;
  }
  if (current.length > 0) {
    segments.push(current);
  }

  return segments;
}

function chunkOversizedSentence(sentence: string): string[] {
  if (sentence.length <= assistantReplySegmentCharacterLimit || isUnbrokenSpan(sentence)) {
    return [sentence];
  }

  const chunks: string[] = [];
  let remaining = sentence;
  while (remaining.length > assistantReplySegmentCharacterLimit) {
    const breakAt = findChunkBreak(remaining);
    chunks.push(remaining.slice(0, breakAt).trim());
    remaining = remaining.slice(breakAt).trim();
  }
  if (remaining.length > 0) {
    chunks.push(remaining);
  }
  return chunks;
}

function findChunkBreak(text: string): number {
  const whitespaceBreak = text.lastIndexOf(" ", assistantReplySegmentCharacterLimit);
  if (whitespaceBreak > 0) {
    return whitespaceBreak;
  }
  return assistantReplySegmentCharacterLimit;
}

function isUnbrokenSpan(text: string): boolean {
  return !/\s/u.test(text) && !sentenceBoundaryPattern.test(text);
}

function segmentJoiner(left: string, right: string): string {
  return /[.!?]["'”’）)]*$/u.test(left) && /^[A-Za-z0-9]/u.test(right) ? " " : "";
}

export function normalizeAssistantReplyText(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

function splitNaturalSentences(text: string): string[] {
  const sentences: string[] = [];
  let start = 0;
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index] ?? "";
    if (!sentenceBoundaryPattern.test(char)) {
      continue;
    }
    let end = index + 1;
    while (end < text.length && /["'”’）)]/u.test(text[end] ?? "")) {
      end += 1;
    }
    const sentence = text.slice(start, end).trim();
    if (sentence.length > 0) {
      sentences.push(sentence);
    }
    start = end;
  }
  const remainder = text.slice(start).trim();
  if (remainder.length > 0) {
    sentences.push(remainder);
  }
  return sentences;
}
