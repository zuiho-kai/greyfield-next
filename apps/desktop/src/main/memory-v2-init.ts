/**
 * Memory System V2 Initialization Helper
 *
 * This file provides helper functions to initialize the new memory system
 * for the desktop app.
 */

import { app } from "electron";
import { join } from "path";
import { JsonlTopicIndexStore, SqliteCoreMemoryStore, SqliteUserProfileStore } from "@greyfield/persistence";

export interface MemoryStoresV2 {
  topicStore: JsonlTopicIndexStore;
  coreStore: SqliteCoreMemoryStore;
  profileStore: SqliteUserProfileStore;
}

/**
 * Initialize new memory stores (V2) for a character
 */
export function initializeMemoryStoresV2(characterId: string): MemoryStoresV2 {
  const userDataPath = app.getPath("userData");
  const memoryDir = join(userDataPath, "memory-v2", characterId);

  // Layer 2: Topic Index (JSONL)
  const topicIndexPath = join(memoryDir, "topics.jsonl");
  const topicStore = new JsonlTopicIndexStore(topicIndexPath);

  // Layer 3: Core Memory (SQLite + vector search)
  const coreMemoryPath = join(memoryDir, "core.db");
  const coreStore = new SqliteCoreMemoryStore(coreMemoryPath);

  // Layer 4: User Profile (SQLite, structured facts)
  const profilePath = join(memoryDir, "profile.db");
  const profileStore = new SqliteUserProfileStore(profilePath);

  return { topicStore, coreStore, profileStore };
}

/**
 * Check if new memory system should be enabled
 * This is a feature flag - can be controlled via config
 */
export function shouldUseNewMemorySystem(config: any): boolean {
  // For now, default to false (opt-in)
  // Can be enabled via config.memory.useV2System
  return config?.memory?.useV2System === true;
}
