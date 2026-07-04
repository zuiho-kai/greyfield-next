import type { ConversationTurn, TopicIndex, CoreMemory } from "./types";
import type { LLMProvider } from "../providers";
import type { JsonlTopicIndexStore } from "@greyfield/persistence";
import type { SqliteCoreMemoryStore } from "@greyfield/persistence";
import { embed } from "./embedding";

export class MemoryManager {
  private unindexedTurns: ConversationTurn[] = [];
  private batchSize: number;

  constructor(
    public readonly topicStore: JsonlTopicIndexStore,
    public readonly coreStore: SqliteCoreMemoryStore,
    private llm: LLMProvider,
    public readonly sessionId: string,
    private characterId: string,
    options?: {
      batchSize?: number;
    }
  ) {
    this.batchSize = options?.batchSize || 50;
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
        id: `core-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`,
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

      for (const topic of topics) {
        const storedTopic = await this.topicStore.append(topic);

        // Upgrade high-frequency topics to core memory
        if (storedTopic.mentionCount >= 3) {
          await this.upgradeToCoreMemory(storedTopic);
        }
      }

      console.log(`[Memory] Created ${topics.length} topic indices`);
    } catch (error) {
      console.error('[Memory] Failed to build topic index:', error);
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
3. 估计的提及次数（mentionCount）

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

      // Fallback: Simple heuristic-based topic extraction
      const firstTurn = turns[0];
      const lastTurn = turns[turns.length - 1];
      const allText = turns.map(t => getTurnText(t)).join(' ');
      const words = allText.split(/\s+/).filter(w => w.length > 2);
      const uniqueWords = [...new Set(words)].slice(0, 5);

      return [{
        sessionId: this.sessionId,
        characterId: this.characterId,
        topic: `对话涉及 ${uniqueWords.slice(0, 3).join('、')}`,
        keywords: uniqueWords,
        timeRange: [toDate(firstTurn.timestamp), toDate(lastTurn.timestamp)] as [Date, Date],
        turnIds: turns.map(t => t.id),
        mentionCount: turns.length,
        lastMentioned: toDate(lastTurn.timestamp)
      }];
    }
  }

  private async upgradeToCoreMemory(topic: TopicIndex): Promise<void> {
    try {
      console.log(`[Memory] Upgrading high-frequency topic to core memory: ${topic.topic}`);

      const embedding = await embed(topic.topic);

      const memory: CoreMemory = {
        id: `core-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`,
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
      console.error('[Memory] Failed to upgrade topic to core memory:', error);
    }
  }

  async forceIndex(): Promise<void> {
    if (this.unindexedTurns.length > 0) {
      await this.buildTopicIndex();
      this.unindexedTurns = [];
    }
  }

  close(): void {
    this.coreStore.close();
  }
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
