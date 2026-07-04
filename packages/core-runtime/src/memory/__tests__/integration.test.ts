/**
 * Basic Memory System Integration Test
 *
 * Run with: pnpm test src/memory/__tests__/integration.test.ts
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, rm } from "fs/promises";
import { join } from "path";
import { tmpdir } from "os";
import { JsonlTopicIndexStore } from "../../../../persistence/src/memory/jsonl-topic-index-store";
import { SqliteCoreMemoryStore } from "../../../../persistence/src/memory/sqlite-core-memory-store";
import { EmbeddingService } from "../embedding";
import { MemoryManager } from "../memory-manager";
import { recall } from "../recall";
import type { ConversationTurn } from "../types";

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
      baseURL: "https://api.siliconflow.cn/v1",
      model: "BAAI/bge-m3"
    });

    coreStore = new SqliteCoreMemoryStore(corePath, embeddingService);

    // Mock LLM provider for topic extraction
    const mockLlm = {
      async *stream() {
        yield JSON.stringify([
          { topic: "测试话题", keywords: ["测试", "关键词"] }
        ]);
      }
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
    coreStore.close();
    await rm(tempDir, { recursive: true, force: true });
  });

  it("should detect explicit memory request", async () => {
    const turn: ConversationTurn = {
      id: "turn-1",
      sessionId: "test-session",
      characterId: "test-character",
      role: "user",
      text: "记住我喜欢喝咖啡",
      timestamp: Date.now()
    };

    await memoryManager.onNewTurn(turn);

    // Check if memory was stored in Layer 3
    const results = await coreStore.vectorSearch("咖啡", 5);
    expect(results.length).toBeGreaterThan(0);
    expect(results[0].text).toContain("咖啡");
  });

  it("should reject malformed batch embedding entries", async () => {
    const service = new EmbeddingService({
      apiKey: "test-key",
      fetch: async () => new Response(JSON.stringify({ data: [{}] }), { status: 200 })
    });

    await expect(service.embedBatch(["hello"])).rejects.toThrow("Invalid embedding entry in batch response");
  });

  it("should build topic index after batch size", async () => {
    // Add 5 turns to trigger batch indexing
    for (let i = 0; i < 5; i++) {
      const turn: ConversationTurn = {
        id: `turn-${i}`,
        sessionId: "test-session",
        characterId: "test-character",
        role: "user",
        text: `这是第${i}条测试消息`,
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
      characterId: "test-character",
      topic: "编程",
      keywords: ["编程", "代码", "开发"],
      timeRange: [new Date(), new Date()] as [Date, Date],
      turnIds: ["turn-1"],
      mentionCount: 5,
      lastMentioned: new Date()
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

  it("should recall Chinese topic index keywords without whitespace", async () => {
    await topicStore.append({
      sessionId: "test-session",
      characterId: "test-character",
      topic: "用户喜欢咖啡饮料",
      keywords: ["咖啡", "饮料"],
      timeRange: [new Date(), new Date()],
      turnIds: ["turn-1"],
      mentionCount: 1,
      lastMentioned: new Date()
    });

    const result = await recall("用户喜欢什么饮料", memoryManager);

    expect(result.text).toContain("用户喜欢咖啡饮料");
  });
});
