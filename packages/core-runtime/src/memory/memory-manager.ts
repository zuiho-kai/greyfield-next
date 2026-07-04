import type { ConversationTurn, TopicIndex, CoreMemory } from "./types";
import type { LLMProvider } from "../providers";
import type { SessionTurnLookup } from "../session-store";
import type { JsonlTopicIndexStore, SqliteCoreMemoryStore, SqliteUserProfileStore } from "@greyfield/persistence";
import type { UserProfileFact, ExtractedProfileFact } from "./user-profile";
import { embed } from "./embedding";
import { extractKeywords } from "./keywords";

export class MemoryManager {
  private unindexedTurns: ConversationTurn[] = [];
  private batchSize: number;
  private coreUpgradeThreshold: number;
  private closed = false;
  /** Layer 1 access: lets recall drill down from a topic to the raw turns. */
  public readonly turnLookup?: SessionTurnLookup;
  /** Optional user profile store for structured facts */
  private profileStore?: SqliteUserProfileStore;

  constructor(
    public readonly topicStore: JsonlTopicIndexStore,
    public readonly coreStore: SqliteCoreMemoryStore,
    private llm: LLMProvider,
    public readonly sessionId: string,
    public readonly characterId: string,
    options?: {
      batchSize?: number;
      coreUpgradeThreshold?: number;
      turnLookup?: SessionTurnLookup;
      profileStore?: SqliteUserProfileStore;
    }
  ) {
    this.batchSize = options?.batchSize || 50;
    this.coreUpgradeThreshold = options?.coreUpgradeThreshold ?? 3;
    this.turnLookup = options?.turnLookup;
    this.profileStore = options?.profileStore;
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
      await this.extractProfileFromExplicit(turn);
    }
  }

  private async writeExplicit(turn: ConversationTurn): Promise<void> {
    try {
      const rawText = getTurnText(turn);
      const memoryText = await this.extractExplicitMemory(rawText);
      const embedding = await embed(memoryText);

      // Dedup: repeating "记住X" must reinforce the existing memory, not
      // pile up duplicates.
      const duplicate = await this.findDuplicateCoreMemory(memoryText, embedding);
      if (duplicate) {
        await this.coreStore.update(duplicate.id, {
          strength: 1.0,
          lastRecalledAt: new Date(),
          disabled: false
        });
        console.log(`[Memory] Explicit memory reinforced existing: ${duplicate.id}`);
        return;
      }

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

  /**
   * Distill an explicit "记住…" request into a standalone fact. Falls back
   * to the raw text when the LLM is unavailable.
   */
  private async extractExplicitMemory(rawText: string): Promise<string> {
    try {
      const prompt = `用户说了下面这句话，希望被长期记住。请提取其中需要记住的事实，用一句以「用户」开头的第三人称陈述表述（例如「用户对花生过敏」）。

要求：
- 只保留事实本身，去掉「记住」「别忘了」等指令词
- 不要添加原话中没有的信息
- 只返回这一句话，不要其他解释

原话：${rawText}`;

      const extracted = (await collectLLMText(this.llm, prompt)).trim().replace(/^["'「』『」]+|["'「』『」]+$/g, '');
      // Guard against the LLM returning nothing, rambling, or structured
      // output (e.g. JSON) instead of a plain sentence.
      const looksStructured = extracted.startsWith('[') || extracted.startsWith('{') || extracted.includes('\n');
      if (extracted.length > 0 && extracted.length <= rawText.length + 40 && !looksStructured) {
        return extracted;
      }
    } catch (error) {
      console.warn('[Memory] Explicit memory extraction failed, storing raw text:', error);
    }
    return rawText;
  }

  private async findDuplicateCoreMemory(text: string, embedding: number[]): Promise<CoreMemory | null> {
    const normalized = normalizeMemoryText(text);

    // Dedup must see the whole session including disabled rows: repeating
    // "记住X" after disabling X should re-enable that memory, not create an
    // enabled twin next to it. The store's vectorSearch is unsuitable here —
    // it is character-global and filters disabled rows, so it could
    // reinforce another session's memory while this session's disabled twin
    // stays invisible. Session memories are few, so scoring them in-process
    // is cheap.
    const existing = await this.coreStore.getBySession(this.sessionId, true);
    const exact = existing.find(m => normalizeMemoryText(m.text) === normalized);
    if (exact) {
      return exact;
    }

    let closest: CoreMemory | null = null;
    let bestSimilarity = 0;
    for (const memory of existing) {
      const similarity = cosineSimilarity(embedding, memory.embedding);
      if (similarity > bestSimilarity) {
        bestSimilarity = similarity;
        closest = memory;
      }
    }
    return bestSimilarity >= EXPLICIT_DUPLICATE_SIMILARITY ? closest : null;
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
            lastMentioned: topic.lastMentioned,
            // Recency wins: the newest batch's recap reflects the latest state
            ...(topic.summary ? { summary: topic.summary } : {})
          });

          if (merged) {
            // Refresh local view so later topics in this batch merge correctly
            const index = existingTopics.findIndex(t => t.id === merged.id);
            if (index >= 0) {
              existingTopics[index] = merged;
            }
            await this.maybeUpgradeToCoreMemory(merged, existingTopics);
          }
        } else {
          const storedTopic = await this.topicStore.append(topic);
          existingTopics.push(storedTopic);
          await this.maybeUpgradeToCoreMemory(storedTopic, existingTopics);
        }
      }

      console.log(`[Memory] Processed ${topics.length} topic indices`);
    } catch (error) {
      console.error('[Memory] Failed to build topic index:', error);
      throw error;
    }
  }

  /**
   * Promote a topic once it has genuinely accumulated enough mentions. The
   * coreMemoryId marker is written only after a successful insert, which
   * makes promotion both idempotent (never duplicated) and retryable (a
   * transient embed/insert failure is retried on the next batch).
   */
  private async maybeUpgradeToCoreMemory(topic: TopicIndex, existingTopics: TopicIndex[]): Promise<void> {
    if (topic.coreMemoryId || topic.mentionCount < this.coreUpgradeThreshold) {
      return;
    }

    const coreMemoryId = await this.upgradeToCoreMemory(topic);
    if (!coreMemoryId) {
      return;
    }

    const marked = await this.topicStore.update(topic.id, { coreMemoryId });
    if (marked) {
      const index = existingTopics.findIndex(t => t.id === marked.id);
      if (index >= 0) {
        existingTopics[index] = marked;
      }
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

      const prompt = `请分析以下对话，提取 2-4 个主要话题，以及用户自述的硬事实。

话题提取规则：
- 只提取用户认真讨论过的内容，忽略寒暄、玩笑、反讽、假设和角色扮演中的虚构设定
- 不要把代码片段、工具输出、系统提示或引用的第三方内容当作用户自己的话题
- 用户已否认或纠正过的说法，以最终确认的版本为准，不要保留旧说法
- 不要推测对话中没有出现的信息，summary 只能概括对话里真实出现的内容

用户画像提取规则：
- 只提取用户明确说的关于自己的硬事实（过敏、重要日期、职业、家庭成员、身份属性等）
- 忽略假设、玩笑、第三方的事、临时状态（"今天有点累"不算）
- 分类：allergy(过敏原) / important-date(重要日期) / identity(身份属性如职业、居住地) / preference(偏好) / free-form(其他)
- 如果用户纠正了之前的说法，在新 fact 的 supersedes 字段填入被覆盖的旧 key（key 相同表示覆盖）

对话内容：
${conversationText}

请以 JSON 格式返回，例如：
{
  "topics": [
    {
      "topic": "讨论天气和心情的关系",
      "summary": "用户说连续下雨让自己情绪低落，助手建议在室内做些喜欢的事。用户提到打算周末去看电影。",
      "keywords": ["天气", "心情", "阳光", "下雨"],
      "mentionCount": 3
    }
  ],
  "profileFacts": [
    {
      "category": "allergy",
      "key": "过敏原",
      "value": "花生",
      "supersedes": []
    },
    {
      "category": "important-date",
      "key": "认识日期",
      "value": "2026-07-05"
    }
  ]
}

只返回 JSON，不要其他解释。`;

      const responseText = await collectLLMText(this.llm, prompt);

      // Try to parse JSON from response
      let result: {
        topics: Array<{topic: string, summary?: string, keywords: string[], mentionCount: number}>;
        profileFacts?: ExtractedProfileFact[];
      } = { topics: [] };

      // Extract JSON from response (might be wrapped in markdown code blocks)
      const jsonMatch = responseText.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        result = JSON.parse(jsonMatch[0]);
      }

      if (result.topics.length === 0) {
        throw new Error('No topics extracted from LLM response');
      }

      // Process profile facts if present
      if (result.profileFacts && result.profileFacts.length > 0) {
        await this.storeProfileFacts(result.profileFacts, turns);
      }

      const firstTurn = turns[0];
      const lastTurn = turns[turns.length - 1];

      return result.topics.map(t => ({
        sessionId: this.sessionId,
        characterId: this.characterId,
        topic: t.topic,
        ...(typeof t.summary === 'string' && t.summary.trim().length > 0
          ? { summary: t.summary.trim().slice(0, 300) }
          : {}),
        keywords: t.keywords,
        timeRange: [toDate(firstTurn.timestamp), toDate(lastTurn.timestamp)] as [Date, Date],
        turnIds: turns.map(turn => turn.id),
        mentionCount: t.mentionCount || 1,
        lastMentioned: toDate(lastTurn.timestamp)
      }));

    } catch (error) {
      console.warn('[Memory] LLM topic extraction failed, using fallback:', error);

      // Fallback: keyword-only placeholder so the batch still lands in the
      // topic index. mentionCount is 0 so fallback batches can never
      // accumulate into a core-memory promotion — a degraded extractor must
      // not decide what becomes permanent.
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
        mentionCount: 0,
        lastMentioned: toDate(lastTurn.timestamp)
      }];
    }
  }

  /** Returns the created core memory id, or null when the promotion failed. */
  private async upgradeToCoreMemory(topic: TopicIndex): Promise<string | null> {
    try {
      console.log(`[Memory] Upgrading high-frequency topic to core memory: ${topic.topic}`);

      // Prefer the recap over the bare title: it carries what was actually
      // said, which makes both the embedding and the recalled text richer.
      const memoryContent = topic.summary && topic.summary.length > 0 ? topic.summary : topic.topic;
      const embedding = await embed(memoryContent);

      const memory: CoreMemory = {
        id: createCoreMemoryId(),
        sessionId: topic.sessionId,
        characterId: topic.characterId,
        text: memoryContent,
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
      return memory.id;
    } catch (error) {
      // Never rethrow: a failed upgrade must not abort the batch, otherwise
      // the retry would re-merge topics and double-count mentions. Returning
      // null leaves the topic unmarked so the promotion retries next batch.
      console.error('[Memory] Failed to upgrade topic to core memory:', error);
      return null;
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

  /**
   * Extract profile facts from explicit "记住…" requests.
   * Runs after writeExplicit so both CoreMemory and ProfileFact are created.
   */
  private async extractProfileFromExplicit(turn: ConversationTurn): Promise<void> {
    if (!this.profileStore) return;

    try {
      const rawText = getTurnText(turn);
      const prompt = `用户说了下面这句话，希望被长期记住。请判断这是否包含关于用户自己的硬事实（过敏、重要日期、职业、家庭成员等），如果是，提取为结构化的 profileFact。

分类：
- allergy: 过敏原
- important-date: 重要日期（生日、纪念日等）
- identity: 身份属性（职业、居住地、家庭成员）
- preference: 偏好（饮食、兴趣）
- free-form: 其他硬事实

如果不是关于用户自己的硬事实（比如只是希望记住某个对话内容、某个观点），返回空数组。

原话：${rawText}

返回 JSON 格式：
{
  "facts": [
    {
      "category": "allergy",
      "key": "过敏原",
      "value": "花生"
    }
  ]
}

只返回 JSON，不要其他解释。`;

      const responseText = await collectLLMText(this.llm, prompt);
      const jsonMatch = responseText.match(/\{[\s\S]*\}/);
      if (!jsonMatch) return;

      const result = JSON.parse(jsonMatch[0]) as { facts: ExtractedProfileFact[] };
      if (result.facts && result.facts.length > 0) {
        await this.storeProfileFacts(result.facts, [turn]);
      }
    } catch (error) {
      console.error('[Memory] Failed to extract profile from explicit memory:', error);
    }
  }

  /**
   * Store extracted profile facts, handling dedup and supersedes logic.
   */
  private async storeProfileFacts(facts: ExtractedProfileFact[], sourceTurns: ConversationTurn[]): Promise<void> {
    if (!this.profileStore) return;

    try {
      const existing = await this.profileStore.getBySession(this.sessionId, this.characterId, true);

      for (const extracted of facts) {
        const normalizedKey = normalizeProfileKey(extracted.key);

        // Find facts with the same normalized key
        const duplicates = existing.filter(e =>
          normalizeProfileKey(e.key) === normalizedKey &&
          e.category === extracted.category
        );

        if (duplicates.length > 0) {
          // Check if value is identical to an existing fact
          const identical = duplicates.find(d =>
            normalizeProfileKey(d.value) === normalizeProfileKey(extracted.value)
          );

          if (identical) {
            // Reinforce existing fact (re-enable if disabled)
            await this.profileStore.update(identical.id, { disabled: false });
            console.log(`[Memory] Profile fact reinforced: ${identical.id}`);
            continue;
          }

          // New value supersedes old ones
          const fact: UserProfileFact = {
            id: createProfileFactId(),
            sessionId: this.sessionId,
            characterId: this.characterId,
            category: extracted.category,
            key: extracted.key,
            value: extracted.value,
            createdAt: new Date(),
            sourceTurnIds: sourceTurns.map(t => t.id),
            supersedes: duplicates.map(d => d.id),
            disabled: false
          };

          await this.profileStore.insert(fact);
          console.log(`[Memory] Profile fact created (supersedes ${duplicates.length}): ${fact.id}`);
        } else {
          // Brand new fact
          const fact: UserProfileFact = {
            id: createProfileFactId(),
            sessionId: this.sessionId,
            characterId: this.characterId,
            category: extracted.category,
            key: extracted.key,
            value: extracted.value,
            createdAt: new Date(),
            sourceTurnIds: sourceTurns.map(t => t.id),
            disabled: false
          };

          await this.profileStore.insert(fact);
          console.log(`[Memory] Profile fact created: ${fact.id}`);
        }
      }
    } catch (error) {
      console.error('[Memory] Failed to store profile facts:', error);
    }
  }

  /** Expose profile store for runtime-loop to access */
  getProfileStore(): SqliteUserProfileStore | undefined {
    return this.profileStore;
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

function normalizeMemoryText(text: string): string {
  return text.replace(/\s+/g, '').toLowerCase();
}

function normalizeProfileKey(text: string): string {
  return text.trim().toLowerCase().replace(/\s+/g, '');
}

const EXPLICIT_DUPLICATE_SIMILARITY = 0.92;

function cosineSimilarity(a: number[], b: number[]): number {
  // Mismatched dimensions (e.g. embedding provider changed) simply mean
  // "not a duplicate" — dedup must never throw over it.
  if (a.length === 0 || a.length !== b.length) {
    return 0;
  }
  let dotProduct = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i++) {
    dotProduct += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  const denominator = Math.sqrt(normA) * Math.sqrt(normB);
  return denominator === 0 ? 0 : dotProduct / denominator;
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

function createProfileFactId(): string {
  const randomUUID = globalThis.crypto?.randomUUID;
  return `profile-${randomUUID ? randomUUID.call(globalThis.crypto) : `${Date.now()}-${Math.random().toString(36).slice(2, 11)}`}`;
}
