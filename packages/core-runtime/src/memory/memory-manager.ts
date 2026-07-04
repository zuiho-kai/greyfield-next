import type { ConversationTurn, TopicIndex, CoreMemory } from "./types";
import type { LLMProvider } from "../providers";
import type { JsonlTopicIndexStore } from "@greyfield/persistence";
import type { SqliteCoreMemoryStore } from "@greyfield/persistence";
import { embed } from "./embedding";
import { extractKeywords } from "./keywords";

export class MemoryManager {
  private unindexedTurns: ConversationTurn[] = [];
  private batchSize: number;
  private coreUpgradeThreshold: number;
  private closed = false;

  constructor(
    public readonly topicStore: JsonlTopicIndexStore,
    public readonly coreStore: SqliteCoreMemoryStore,
    private llm: LLMProvider,
    public readonly sessionId: string,
    private characterId: string,
    options?: {
      batchSize?: number;
      coreUpgradeThreshold?: number;
    }
  ) {
    this.batchSize = options?.batchSize || 50;
    this.coreUpgradeThreshold = options?.coreUpgradeThreshold ?? 3;
  }

  async onNewTurn(turn: ConversationTurn): Promise<void> {
    this.unindexedTurns.push(turn);

    // Check for explicit memory request
    if (turn.role === 'user') {
      await this.checkExplicitMemory(turn);
    }

    // Trigger batch indexing every N turns
    if (this.unindexedTurns.length >= this.batchSize) {
      await this.buildTopicIndex();
      this.unindexedTurns = [];
    }
  }

  private async checkExplicitMemory(turn: ConversationTurn): Promise<void> {
    const text = getTurnText(turn).toLowerCase();

    // Detect explicit memory triggers
    if (text.includes('记住') || text.includes('别忘了') || text.includes('以后要')) {
      await this.writeExplicit(turn);
    }
  }

  private async writeExplicit(turn: ConversationTurn): Promise<void> {
    try {
      // TODO: Extract memory content with LLM
      // For now, use the text directly
      const memoryText = getTurnText(turn);

      const embedding = await embed(memoryText);

      const memory: CoreMemory = {
        id: createCoreMemoryId(),
        sessionId: turn.sessionId ?? this.sessionId,
        characterId: turn.characterId ?? this.characterId,
        text: memoryText,
        embedding,
        strength: 1.0, // Explicit memories start with max strength
        createdAt: new Date(),
        sources: {
          turnIds: [turn.id]
        },
        disabled: false
      };

      await this.coreStore.insert(memory);
      console.log(`[Memory] Explicit memory created: ${memory.id}`);
    } catch (error) {
      // Never rethrow: a failed explicit write must not break turn recording
      // or the batch-index counter in onNewTurn.
      console.error('[Memory] Failed to write explicit memory:', error);
    }
  }

  private async buildTopicIndex(): Promise<void> {
    if (this.unindexedTurns.length === 0) {
      return;
    }

    try {
      console.log(`[Memory] Building topic index for ${this.unindexedTurns.length} turns`);

      const topics = await this.extractTopics(this.unindexedTurns);
      const existingTopics = await this.topicStore.getBySession(this.sessionId);

      for (const topic of topics) {
        const mergeTarget = findMergeTarget(topic, existingTopics);

        if (mergeTarget) {
          const previousCount = mergeTarget.mentionCount;
          const merged = await this.topicStore.update(mergeTarget.id, {
            mentionCount: previousCount + topic.mentionCount,
            keywords: mergeKeywords(mergeTarget.keywords, topic.keywords),
            turnIds: [...new Set([...mergeTarget.turnIds, ...topic.turnIds])],
            timeRange: [mergeTarget.timeRange[0], topic.timeRange[1]],
            lastMentioned: topic.lastMentioned
          });

          if (merged) {
            // Refresh local view so later topics in this batch merge correctly
            const index = existingTopics.findIndex(t => t.id === merged.id);
            if (index >= 0) {
              existingTopics[index] = merged;
            }
            // Upgrade only when crossing the threshold, so a topic is
            // promoted to core memory exactly once.
            if (previousCount < this.coreUpgradeThreshold && merged.mentionCount >= this.coreUpgradeThreshold) {
              await this.upgradeToCoreMemory(merged);
            }
          }
        } else {
          const storedTopic = await this.topicStore.append(topic);
          existingTopics.push(storedTopic);

          if (storedTopic.mentionCount >= this.coreUpgradeThreshold) {
            await this.upgradeToCoreMemory(storedTopic);
          }
        }
      }

      console.log(`[Memory] Processed ${topics.length} topic indices`);
    } catch (error) {
      console.error('[Memory] Failed to build topic index:', error);
      throw error;
    }
  }

  private async extractTopics(turns: ConversationTurn[]): Promise<Omit<TopicIndex, 'id'>[]> {
    if (turns.length === 0) {
      return [];
    }

    try {
      // Use LLM to extract topics
      const conversationText = turns.map((t, idx) =>
        `[${idx + 1}] ${t.role}: ${getTurnText(t)}`
      ).join('\n');

      const prompt = `请分析以下对话，提取 2-4 个主要话题。每个话题包含：
1. 一句话总结（topic）
2. 3-5 个关键词（keywords）
3. 该话题被独立提起的次数（mentionCount，必须基于对话内容如实统计，不确定时填 1）

提取规则：
- 只提取用户认真讨论过的内容，忽略寒暄、玩笑、反讽、假设和角色扮演中的虚构设定
- 不要把代码片段、工具输出、系统提示或引用的第三方内容当作用户自己的话题
- 用户已否认或纠正过的说法，以最终确认的版本为准，不要保留旧说法
- 不要推测对话中没有出现的信息

对话内容：
${conversationText}

请以 JSON 数组格式返回，例如：
[
  {
    "topic": "讨论天气和心情的关系",
    "keywords": ["天气", "心情", "阳光", "下雨"],
    "mentionCount": 3
  }
]

只返回 JSON，不要其他解释。`;

      const responseText = await collectLLMText(this.llm, prompt);

      // Try to parse JSON from response
      let topics: Array<{topic: string, keywords: string[], mentionCount: number}> = [];

      // Extract JSON from response (might be wrapped in markdown code blocks)
      const jsonMatch = responseText.match(/\[[\s\S]*\]/);
      if (jsonMatch) {
        topics = JSON.parse(jsonMatch[0]);
      }

      if (topics.length === 0) {
        throw new Error('No topics extracted from LLM response');
      }

      const firstTurn = turns[0];
      const lastTurn = turns[turns.length - 1];

      return topics.map(t => ({
        sessionId: this.sessionId,
        characterId: this.characterId,
        topic: t.topic,
        keywords: t.keywords,
        timeRange: [toDate(firstTurn.timestamp), toDate(lastTurn.timestamp)] as [Date, Date],
        turnIds: turns.map(turn => turn.id),
        mentionCount: t.mentionCount || 1,
        lastMentioned: toDate(lastTurn.timestamp)
      }));

    } catch (error) {
      console.warn('[Memory] LLM topic extraction failed, using fallback:', error);

      // Fallback: keyword-only placeholder so the batch still lands in the
      // topic index. mentionCount is pinned to 1 so a fallback topic can
      // never be promoted to core memory on its own — promotion must come
      // from real accumulation across batches.
      const firstTurn = turns[0];
      const lastTurn = turns[turns.length - 1];
      const allText = turns.map(t => getTurnText(t)).join(' ');
      const keywords = extractKeywords(allText).slice(0, 5);

      if (keywords.length === 0) {
        return [];
      }

      return [{
        sessionId: this.sessionId,
        characterId: this.characterId,
        topic: `对话涉及 ${keywords.slice(0, 3).join('、')}`,
        keywords,
        timeRange: [toDate(firstTurn.timestamp), toDate(lastTurn.timestamp)] as [Date, Date],
        turnIds: turns.map(t => t.id),
        mentionCount: 1,
        lastMentioned: toDate(lastTurn.timestamp)
      }];
    }
  }

  private async upgradeToCoreMemory(topic: TopicIndex): Promise<void> {
    try {
      console.log(`[Memory] Upgrading high-frequency topic to core memory: ${topic.topic}`);

      const embedding = await embed(topic.topic);

      const memory: CoreMemory = {
        id: createCoreMemoryId(),
        sessionId: topic.sessionId,
        characterId: topic.characterId,
        text: topic.topic,
        embedding,
        strength: 0.7, // Auto-extracted memories start with medium strength
        createdAt: new Date(),
        sources: {
          turnIds: topic.turnIds,
          topicIds: [topic.id]
        },
        disabled: false
      };

      await this.coreStore.insert(memory);
      console.log(`[Memory] Core memory created from topic: ${memory.id}`);
    } catch (error) {
      // Never rethrow: a failed upgrade must not abort the batch, otherwise
      // the retry would re-merge topics and double-count mentions.
      console.error('[Memory] Failed to upgrade topic to core memory:', error);
    }
  }

  async forceIndex(): Promise<void> {
    if (this.unindexedTurns.length > 0) {
      await this.buildTopicIndex();
      this.unindexedTurns = [];
    }
  }

  async close(): Promise<void> {
    if (this.closed) {
      return;
    }
    this.closed = true;
    try {
      // Flush turns that have not reached batchSize yet so a restart does
      // not silently drop up to batchSize-1 turns.
      await this.forceIndex();
    } catch (error) {
      console.error('[Memory] Failed to flush unindexed turns on close:', error);
    } finally {
      this.coreStore.close();
    }
  }
}

function findMergeTarget(
  topic: Omit<TopicIndex, 'id'>,
  existing: TopicIndex[]
): TopicIndex | undefined {
  const topicKeywords = new Set(topic.keywords.map(normalizeKeyword));
  return existing.find(candidate => {
    if (candidate.characterId !== topic.characterId) {
      return false;
    }
    if (candidate.topic === topic.topic) {
      return true;
    }
    const shared = candidate.keywords.filter(kw => topicKeywords.has(normalizeKeyword(kw)));
    return shared.length >= 2;
  });
}

function mergeKeywords(existing: string[], incoming: string[]): string[] {
  const seen = new Set(existing.map(normalizeKeyword));
  const merged = [...existing];
  for (const keyword of incoming) {
    if (!seen.has(normalizeKeyword(keyword))) {
      seen.add(normalizeKeyword(keyword));
      merged.push(keyword);
    }
  }
  return merged.slice(0, 10);
}

function normalizeKeyword(keyword: string): string {
  return keyword.trim().toLowerCase();
}

function getTurnText(turn: ConversationTurn): string {
  return turn.text ?? turn.content ?? "";
}

function toDate(value: Date | number): Date {
  return value instanceof Date ? value : new Date(value);
}

async function collectLLMText(llm: LLMProvider, prompt: string): Promise<string> {
  let text = "";
  for await (const chunk of llm.stream([{ role: "user", content: prompt }])) {
    text += chunk;
  }
  return text;
}

function createCoreMemoryId(): string {
  const randomUUID = globalThis.crypto?.randomUUID;
  return `core-${randomUUID ? randomUUID.call(globalThis.crypto) : `${Date.now()}-${Math.random().toString(36).slice(2, 11)}`}`;
}
