/**
 * Layer 2 → Layer 1 drilldown tests: when vector recall misses but a topic
 * matches, recall must quote the raw conversation the topic points at —
 * not just the topic title.
 */

import { describe, it, expect } from "vitest";
import { MemoryManager } from "../memory-manager";
import { recall } from "../recall";
import type { SessionTurn } from "../../session-store";
import type { TopicIndex } from "../types";
import type { DeletedMemoryEvidence } from "../../memory-erasure";

class FakeTopicStore {
  constructor(public topics: TopicIndex[] = []) {}

  async append(topic: Omit<TopicIndex, "id">): Promise<TopicIndex> {
    const stored = { ...topic, id: `topic-${this.topics.length + 1}` };
    this.topics.push(stored);
    return stored;
  }

  async getBySession(sessionId: string): Promise<TopicIndex[]> {
    return this.topics.filter(t => t.sessionId === sessionId);
  }

  async search(keywords: string[]): Promise<TopicIndex[]> {
    const lower = keywords.map(kw => kw.toLowerCase());
    return this.topics
      .filter(t => lower.some(kw => t.keywords.some(tk => tk.toLowerCase().includes(kw))))
      .sort((a, b) => b.mentionCount - a.mentionCount);
  }

  async update(): Promise<TopicIndex | null> {
    return null;
  }
}

class EmptyCoreStore {
  async insert(): Promise<void> {}
  async update(): Promise<void> {}
  async get(): Promise<null> { return null; }
  async getBySession(): Promise<never[]> { return []; }
  async vectorSearch(): Promise<never[]> { return []; }
  close(): void {}
}

function makeTopic(overrides?: Partial<TopicIndex>): TopicIndex {
  return {
    id: "topic-1",
    sessionId: "test-session",
    characterId: "test-character",
    topic: "聊到猫咪生病去医院",
    keywords: ["猫咪", "生病", "医院"],
    timeRange: [new Date("2026-06-01"), new Date("2026-06-01")],
    turnIds: ["turn-1", "turn-2", "turn-3", "turn-4"],
    mentionCount: 2,
    lastMentioned: new Date("2026-06-01"),
    ...overrides
  };
}

function makeTurns(): SessionTurn[] {
  return [
    { id: "turn-1", role: "user", content: "我家猫咪最近不吃饭", createdAt: "2026-06-01T10:00:00Z" },
    { id: "turn-2", role: "assistant", content: "带它去医院看看吧，可能是生病了", createdAt: "2026-06-01T10:00:05Z" },
    { id: "turn-3", role: "user", content: "今天天气不错", createdAt: "2026-06-01T10:01:00Z" },
    { id: "turn-4", role: "assistant", content: "是啊，适合出门散步", createdAt: "2026-06-01T10:01:05Z" }
  ];
}

function makeManager(options: {
  topics?: TopicIndex[];
  turns?: SessionTurn[];
  lookupError?: boolean;
  noLookup?: boolean;
}) {
  const turnLookup = options.noLookup ? undefined : {
    getByIds: async (turnIds: string[]) => {
      if (options.lookupError) {
        throw new Error("session store unavailable");
      }
      return (options.turns ?? []).filter(t => turnIds.includes(t.id));
    }
  };
  const llm = { stream: async function* () { yield ""; } };
  return new MemoryManager(
    new FakeTopicStore(options.topics ?? [makeTopic()]) as any,
    new EmptyCoreStore() as any,
    llm as any,
    "test-session",
    "test-character",
    { batchSize: 50, ...(turnLookup ? { turnLookup } : {}) }
  );
}

function makeDeletedEvidence(turnIds: string[], sourceSessionId = "test-session"): DeletedMemoryEvidence {
  return {
    id: `deleted-${turnIds.join("-")}`,
    threadId: "test-thread",
    kind: "memory-atom",
    memoryId: "memory-x",
    sourceTurnIds: turnIds,
    sourceSessionId,
    deletedAt: "2026-06-02T00:00:00.000Z"
  };
}

describe("Layer 1 drilldown", () => {
  it("quotes the raw turns behind a matched topic", async () => {
    const manager = makeManager({ turns: makeTurns() });

    const result = await recall("我的猫咪生病那事后来怎么样了", manager);

    expect(result.text).toContain("相关话题回顾");
    expect(result.text).toContain("聊到猫咪生病去医院");
    expect(result.text).toContain("用户: 我家猫咪最近不吃饭");
    expect(result.text).toContain("AI: 带它去医院看看吧");
  });

  it("prefers query-relevant turns over unrelated ones", async () => {
    const manager = makeManager({ turns: makeTurns() });

    const result = await recall("我的猫咪生病那事后来怎么样了", manager);

    // Turns about the weather share no keywords with the query
    expect(result.text).not.toContain("今天天气不错");
  });

  it("includes the index-time recap in the drilldown output", async () => {
    const topic = makeTopic({ summary: "猫不吃饭，就医后开始吃药，正在好转。" });
    const manager = makeManager({ topics: [topic], turns: makeTurns() });

    const result = await recall("我的猫咪生病那事后来怎么样了", manager);

    expect(result.text).toContain("话题概要：猫不吃饭，就医后开始吃药，正在好转。");
    expect(result.text).toContain("当时的对话节选：");
  });

  it("includes the recap in the title-only fallback when Layer 1 is unavailable", async () => {
    const topic = makeTopic({ summary: "猫不吃饭，就医后开始吃药，正在好转。" });
    const manager = makeManager({ topics: [topic], noLookup: true });

    const result = await recall("我的猫咪生病那事后来怎么样了", manager);

    expect(result.text).toBe("相关话题：聊到猫咪生病去医院\n话题概要：猫不吃饭，就医后开始吃药，正在好转。");
  });

  it("falls back to the topic title when no turn lookup is available", async () => {
    const manager = makeManager({ noLookup: true });

    const result = await recall("我的猫咪生病那事后来怎么样了", manager);

    expect(result.text).toBe("相关话题：聊到猫咪生病去医院");
  });

  it("never falls back to a topic from another session", async () => {
    const manager = makeManager({
      topics: [
        makeTopic({
          id: "other-topic",
          sessionId: "other-session",
          topic: "Other session private topic",
          summary: "Other session private summary"
        })
      ],
      noLookup: true
    });

    const result = await recall("我的猫咪生病那事后来怎么样了", manager);

    expect(result.text).toBe("");
    expect(result.memories).toHaveLength(0);
  });

  it("falls back to the topic title when Layer 1 lookup fails", async () => {
    const manager = makeManager({ lookupError: true });

    const result = await recall("我的猫咪生病那事后来怎么样了", manager);

    expect(result.text).toBe("相关话题：聊到猫咪生病去医院");
  });

  it("quotes the tail of the conversation when no turn matches the query keywords", async () => {
    const topic = makeTopic({ keywords: ["猫咪", "生病"], turnIds: ["turn-3", "turn-4"] });
    const turns = makeTurns();
    const manager = makeManager({ topics: [topic], turns });

    const result = await recall("还记得猫咪生病吗", manager);

    expect(result.text).toContain("相关话题回顾");
    expect(result.text).toContain("今天天气不错");
  });

  it("respects the drilldown character budget", async () => {
    const longTurns: SessionTurn[] = Array.from({ length: 10 }, (_, i) => ({
      id: `turn-${i + 1}`,
      role: i % 2 === 0 ? "user" as const : "assistant" as const,
      content: `猫咪相关的超长对话内容${"字".repeat(200)}`,
      createdAt: "2026-06-01T10:00:00Z"
    }));
    const topic = makeTopic({ turnIds: longTurns.map(t => t.id) });
    const manager = makeManager({ topics: [topic], turns: longTurns });

    const result = await recall("猫咪", manager, { drilldownCharBudget: 300 });

    expect(result.text).toContain("相关话题回顾");
    // Header + at most ~budget of quoted lines (each line truncated to 120 chars)
    expect(result.text.length).toBeLessThan(600);
  });

  it("never quotes turns the user has deleted", async () => {
    const manager = makeManager({ turns: makeTurns() });

    const result = await recall("我的猫咪生病那事后来怎么样了", manager, {
      deletedEvidence: [makeDeletedEvidence(["turn-1"])]
    });

    expect(result.text).not.toContain("我家猫咪最近不吃饭");
    expect(result.text).toContain("AI: 带它去医院看看吧");
  });

  it("falls back to the topic title when every source turn is deleted", async () => {
    const manager = makeManager({ turns: makeTurns() });

    const result = await recall("我的猫咪生病那事后来怎么样了", manager, {
      deletedEvidence: [makeDeletedEvidence(["turn-1", "turn-2", "turn-3", "turn-4"])]
    });

    expect(result.text).toBe("相关话题：聊到猫咪生病去医院");
  });

  it("ignores deleted evidence scoped to a different session", async () => {
    const manager = makeManager({ turns: makeTurns() });

    const result = await recall("我的猫咪生病那事后来怎么样了", manager, {
      deletedEvidence: [makeDeletedEvidence(["turn-1"], "other-session")]
    });

    expect(result.text).toContain("用户: 我家猫咪最近不吃饭");
  });

  it("treats the char budget as strict: a zero budget disables the excerpt", async () => {
    const manager = makeManager({ turns: makeTurns() });

    const result = await recall("我的猫咪生病那事后来怎么样了", manager, { drilldownCharBudget: 0 });

    expect(result.text).toBe("相关话题：聊到猫咪生病去医院");
  });

  it("drops even the first turn when it does not fit the char budget", async () => {
    const manager = makeManager({ turns: makeTurns() });

    const result = await recall("我的猫咪生病那事后来怎么样了", manager, { drilldownCharBudget: 5 });

    expect(result.text).toBe("相关话题：聊到猫咪生病去医院");
  });
});
