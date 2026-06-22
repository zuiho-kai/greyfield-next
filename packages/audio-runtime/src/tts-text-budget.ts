export interface TtsTextBudgetResult {
  text: string;
  usedCharacters: number;
  exhausted: boolean;
}

export function takeTtsTextWithinBudget(text: string, usedCharacters: number, maxCharacters: number): TtsTextBudgetResult {
  const normalized = text.replace(/\s+/g, " ").trim();
  if (normalized.length === 0 || maxCharacters <= usedCharacters) {
    return {
      text: "",
      usedCharacters,
      exhausted: maxCharacters <= usedCharacters
    };
  }

  const remaining = maxCharacters - usedCharacters;
  if (normalized.length <= remaining) {
    return {
      text: normalized,
      usedCharacters: usedCharacters + normalized.length,
      exhausted: usedCharacters + normalized.length >= maxCharacters
    };
  }

  return {
    text: `${normalized.slice(0, Math.max(0, remaining - 1)).trimEnd()}…`,
    usedCharacters: maxCharacters,
    exhausted: true
  };
}
