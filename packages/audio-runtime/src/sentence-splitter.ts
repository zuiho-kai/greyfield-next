export interface SentenceSplitResult {
  sentences: string[];
  remainder: string;
}

const sentenceTerminators = new Set([".", "!", "?", "。", "！", "？", "…"]);
const closingMarks = new Set(['"', "'", "”", "’", ")", "]", "}", "》", "」", "』"]);

export function splitCompleteSentences(input: string): SentenceSplitResult {
  const sentences: string[] = [];
  let sentenceStart = 0;
  let index = 0;

  while (index < input.length) {
    const char = input[index];
    if (!sentenceTerminators.has(char)) {
      index += 1;
      continue;
    }

    let sentenceEnd = index + 1;
    while (sentenceEnd < input.length && closingMarks.has(input[sentenceEnd])) {
      sentenceEnd += 1;
    }

    const sentence = input.slice(sentenceStart, sentenceEnd).trim();
    if (sentence.length > 0) {
      sentences.push(sentence);
    }
    sentenceStart = sentenceEnd;
    index = sentenceEnd;
  }

  return {
    sentences,
    remainder: input.slice(sentenceStart).trimStart()
  };
}
