export type ProfilePortraitSectionId = "identity" | "relationship" | "stable" | "preference" | "recent" | "uncertain";

export interface ProfileFactViewInput {
  category: string;
  key: string;
  value: string;
}

export function formatProfileFactLine(fact: Pick<ProfileFactViewInput, "key" | "value">): string {
  const key = fact.key.trim();
  const value = fact.value.trim();
  if (!key) return value;
  if (!value) return key;
  return `${key}: ${value}`;
}

export function profilePortraitSectionId(fact: ProfileFactViewInput): ProfilePortraitSectionId {
  const key = normalizeProfileText(fact.key);
  const value = normalizeProfileText(fact.value);
  const text = `${key} ${value}`;
  if (fact.category === "identity") {
    return "identity";
  }
  if (fact.category === "preference") {
    return "preference";
  }
  if (/关系|朋友|家人|伴侣|同事|relationship|friend|family|partner|coworker/u.test(text)) {
    return "relationship";
  }
  if (/最近|近期|刚刚|上次|recent|last time|today|yesterday/u.test(text)) {
    return "recent";
  }
  if (/可能|也许|不确定|疑似|maybe|possibly|uncertain/u.test(text)) {
    return "uncertain";
  }
  return "stable";
}

export function normalizeProfileText(value: string): string {
  return value.trim().toLowerCase();
}
