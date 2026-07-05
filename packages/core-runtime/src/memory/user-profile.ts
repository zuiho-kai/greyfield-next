/**
 * User self-profile: structured facts about the user that are always injected
 * into context (no recall, no decay). Separates "hard facts" (allergies,
 * important dates, identity attributes) from conversational memories.
 */

// Re-export types from persistence to avoid circular dependency
export type { UserProfileFact, ProfileFactCategory } from "@greyfield/persistence";

/** Shape returned by LLM when extracting profile facts from a batch */
export interface ExtractedProfileFact {
  category: ProfileFactCategory;
  key: string;
  value: string;
  /** Keys of previous facts this one replaces (matched by normalized key) */
  supersedes?: string[];
}
