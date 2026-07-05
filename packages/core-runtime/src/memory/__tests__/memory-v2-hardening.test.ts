/**
 * Regression tests for memory V2 hardening:
 * - LLM-failure fallback must never sediment into core memory
 * - topics merge across batches and upgrade to core memory exactly once
 * - explicit memory failures must not break turn recording
 * - close() flushes the unindexed-turn buffer
 * - recall applies a similarity threshold and time decay, and only
 *   reinforces memories that actually passed the filter
 */

import { describe, it, expect } from "vitest";
import { MemoryManager } from "../memory-manager";
import { recall, decayedStrength } from "../recall";
import { deterministicEmbedding } from "../embedding";
import type { ConversationTurn, CoreMemory, TopicIndex } from "../types";
import type { UserProfileFact } from "../user-profile";

class FakeTopicStore {
  topics: TopicIndex[] = [];
  private sequence = 0;

  async append(topic: Omit<TopicIndex, "id">): Promise<TopicIndex> {
    this.sequence += 1;
    const stored = { ...topic, id: `topic-${this.sequence}` };
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

  async update(id: string, updates: Partial<TopicIndex>): Promise<TopicIndex | null> {
    const index = this.topics.findIndex(t => t.id === id);
    if (index < 0) {
      return null;
    }
    this.topics[index] = { ...this.topics[index], ...updates };
    return this.topics[index];
  }
}

class FakeCoreStore {
  memories: CoreMemory[] = [];
  searchResults: CoreMemory[] = [];
  updates: Array<{ id: string; updates: Partial<CoreMemory> }> = [];
  closed = false;

  async insert(memory: CoreMemory): Promise<void> {
    this.memories.push(memory);
  }

  async update(id: string, updates: Partial<CoreMemory>): Promise<void> {
    this.updates.push({ id, updates });
    const index = this.memories.findIndex(m => m.id === id);
    if (index >= 0) {
      this.memories[index] = { ...this.memories[index], ...updates };
    }
  }

  async get(id: string): Promise<CoreMemory | null> {
    return this.memories.find(m => m.id === id) ?? null;
  }

  // Mirrors the real store: disabled rows are hidden unless explicitly asked for
  async getBySession(sessionId: string, includeDisabled = false): Promise<CoreMemory[]> {
    return this.memories.filter(m => m.sessionId === sessionId && (includeDisabled || !m.disabled));
  }

  async vectorSearch(): Promise<CoreMemory[]> {
    return this.searchResults;
  }

  close(): void {
    this.closed = true;
  }
}

class FakeProfileStore {
  facts: UserProfileFact[] = [];
  updates: Array<{ id: string; updates: Partial<UserProfileFact> }> = [];

  async insert(fact: UserProfileFact): Promise<void> {
    const index = this.facts.findIndex(existing =>
      existing.sessionId === fact.sessionId &&
      existing.characterId === fact.characterId &&
      existing.category === fact.category &&
      existing.key.toLowerCase() === fact.key.toLowerCase()
    );
    if (index >= 0) {
      this.facts[index] = { ...this.facts[index], ...fact, id: this.facts[index].id };
      return;
    }
    this.facts.push(fact);
  }

  async update(id: string, updates: Partial<UserProfileFact>): Promise<void> {
    this.updates.push({ id, updates });
    const index = this.facts.findIndex(fact => fact.id === id);
    if (index >= 0) {
      this.facts[index] = { ...this.facts[index], ...updates };
    }
  }

  async getBySession(sessionId: string, characterId: string, includeDisabled = false): Promise<UserProfileFact[]> {
    return this.facts.filter(fact =>
      fact.sessionId === sessionId &&
      fact.characterId === characterId &&
      (includeDisabled || !fact.disabled)
    );
  }
}

function makeTurn(index: number, text: string): ConversationTurn {
  return {
    id: `turn-${index}`,
    sessionId: "test-session",
    characterId: "test-character",
    role: index % 2 === 0 ? "user" : "assistant",
    text,
    timestamp: Date.now()
  };
}

function makeManager(overrides: {
  llmResponse?: () => AsyncIterable<string>;
  batchSize?: number;
  topicStore?: FakeTopicStore;
  coreStore?: FakeCoreStore;
  profileStore?: FakeProfileStore;
}) {
  const topicStore = overrides.topicStore ?? new FakeTopicStore();
  const coreStore = overrides.coreStore ?? new FakeCoreStore();
  const llm = {
    stream: overrides.llmResponse ?? (async function* () {
      yield JSON.stringify({
        topics: [{ topic: "聊猫咪的日常", keywords: ["猫咪", "宠物", "喂食"], mentionCount: 1 }],
        profileFacts: []
      });
    })
  };
  const manager = new MemoryManager(
    topicStore as any,
    coreStore as any,
    llm as any,
    "test-session",
    "test-character",
    { batchSize: overrides.batchSize ?? 2, profileStore: overrides.profileStore as any }
  );
  return { manager, topicStore, coreStore, profileStore: overrides.profileStore };
}

function makeMemory(overrides: Partial<CoreMemory>): CoreMemory {
  return {
    id: "mem-1",
    sessionId: "test-session",
    characterId: "test-character",
    text: "用户喜欢猫咪",
    embedding: [],
    strength: 0.8,
    createdAt: new Date(),
    sources: { turnIds: [] },
    disabled: false,
    ...overrides
  };
}

describe("topic extraction fallback", () => {
  it("never promotes fallback topics to core memory when the LLM fails", async () => {
    const { manager, topicStore, coreStore } = makeManager({
      llmResponse: async function* () {
        throw new Error("LLM unavailable");
      }
    });

    await manager.onNewTurn(makeTurn(0, "我今天弹了两个小时钢琴"));
    await manager.onNewTurn(makeTurn(1, "钢琴练习很辛苦但很值得"));

    expect(topicStore.topics).toHaveLength(1);
    // 0, not 1: fallback batches must never accumulate into core promotion
    expect(topicStore.topics[0].mentionCount).toBe(0);
    expect(coreStore.memories).toHaveLength(0);
  });

  it("never promotes even after many merged fallback batches", async () => {
    const { manager, coreStore } = makeManager({
      llmResponse: async function* () {
        throw new Error("LLM unavailable");
      }
    });

    for (let batch = 0; batch < 5; batch++) {
      await manager.onNewTurn(makeTurn(batch * 2, `我今天弹钢琴了 ${batch}`));
      await manager.onNewTurn(makeTurn(batch * 2 + 1, `钢琴练习不容易 ${batch}`));
    }

    expect(coreStore.memories).toHaveLength(0);
  });

  it("extracts usable keywords from whitespace-free Chinese text", async () => {
    const { manager, topicStore } = makeManager({
      llmResponse: async function* () {
        throw new Error("LLM unavailable");
      }
    });

    await manager.onNewTurn(makeTurn(0, "我今天弹了两个小时钢琴"));
    await manager.onNewTurn(makeTurn(1, "钢琴练习很辛苦但很值得"));

    expect(topicStore.topics[0].keywords.length).toBeGreaterThan(0);
    expect(topicStore.topics[0].keywords.every(kw => kw.length > 1)).toBe(true);
    // Whole contiguous Chinese sentences must not appear as keywords —
    // only 2-4 char n-grams survive for pure-Han text
    expect(topicStore.topics[0].keywords.every(kw => kw.length <= 4)).toBe(true);
  });
});

describe("cross-batch topic merging", () => {
  it("accumulates mentionCount across batches and upgrades exactly once", async () => {
    const { manager, topicStore, coreStore } = makeManager({});

    // Four batches of the same topic, mentionCount 1 each
    for (let batch = 0; batch < 4; batch++) {
      await manager.onNewTurn(makeTurn(batch * 2, `猫咪今天很粘人 ${batch}`));
      await manager.onNewTurn(makeTurn(batch * 2 + 1, `是啊猫咪就是这样 ${batch}`));
    }

    // Merged into a single topic with a real accumulated count
    expect(topicStore.topics).toHaveLength(1);
    expect(topicStore.topics[0].mentionCount).toBe(4);
    // Upgraded exactly once, when crossing the threshold of 3
    expect(coreStore.memories).toHaveLength(1);
    expect(coreStore.memories[0].strength).toBe(0.7);
  });

  it("retries a failed promotion on the next batch instead of losing it", async () => {
    const coreStore = new FakeCoreStore();
    let remainingFailures = 1;
    const originalInsert = coreStore.insert.bind(coreStore);
    coreStore.insert = async (memory) => {
      if (remainingFailures > 0) {
        remainingFailures -= 1;
        throw new Error("embed service down");
      }
      return originalInsert(memory);
    };
    const { manager, topicStore } = makeManager({ coreStore });

    // Batch 3 crosses the threshold but the insert fails; batch 4 retries
    for (let batch = 0; batch < 4; batch++) {
      await manager.onNewTurn(makeTurn(batch * 2, `猫咪今天很粘人 ${batch}`));
      await manager.onNewTurn(makeTurn(batch * 2 + 1, `是啊猫咪就是这样 ${batch}`));
    }

    expect(coreStore.memories).toHaveLength(1);
    // Marker written only after the successful attempt
    expect(topicStore.topics[0].coreMemoryId).toBeDefined();
  });

  it("upgrades immediately when a single batch reports high frequency", async () => {
    const { manager, coreStore } = makeManager({
      llmResponse: async function* () {
        yield JSON.stringify({
          topics: [{ topic: "反复聊到工作压力", keywords: ["工作", "压力", "加班"], mentionCount: 5 }],
          profileFacts: []
        });
      }
    });

    await manager.onNewTurn(makeTurn(0, "最近工作压力好大"));
    await manager.onNewTurn(makeTurn(1, "加班太多了要注意休息"));

    expect(coreStore.memories).toHaveLength(1);
  });
});

describe("index-time topic summaries", () => {
  it("stores the LLM recap on the topic and uses it for the core memory text", async () => {
    const { manager, topicStore, coreStore } = makeManager({
      llmResponse: async function* () {
        yield JSON.stringify({
          topics: [{
            topic: "聊猫咪生病",
            summary: "用户的猫不吃饭，去医院检查后开始吃药，情况在好转。",
            keywords: ["猫咪", "生病", "医院"],
            mentionCount: 5
          }],
          profileFacts: []
        });
      }
    });

    await manager.onNewTurn(makeTurn(0, "我家猫生病了"));
    await manager.onNewTurn(makeTurn(1, "去医院看看吧"));

    expect(topicStore.topics[0].summary).toContain("开始吃药");
    // Core memory carries the recap, not just the bare title
    expect(coreStore.memories).toHaveLength(1);
    expect(coreStore.memories[0].text).toContain("开始吃药");
  });

  it("keeps the newest recap when topics merge across batches", async () => {
    let batchIndex = 0;
    const { manager, topicStore } = makeManager({
      llmResponse: async function* () {
        batchIndex += 1;
        yield JSON.stringify({
          topics: [{
            topic: "聊猫咪生病",
            summary: `第${batchIndex}批概要`,
            keywords: ["猫咪", "生病", "医院"],
            mentionCount: 1
          }],
          profileFacts: []
        });
      }
    });

    for (let batch = 0; batch < 2; batch++) {
      await manager.onNewTurn(makeTurn(batch * 2, `猫咪 ${batch}`));
      await manager.onNewTurn(makeTurn(batch * 2 + 1, `生病 ${batch}`));
    }

    expect(topicStore.topics).toHaveLength(1);
    expect(topicStore.topics[0].summary).toBe("第2批概要");
  });
});

describe("profile fact extraction", () => {
  it("stores profile facts even when the LLM returns no topics", async () => {
    const profileStore = new FakeProfileStore();
    const { manager } = makeManager({
      profileStore,
      llmResponse: async function* () {
        yield JSON.stringify({
          profileFacts: [
            { category: "allergy", key: "过敏原", value: "花生" }
          ]
        });
      }
    });

    await manager.onNewTurn(makeTurn(0, "我对花生过敏"));
    await manager.onNewTurn(makeTurn(1, "以后会记得"));

    expect(profileStore.facts).toHaveLength(1);
    expect(profileStore.facts[0]).toMatchObject({
      sessionId: "test-session",
      characterId: "test-character",
      category: "allergy",
      key: "过敏原",
      value: "花生",
      sourceTurnIds: ["turn-0", "turn-1"],
      disabled: false
    });
  });

  it("resolves profile supersedes keys to stored fact IDs", async () => {
    const profileStore = new FakeProfileStore();
    profileStore.facts.push({
      id: "old-profile-fact",
      sessionId: "test-session",
      characterId: "test-character",
      category: "identity",
      key: "称呼",
      value: "老板",
      createdAt: new Date("2026-07-01T00:00:00.000Z"),
      sourceTurnIds: ["turn-old"],
      disabled: false
    });

    const { manager } = makeManager({
      profileStore,
      llmResponse: async function* () {
        yield JSON.stringify({
          profileFacts: [
            { category: "identity", key: "昵称", value: "阿岚", supersedes: ["称 呼"] }
          ]
        });
      }
    });

    await manager.onNewTurn(makeTurn(0, "以后叫我阿岚"));
    await manager.onNewTurn(makeTurn(1, "好的"));

    const newFact = profileStore.facts.find(fact => fact.key === "昵称");
    expect(newFact?.supersedes).toEqual(["old-profile-fact"]);
  });

  it("merges resolved supersedes IDs when reinforcing an existing profile fact", async () => {
    const profileStore = new FakeProfileStore();
    profileStore.facts.push(
      {
        id: "old-profile-fact",
        sessionId: "test-session",
        characterId: "test-character",
        category: "identity",
        key: "称呼",
        value: "老板",
        createdAt: new Date("2026-07-01T00:00:00.000Z"),
        sourceTurnIds: ["turn-old"],
        disabled: false
      },
      {
        id: "new-profile-fact",
        sessionId: "test-session",
        characterId: "test-character",
        category: "identity",
        key: "昵称",
        value: "阿岚",
        createdAt: new Date("2026-07-02T00:00:00.000Z"),
        sourceTurnIds: ["turn-existing"],
        disabled: false
      }
    );

    const { manager } = makeManager({
      profileStore,
      llmResponse: async function* () {
        yield JSON.stringify({
          profileFacts: [
            { category: "identity", key: "昵称", value: "阿岚", supersedes: ["称呼"] }
          ]
        });
      }
    });

    await manager.onNewTurn(makeTurn(0, "以后叫我阿岚"));
    await manager.onNewTurn(makeTurn(1, "好的"));

    const reinforcedFact = profileStore.facts.find(fact => fact.id === "new-profile-fact");
    expect(reinforcedFact?.supersedes).toEqual(["old-profile-fact"]);
  });
});

describe("explicit memory failures", () => {
  it("does not throw from onNewTurn when the explicit write fails", async () => {
    const coreStore = new FakeCoreStore();
    coreStore.insert = async () => {
      throw new Error("disk full");
    };
    const { manager } = makeManager({ coreStore, batchSize: 50 });

    await expect(
      manager.onNewTurn(makeTurn(0, "记住我对花生过敏"))
    ).resolves.toBeUndefined();
  });
});

describe("explicit memory extraction and dedup", () => {
  it("stores the LLM-distilled fact instead of the raw sentence", async () => {
    const coreStore = new FakeCoreStore();
    const { manager } = makeManager({
      coreStore,
      batchSize: 50,
      llmResponse: async function* () {
        yield "用户对花生过敏";
      }
    });

    await manager.onNewTurn(makeTurn(0, "记住我对花生过敏，很重要"));

    expect(coreStore.memories).toHaveLength(1);
    expect(coreStore.memories[0].text).toBe("用户对花生过敏");
    expect(coreStore.memories[0].strength).toBe(1.0);
  });

  it("falls back to the raw sentence when the LLM returns structured output", async () => {
    const coreStore = new FakeCoreStore();
    const { manager } = makeManager({
      coreStore,
      batchSize: 50,
      llmResponse: async function* () {
        yield JSON.stringify([{ topic: "无关话题", keywords: [] }]);
      }
    });

    await manager.onNewTurn(makeTurn(0, "记住我对花生过敏"));

    expect(coreStore.memories).toHaveLength(1);
    expect(coreStore.memories[0].text).toBe("记住我对花生过敏");
  });

  it("reinforces an existing identical memory instead of duplicating it", async () => {
    const coreStore = new FakeCoreStore();
    coreStore.memories.push(makeMemory({ id: "existing", text: "用户对花生过敏", strength: 0.5 }));
    const { manager } = makeManager({
      coreStore,
      batchSize: 50,
      llmResponse: async function* () {
        yield "用户对花生过敏";
      }
    });

    await manager.onNewTurn(makeTurn(0, "记住我对花生过敏"));

    expect(coreStore.memories).toHaveLength(1);
    expect(coreStore.memories[0].strength).toBe(1.0);
    expect(coreStore.memories[0].disabled).toBe(false);
  });

  it("reinforces a near-duplicate found by embedding similarity", async () => {
    const coreStore = new FakeCoreStore();
    coreStore.memories.push(makeMemory({
      id: "existing",
      text: "用户吃花生会过敏",
      strength: 0.6,
      embedding: deterministicEmbedding("用户对花生过敏")
    }));
    const { manager } = makeManager({
      coreStore,
      batchSize: 50,
      llmResponse: async function* () {
        yield "用户对花生过敏";
      }
    });

    await manager.onNewTurn(makeTurn(0, "记住我对花生过敏"));

    expect(coreStore.memories).toHaveLength(1);
    expect(coreStore.memories[0].strength).toBe(1.0);
  });

  it("re-enables a disabled duplicate instead of creating an enabled twin", async () => {
    const coreStore = new FakeCoreStore();
    coreStore.memories.push(makeMemory({ id: "existing", text: "用户对花生过敏", strength: 0.5, disabled: true }));
    const { manager } = makeManager({
      coreStore,
      batchSize: 50,
      llmResponse: async function* () {
        yield "用户对花生过敏";
      }
    });

    await manager.onNewTurn(makeTurn(0, "记住我对花生过敏"));

    expect(coreStore.memories).toHaveLength(1);
    expect(coreStore.memories[0].disabled).toBe(false);
    expect(coreStore.memories[0].strength).toBe(1.0);
  });

  it("never dedups against another session's memories", async () => {
    const coreStore = new FakeCoreStore();
    const otherSession = makeMemory({
      id: "other-session-memory",
      sessionId: "other-session",
      text: "用户对花生过敏",
      strength: 0.6,
      embedding: deterministicEmbedding("用户对花生过敏")
    });
    coreStore.memories.push(otherSession);
    // The old character-global vector path would have surfaced this hit and
    // reinforced the other session's row instead of remembering anything here
    coreStore.searchResults = [{ ...otherSession, similarity: 0.97 }];
    const { manager } = makeManager({
      coreStore,
      batchSize: 50,
      llmResponse: async function* () {
        yield "用户对花生过敏";
      }
    });

    await manager.onNewTurn(makeTurn(0, "记住我对花生过敏"));

    // A fresh memory lands in the current session…
    const current = coreStore.memories.filter(m => m.sessionId === "test-session");
    expect(current).toHaveLength(1);
    expect(current[0].strength).toBe(1.0);
    // …and the other session's memory is left untouched
    expect(coreStore.memories.find(m => m.id === "other-session-memory")?.strength).toBe(0.6);
  });
});

describe("close()", () => {
  it("flushes unindexed turns before closing the store", async () => {
    const { manager, topicStore, coreStore } = makeManager({ batchSize: 50 });

    await manager.onNewTurn(makeTurn(0, "我们聊聊猫咪吧"));
    expect(topicStore.topics).toHaveLength(0);

    await manager.close();

    expect(topicStore.topics).toHaveLength(1);
    expect(coreStore.closed).toBe(true);
  });

  it("closes the store even when flushing fails", async () => {
    const { manager, coreStore, topicStore } = makeManager({ batchSize: 50 });
    topicStore.append = async () => {
      throw new Error("disk full");
    };

    await manager.onNewTurn(makeTurn(0, "我们聊聊猫咪吧"));
    await manager.close();

    expect(coreStore.closed).toBe(true);
  });
});

describe("recall filtering and decay", () => {
  it("filters low-similarity hits and reinforces only relevant memories", async () => {
    const coreStore = new FakeCoreStore();
    coreStore.searchResults = [
      makeMemory({ id: "relevant", similarity: 0.9 }),
      makeMemory({ id: "irrelevant", text: "完全无关的记忆", similarity: 0.05 })
    ];
    const { manager } = makeManager({ coreStore, batchSize: 50 });

    const result = await recall("你还记得我喜欢什么吗", manager);

    expect(result.memories.map(m => m.id)).toEqual(["relevant"]);
    expect(coreStore.updates.map(u => u.id)).toEqual(["relevant"]);
  });

  it("still returns recall results when reinforcement writes fail", async () => {
    const coreStore = new FakeCoreStore();
    coreStore.searchResults = [makeMemory({ id: "relevant", similarity: 0.9 })];
    coreStore.update = async () => {
      throw new Error("db locked");
    };
    const { manager } = makeManager({ coreStore, batchSize: 50 });

    const result = await recall("你还记得我喜欢什么吗", manager);

    expect(result.memories.map(m => m.id)).toEqual(["relevant"]);
  });

  it("treats decayed-out memories as forgotten", async () => {
    const coreStore = new FakeCoreStore();
    const ninetyDaysAgo = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);
    coreStore.searchResults = [
      makeMemory({ id: "stale", strength: 0.5, createdAt: ninetyDaysAgo, similarity: 0.9 })
    ];
    const { manager } = makeManager({ coreStore, batchSize: 50 });

    const result = await recall("你还记得吗", manager);

    // 0.5 * 0.5^(90/30) = 0.0625 < 0.3 → forgotten, falls through to Layer 2
    expect(result.memories).toHaveLength(0);
    expect(coreStore.updates).toHaveLength(0);
  });

  it("measures decay from the last recall, not only creation", () => {
    const now = new Date();
    const sixtyDaysAgo = new Date(now.getTime() - 60 * 24 * 60 * 60 * 1000);
    const fresh = decayedStrength(
      { strength: 0.8, createdAt: sixtyDaysAgo, lastRecalledAt: now },
      now,
      30
    );
    const stale = decayedStrength(
      { strength: 0.8, createdAt: sixtyDaysAgo },
      now,
      30
    );

    expect(fresh).toBeCloseTo(0.8);
    expect(stale).toBeCloseTo(0.2);
  });
});
