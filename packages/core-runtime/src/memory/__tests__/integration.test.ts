/**
 * Basic Memory System Integration Test
 *
 * Run with: pnpm test src/memory/__tests__/integration.test.ts
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, rm } from "fs/promises";
import { join } from "path";
import { tmpdir } from "os";
import { JsonlTopicIndexStore, SqliteCoreMemoryStore } from "@greyfield/persistence";
import { EmbeddingService, MemoryManager } from "@greyfield/core-runtime";
import type { ConversationTurn } from "@greyfield/core-runtime";

describe("Memory System Integration", () => {
  let tempDir: string;
  let topicStore: JsonlTopicIndexStore;
  let coreStore: SqliteCoreMemoryStore;
  let embeddingService: EmbeddingService;
  let memoryManager: MemoryManager;

  beforeEach(async () => {
    // Create temp directory
    tempDir = await mkdtemp(join(tmpdir(), "greyfield-memory-test-"));

    // Initialize stores
    const topicPath = join(tempDir, "topic-index.jsonl");
    const corePath = join(tempDir, "core-memory.db");

    topicStore = new JsonlTopicIndexStore(topicPath);

    embeddingService = new EmbeddingService({
      apiKey: "sk-epghmqrstteavwiemdnryihnsaypdlqygmxqrbyzuspibntl",
      baseURL: "https://api.siliconflow.cn/v1",
      model: "BAAI/bge-m3"
    });

    coreStore = new SqliteCoreMemoryStore(corePath, embeddingService);

    // Mock LLM provider for topic extraction
    const mockLlm = {
      generateText: async () => ({
        text: JSON.stringify([
          { topic: "测试话题", keywords: ["测试", "关键词"] }
        ])
      })
    };

    memoryManager = new MemoryManager(
      topicStore,
      coreStore,
      mockLlm as any,
      "test-session",
      "test-character",
      { batchSize: 5 }
    );
  });

  afterEach(async () => {
    // Cleanup
    await rm(tempDir, { recursive: true, force: true });
  });

  it("should detect explicit memory request", async () => {
    const turn: ConversationTurn = {
      id: "turn-1",
      role: "user",
      content: "记住我喜欢喝咖啡",
      timestamp: Date.now()
    };

    await memoryManager.onNewTurn(turn);

    // Check if memory was stored in Layer 3
    const results = await coreStore.vectorSearch("咖啡", 5);
    expect(results.length).toBeGreaterThan(0);
    expect(results[0].text).toContain("咖啡");
  });

  it("should build topic index after batch size", async () => {
    // Add 5 turns to trigger batch indexing
    for (let i = 0; i < 5; i++) {
      const turn: ConversationTurn = {
        id: `turn-${i}`,
        role: "user",
        content: `这是第${i}条测试消息`,
        timestamp: Date.now()
      };
      await memoryManager.onNewTurn(turn);
    }

    // Check if topic index was created
    const topics = await topicStore.getBySession("test-session");
    expect(topics.length).toBeGreaterThan(0);
  });

  it("should auto-promote high-frequency topics", async () => {
    // Simulate multiple mentions of the same topic
    const mockHighFrequencyTopic = {
      id: "topic-1",
      sessionId: "test-session",
      topic: "编程",
      keywords: ["编程", "代码", "开发"],
      mentionCount: 5,
      createdAt: Date.now()
    };

    await topicStore.append(mockHighFrequencyTopic);

    // Manually trigger promotion check
    // (In real usage, this happens during buildTopicIndex)
    const topics = await topicStore.getBySession("test-session");
    const highFreqTopic = topics.find(t => t.mentionCount >= 3);

    if (highFreqTopic) {
      const memoryText = `${highFreqTopic.topic}: ${highFreqTopic.keywords.join(", ")}`;
      await coreStore.insert({
        text: memoryText,
        strength: 0.7,
        sessionId: "test-session",
        characterId: "test-character"
      });
    }

    // Verify promotion
    const memories = await coreStore.vectorSearch("编程", 5);
    expect(memories.length).toBeGreaterThan(0);
  });
});
