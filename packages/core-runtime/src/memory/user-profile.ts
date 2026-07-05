/**
 * User self-profile: structured facts about the user that are always injected
 * into context (no recall, no decay). Separates "hard facts" (allergies,
 * important dates, identity attributes) from conversational memories.
 */

// Re-export types from persistence to avoid circular dependency
import type { ProfileFactCategory, UserProfileFact } from "@greyfield/persistence";

export type { UserProfileFact, ProfileFactCategory } from "@greyfield/persistence";

/** Shape returned by LLM when extracting profile facts from a batch */
export interface ExtractedProfileFact {
  category: ProfileFactCategory;
  key: string;
  value: string;
  /** Keys of previous facts this one replaces; persistence resolves them to fact IDs. */
  supersedes?: string[];
}

export interface ProfileFactStore {
  getBySession(sessionId: string, characterId: string, includeDisabled?: boolean): Promise<UserProfileFact[]>;
  insert(fact: UserProfileFact): Promise<void>;
  update(id: string, updates: Partial<Pick<UserProfileFact, "disabled" | "supersedes">>): Promise<void>;
}

export type ProfileFactPersistenceResult =
  | { action: "created"; fact: UserProfileFact; supersededCount: 0 }
  | { action: "reinforced"; fact: UserProfileFact; supersededCount: 0 }
  | { action: "updated"; fact: UserProfileFact; supersededCount: number };

export async function persistProfileFacts(options: {
  store: ProfileFactStore;
  facts: ExtractedProfileFact[];
  sessionId: string;
  characterId: string;
  sourceTurnIds: string[];
  now?: Date;
}): Promise<ProfileFactPersistenceResult[]> {
  const existing = await options.store.getBySession(options.sessionId, options.characterId, true);
  const results: ProfileFactPersistenceResult[] = [];

  for (const extracted of options.facts) {
    const normalizedKey = normalizeProfileKey(extracted.key);
    const normalizedValue = normalizeProfileKey(extracted.value);
    const duplicates = existing.filter(fact =>
      normalizeProfileKey(fact.key) === normalizedKey &&
      fact.category === extracted.category
    );
    const identical = duplicates.find(fact => normalizeProfileKey(fact.value) === normalizedValue);
    const extractedSupersedes = resolveSupersededFactIds(
      extracted.supersedes ?? [],
      existing,
      extracted.category
    );

    if (identical) {
      const supersedes = [
        ...new Set([
          ...(identical.supersedes ?? []),
          ...extractedSupersedes
        ])
      ].filter(id => id !== identical.id);
      await options.store.update(identical.id, {
        disabled: false,
        ...(supersedes.length > 0 ? { supersedes } : {})
      });
      identical.disabled = false;
      if (supersedes.length > 0) {
        identical.supersedes = supersedes;
      }
      results.push({ action: "reinforced", fact: identical, supersededCount: 0 });
      continue;
    }

    if (duplicates.length > 0) {
      const retained = duplicates[0];
      const supersedes = [
        ...new Set([
          ...(retained.supersedes ?? []),
          ...duplicates.map(fact => fact.id),
          ...extractedSupersedes
        ])
      ].filter(id => id !== retained.id);
      const updated: UserProfileFact = {
        ...retained,
        value: extracted.value,
        createdAt: options.now ?? new Date(),
        sourceTurnIds: options.sourceTurnIds,
        supersedes: supersedes.length > 0 ? supersedes : undefined,
        disabled: false
      };

      await options.store.insert(updated);
      Object.assign(retained, updated);
      for (const duplicate of duplicates) {
        if (duplicate.id !== retained.id) {
          duplicate.disabled = true;
        }
      }
      results.push({ action: "updated", fact: updated, supersededCount: duplicates.length - 1 });
      continue;
    }

    const fact: UserProfileFact = {
      id: createProfileFactId(),
      sessionId: options.sessionId,
      characterId: options.characterId,
      category: extracted.category,
      key: extracted.key,
      value: extracted.value,
      createdAt: options.now ?? new Date(),
      sourceTurnIds: options.sourceTurnIds,
      ...(extractedSupersedes.length > 0 ? { supersedes: extractedSupersedes } : {}),
      disabled: false
    };

    await options.store.insert(fact);
    existing.push(fact);
    results.push({ action: "created", fact, supersededCount: 0 });
  }

  return results;
}

export function normalizeProfileKey(text: string): string {
  return text.trim().toLowerCase().replace(/\s+/g, "");
}

function resolveSupersededFactIds(
  supersededKeys: string[],
  existing: UserProfileFact[],
  category: ProfileFactCategory
): string[] {
  if (supersededKeys.length === 0) {
    return [];
  }

  const normalizedKeys = new Set(supersededKeys.map(normalizeProfileKey).filter(Boolean));
  return [
    ...new Set(
      existing
        .filter(fact => fact.category === category && normalizedKeys.has(normalizeProfileKey(fact.key)))
        .map(fact => fact.id)
    )
  ];
}

function createProfileFactId(): string {
  const randomUUID = globalThis.crypto?.randomUUID;
  return `profile-${randomUUID ? randomUUID.call(globalThis.crypto) : `${Date.now()}-${Math.random().toString(36).slice(2, 11)}`}`;
}
