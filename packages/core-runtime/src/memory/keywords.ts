// Shared keyword extraction for memory search and topic fallback.
// Handles Chinese text (no whitespace) via Han character n-grams.

const stopWords = new Set(['的', '了', '是', '在', '有', '我', '你', '他', '她', '它']);

export function extractKeywords(text: string): string[] {
  const normalized = text.toLowerCase();
  // Pure-Han runs are covered by the n-grams below; keeping them here would
  // surface whole contiguous Chinese sentences as "keywords".
  const words = (normalized.match(/[\p{L}\p{N}]+/gu) ?? []).filter(w => !/^\p{Script=Han}+$/u.test(w));
  const hanChunks = normalized.match(/\p{Script=Han}+/gu) ?? [];
  const hanNgrams = hanChunks.flatMap((chunk) => buildHanNgrams(chunk));

  const keywords = [...words, ...hanNgrams].filter(w => w.length > 1 && !stopWords.has(w));

  return [...new Set(keywords)];
}

export function buildHanNgrams(text: string): string[] {
  const result: string[] = [];
  for (let size = 2; size <= Math.min(4, text.length); size += 1) {
    for (let index = 0; index <= text.length - size; index += 1) {
      result.push(text.slice(index, index + size));
    }
  }
  return result;
}
