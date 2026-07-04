import type { CoreMemory } from "./types";
import { embed } from "./embedding";
import type { MemoryManager } from "./memory-manager";

export interface RecallResult {
  text: string;
  memories: CoreMemory[];
}

/**
 * Recall relevant memories for a user message
 * Uses three-layer recall strategy:
 * 1. Layer 3: Core memories (vector search)
 * 2. Layer 2: Topic index (keyword search)
 * 3. Layer 1: Raw conversation (not implemented yet)
 */
export async function recall(
  userMessage: string,
  manager: MemoryManager
): Promise<RecallResult> {
  // Step 1: Query core memories with vector search
  try {
    const embedding = await embed(userMessage);
    const coreMemories = await manager.coreStore.vectorSearch(embedding, 10);

    // Filter valid memories (not disabled, sufficient strength)
    const validCore = coreMemories.filter(m =>
      !m.disabled && m.strength > 0.3
    );

    if (validCore.length > 0) {
      // Update memory strength (reinforce recalled memories)
      await Promise.all(validCore.map((mem) =>
        manager.coreStore.update(mem.id, {
          strength: Math.min(1.0, mem.strength + 0.1),
          lastRecalledAt: new Date()
        })
      ));

      const text = formatMemories(validCore);
      return { text, memories: validCore };
    }
  } catch (error) {
    console.error('[Memory] Core memory recall failed:', error);
  }

  // Step 2: Query topic index with keyword search
  try {
    const keywords = extractKeywords(userMessage);
    const topics = await manager.topicStore.search(keywords);

    if (topics.length > 0) {
      // TODO: Extract raw turns from Layer 1 and summarize
      const text = `相关话题：${topics[0].topic}`;
      return { text, memories: [] };
    }
  } catch (error) {
    console.error('[Memory] Topic index recall failed:', error);
  }

  // No relevant memories found
  return { text: '', memories: [] };
}

/**
 * Extract keywords from user message for topic search
 */
function extractKeywords(text: string): string[] {
  const normalized = text.toLowerCase();
  const words = normalized.match(/[\p{L}\p{N}]+/gu) ?? [];
  const hanChunks = normalized.match(/\p{Script=Han}+/gu) ?? [];
  const hanNgrams = hanChunks.flatMap((chunk) => buildHanNgrams(chunk));

  // Remove common stop words (simplified)
  const stopWords = new Set(['的', '了', '是', '在', '有', '我', '你', '他', '她', '它']);
  const keywords = [...words, ...hanNgrams].filter(w => w.length > 1 && !stopWords.has(w));

  // Return unique keywords
  return [...new Set(keywords)];
}

function buildHanNgrams(text: string): string[] {
  const result: string[] = [];
  for (let size = 2; size <= Math.min(4, text.length); size += 1) {
    for (let index = 0; index <= text.length - size; index += 1) {
      result.push(text.slice(index, index + size));
    }
  }
  return result;
}

/**
 * Format memories into prompt text
 */
function formatMemories(memories: CoreMemory[]): string {
  if (memories.length === 0) {
    return '';
  }

  const lines = memories
    .sort((a, b) => b.strength - a.strength) // Sort by strength
    .map(m => `- ${m.text} (强度: ${(m.strength * 100).toFixed(0)}%)`)
    .join('\n');

  return `# 相关记忆\n${lines}`;
}

/**
 * Search memories by keyword (supplement to vector search)
 */
export async function searchMemoriesByKeyword(
  keyword: string,
  manager: MemoryManager,
  limit: number = 10
): Promise<CoreMemory[]> {
  const allMemories = await manager.coreStore.getBySession(manager.sessionId);

  const keywordLower = keyword.toLowerCase();
  return allMemories
    .filter(m =>
      !m.disabled &&
      m.text.toLowerCase().includes(keywordLower)
    )
    .sort((a, b) => b.strength - a.strength)
    .slice(0, limit);
}

/**
 * Get memories by time range
 */
export async function getMemoriesByTimeRange(
  manager: MemoryManager,
  startDate: Date,
  endDate: Date
): Promise<CoreMemory[]> {
  const allMemories = await manager.coreStore.getBySession(manager.sessionId);

  return allMemories
    .filter(m =>
      !m.disabled &&
      m.createdAt >= startDate &&
      m.createdAt <= endDate
    )
    .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
}
