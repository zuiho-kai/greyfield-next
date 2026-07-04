import type { CoreMemory, TopicIndex } from "./types";
import { embed } from "./embedding";
import type { MemoryManager } from "./memory-manager";
import { extractKeywords } from "./keywords";
import type { SessionTurn } from "../session-store";

export interface RecallResult {
  text: string;
  memories: CoreMemory[];
}

export interface RecallOptions {
  /** Minimum cosine similarity for a vector hit to count as relevant. */
  minSimilarity?: number;
  /** Effective strength below this is treated as forgotten. */
  strengthFloor?: number;
  /** Half-life (in days) for time-based strength decay. */
  halfLifeDays?: number;
  /** Max raw turns quoted when drilling down from a topic to Layer 1. */
  drilldownMaxTurns?: number;
  /** Total character budget for the Layer 1 drilldown excerpt. */
  drilldownCharBudget?: number;
}

const DEFAULT_MIN_SIMILARITY = 0.4;
const DEFAULT_STRENGTH_FLOOR = 0.3;
const DEFAULT_HALF_LIFE_DAYS = 30;
const DEFAULT_DRILLDOWN_MAX_TURNS = 6;
const DEFAULT_DRILLDOWN_CHAR_BUDGET = 600;
const DRILLDOWN_TURN_MAX_CHARS = 120;
const MS_PER_DAY = 24 * 60 * 60 * 1000;

/**
 * Recall relevant memories for a user message
 * Uses three-layer recall strategy:
 * 1. Layer 3: Core memories (vector search)
 * 2. Layer 2: Topic index (keyword search)
 * 3. Layer 1: Raw conversation (not implemented yet)
 */
export async function recall(
  userMessage: string,
  manager: MemoryManager,
  options?: RecallOptions
): Promise<RecallResult> {
  const minSimilarity = options?.minSimilarity ?? DEFAULT_MIN_SIMILARITY;
  const strengthFloor = options?.strengthFloor ?? DEFAULT_STRENGTH_FLOOR;
  const halfLifeDays = options?.halfLifeDays ?? DEFAULT_HALF_LIFE_DAYS;
  const now = new Date();

  // Step 1: Query core memories with vector search
  try {
    const embedding = await embed(userMessage);
    const coreMemories = await manager.coreStore.vectorSearch(embedding, 10);

    // Keep only memories that are enabled, actually similar to the query,
    // and whose time-decayed strength is still above the floor.
    const validCore = coreMemories
      .map((memory) => ({
        memory,
        effectiveStrength: decayedStrength(memory, now, halfLifeDays)
      }))
      .filter(({ memory, effectiveStrength }) =>
        !memory.disabled &&
        (memory.similarity === undefined || memory.similarity >= minSimilarity) &&
        effectiveStrength > strengthFloor
      );

    if (validCore.length > 0) {
      // Reinforce only the memories that were actually relevant. Writing
      // back the decayed value applies forgetting lazily on recall.
      // Best-effort: a failed write must not discard the recall results.
      await Promise.all(validCore.map(async ({ memory, effectiveStrength }) => {
        try {
          await manager.coreStore.update(memory.id, {
            strength: Math.min(1.0, effectiveStrength + 0.1),
            lastRecalledAt: now
          });
        } catch (error) {
          console.error('[Memory] Failed to reinforce core memory:', error);
        }
      }));

      const ranked = validCore
        .sort((a, b) => b.effectiveStrength - a.effectiveStrength)
        .map(({ memory, effectiveStrength }) => ({
          ...memory,
          strength: effectiveStrength
        }));

      const text = formatMemories(ranked);
      return { text, memories: ranked };
    }
  } catch (error) {
    console.error('[Memory] Core memory recall failed:', error);
  }

  // Step 2: Query topic index with keyword search, then drill down to the
  // raw turns in Layer 1 so the prompt gets what was actually said, not
  // just a topic title.
  try {
    const keywords = extractKeywords(userMessage);
    const topics = await manager.topicStore.search(keywords);

    if (topics.length > 0) {
      const topic = topics[0];
      const excerpt = await buildTopicDrilldown(topic, keywords, manager, {
        maxTurns: options?.drilldownMaxTurns ?? DEFAULT_DRILLDOWN_MAX_TURNS,
        charBudget: options?.drilldownCharBudget ?? DEFAULT_DRILLDOWN_CHAR_BUDGET
      });
      const text = excerpt.length > 0 ? excerpt : `相关话题：${topic.topic}`;
      return { text, memories: [] };
    }
  } catch (error) {
    console.error('[Memory] Topic index recall failed:', error);
  }

  // No relevant memories found
  return { text: '', memories: [] };
}

/**
 * Layer 2 → Layer 1 drilldown: fetch the raw turns a topic points at and
 * quote the most query-relevant ones within a character budget.
 */
async function buildTopicDrilldown(
  topic: TopicIndex,
  keywords: string[],
  manager: MemoryManager,
  limits: { maxTurns: number; charBudget: number }
): Promise<string> {
  const lookup = manager.turnLookup;
  if (!lookup || topic.turnIds.length === 0) {
    return '';
  }

  let turns: SessionTurn[];
  try {
    turns = await lookup.getByIds(topic.turnIds);
  } catch (error) {
    console.error('[Memory] Layer 1 drilldown failed:', error);
    return '';
  }

  const conversational = turns.filter(t => t.role === 'user' || t.role === 'assistant');
  if (conversational.length === 0) {
    return '';
  }

  // Prefer turns that mention the query keywords; when nothing matches
  // (the topic was found via its own keyword list), fall back to the tail
  // of the topic's conversation.
  const lowerKeywords = keywords.map(kw => kw.toLowerCase());
  const scored = conversational.map((turn, index) => ({
    turn,
    index,
    score: countKeywordHits(turn.content, lowerKeywords)
  }));
  const matching = scored.filter(entry => entry.score > 0);
  const candidates = matching.length > 0 ? matching : scored.slice(-limits.maxTurns);

  const selected = candidates
    .sort((a, b) => b.score - a.score || a.index - b.index)
    .slice(0, limits.maxTurns)
    .sort((a, b) => a.index - b.index);

  const lines: string[] = [];
  let used = 0;
  for (const { turn } of selected) {
    const content = truncate(turn.content.replace(/\s+/g, ' ').trim(), DRILLDOWN_TURN_MAX_CHARS);
    if (content.length === 0) {
      continue;
    }
    const line = `${turn.role === 'user' ? '用户' : 'AI'}: ${content}`;
    if (used + line.length > limits.charBudget && lines.length > 0) {
      break;
    }
    lines.push(line);
    used += line.length;
  }

  if (lines.length === 0) {
    return '';
  }

  const when = topic.lastMentioned instanceof Date && !Number.isNaN(topic.lastMentioned.getTime())
    ? `（最近提到：${topic.lastMentioned.toISOString().slice(0, 10)}）`
    : '';

  return [
    `# 相关话题回顾`,
    `话题：${topic.topic}${when}`,
    `当时的对话节选：`,
    ...lines
  ].join('\n');
}

function countKeywordHits(text: string, lowerKeywords: string[]): number {
  const lower = text.toLowerCase();
  let hits = 0;
  for (const keyword of lowerKeywords) {
    if (lower.includes(keyword)) {
      hits += 1;
    }
  }
  return hits;
}

function truncate(text: string, maxChars: number): string {
  return text.length > maxChars ? `${text.slice(0, maxChars)}…` : text;
}

/**
 * Strength with exponential time decay applied, measured from the last
 * recall (or creation when never recalled): strength * 0.5^(age / halfLife)
 */
export function decayedStrength(
  memory: Pick<CoreMemory, 'strength' | 'createdAt' | 'lastRecalledAt'>,
  now: Date,
  halfLifeDays: number = DEFAULT_HALF_LIFE_DAYS
): number {
  const reference = memory.lastRecalledAt ?? memory.createdAt;
  const ageDays = Math.max(0, (now.getTime() - reference.getTime()) / MS_PER_DAY);
  return memory.strength * Math.pow(0.5, ageDays / halfLifeDays);
}

/**
 * Format memories into prompt text
 */
function formatMemories(memories: CoreMemory[]): string {
  if (memories.length === 0) {
    return '';
  }

  const lines = memories
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
