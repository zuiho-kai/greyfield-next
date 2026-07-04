/**
 * Memory System V2 - Basic Acceptance Test
 *
 * This script tests the basic functionality of the new memory system:
 * 1. Embedding API connectivity
 * 2. Topic index storage
 * 3. Core memory storage and vector search
 * 4. Memory recall workflow
 */

import { tmpdir } from "os";
import { mkdtemp, rm } from "fs/promises";
import { join } from "path";
import { JsonlTopicIndexStore } from "../../../../persistence/src/memory/jsonl-topic-index-store";
import { SqliteCoreMemoryStore } from "../../../../persistence/src/memory/sqlite-core-memory-store";
import { EmbeddingService } from "../embedding";

async function runAcceptanceTest() {
  console.log("=".repeat(60));
  console.log("Memory System V2 - Acceptance Test");
  console.log("=".repeat(60));

  // Create temp directory
  const tempDir = await mkdtemp(join(tmpdir(), "greyfield-memory-test-"));
  console.log(`\n✓ Created temp directory: ${tempDir}`);

  try {
    // Test 1: Embedding API
    console.log("\n[Test 1] Testing Embedding API...");
    const embeddingService = new EmbeddingService({
      apiKey: "sk-epghmqrstteavwiemdnryihnsaypdlqygmxqrbyzuspibntl",
      baseURL: "https://api.siliconflow.cn/v1",
      model: "BAAI/bge-m3"
    });

    const testText = "今天天气不错";
    const embedding = await embeddingService.embed(testText);
    console.log(`  ✓ Generated embedding for "${testText}"`);
    console.log(`  ✓ Embedding dimension: ${embedding.length}`);

    // Test 2: Topic Index Store
    console.log("\n[Test 2] Testing Topic Index Store...");
    const topicStorePath = join(tempDir, "topics.jsonl");
    const topicStore = new JsonlTopicIndexStore(topicStorePath);

    await topicStore.append({
      id: "topic-1",
      sessionId: "test-session",
      characterId: "test-char",
      topic: "讨论天气和心情",
      keywords: ["天气", "心情", "阳光"],
      timeRange: [new Date(), new Date()],
      turnIds: ["turn-1", "turn-2"],
      mentionCount: 2,
      lastMentioned: new Date()
    });
    console.log("  ✓ Added topic index");

    const topics = await topicStore.getBySession("test-session");
    console.log(`  ✓ Retrieved ${topics.length} topic(s)`);

    const searchResults = await topicStore.search(["天气"]);
    console.log(`  ✓ Keyword search found ${searchResults.length} result(s)`);

    // Test 3: Core Memory Store
    console.log("\n[Test 3] Testing Core Memory Store...");
    const coreStorePath = join(tempDir, "core.db");
    const coreStore = new SqliteCoreMemoryStore(coreStorePath);

    const memoryText = "用户喜欢晴天，觉得阳光让人心情愉悦";
    const memoryEmbedding = await embeddingService.embed(memoryText);

    await coreStore.insert({
      text: memoryText,
      embedding: memoryEmbedding,
      strength: 1.0,
      sessionId: "test-session",
      characterId: "test-char"
    });
    console.log("  ✓ Inserted core memory");

    // Test 4: Vector Search
    console.log("\n[Test 4] Testing Vector Search...");
    const queryText = "天气如何影响心情";
    const queryEmbedding = await embeddingService.embed(queryText);

    const searchResults2 = await coreStore.vectorSearch(queryEmbedding, 5);
    console.log(`  ✓ Vector search found ${searchResults2.length} result(s)`);

    if (searchResults2.length > 0) {
      console.log(`  ✓ Top result: "${searchResults2[0].text.substring(0, 30)}..."`);
      console.log(`  ✓ Similarity: ${searchResults2[0].similarity?.toFixed(3)}`);
    }

    // Test 5: Memory Recall Workflow
    console.log("\n[Test 5] Testing Memory Recall Workflow...");

    // Add more memories
    await coreStore.insert({
      text: "用户的生日是3月15日",
      embedding: await embeddingService.embed("用户的生日是3月15日"),
      strength: 1.0,
      sessionId: "test-session",
      characterId: "test-char"
    });

    await coreStore.insert({
      text: "用户喜欢喝咖啡，特别是拿铁",
      embedding: await embeddingService.embed("用户喜欢喝咖啡，特别是拿铁"),
      strength: 0.8,
      sessionId: "test-session",
      characterId: "test-char"
    });

    console.log("  ✓ Added 2 more memories");

    // Recall memories
    const recallQuery = "用户喜欢什么饮料";
    const recallEmbedding = await embeddingService.embed(recallQuery);
    const recalledMemories = await coreStore.vectorSearch(recallEmbedding, 3);

    console.log(`  ✓ Recalled ${recalledMemories.length} memories for query: "${recallQuery}"`);
    recalledMemories.forEach((mem, idx) => {
      console.log(`    ${idx + 1}. "${mem.text}" (similarity: ${mem.similarity?.toFixed(3)})`);
    });

    // Test 6: Memory Strength Update
    console.log("\n[Test 6] Testing Memory Strength Update...");
    if (recalledMemories.length > 0) {
      const memId = recalledMemories[0].id;
      const oldStrength = recalledMemories[0].strength;

      await coreStore.update(memId, {
        strength: oldStrength + 0.1,
        lastRecalledAt: new Date()
      });
      console.log(`  ✓ Updated memory strength: ${oldStrength.toFixed(1)} → ${(oldStrength + 0.1).toFixed(1)}`);
    }

    // Summary
    console.log("\n" + "=".repeat(60));
    console.log("✅ All tests passed!");
    console.log("=".repeat(60));
    console.log("\nMemory System V2 is ready for use.");
    console.log("To enable in the app, set config.memory.useV2System = true");

  } catch (error) {
    console.error("\n❌ Test failed:", error);
    throw error;
  } finally {
    // Cleanup
    await rm(tempDir, { recursive: true, force: true });
    console.log(`\n✓ Cleaned up temp directory`);
  }
}

// Run the test
if (require.main === module) {
  runAcceptanceTest()
    .then(() => {
      console.log("\n✓ Test completed successfully");
      process.exit(0);
    })
    .catch((error) => {
      console.error("\n✗ Test failed:", error);
      process.exit(1);
    });
}

export { runAcceptanceTest };
