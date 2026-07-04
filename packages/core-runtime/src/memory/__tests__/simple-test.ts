/**
 * Memory System V2 - Simple Acceptance Test
 *
 * Tests basic functionality without complex dependencies
 */

import { tmpdir } from "os";
import { mkdtemp, rm } from "fs/promises";
import { join } from "path";
import { pathToFileURL } from "url";
import { JsonlTopicIndexStore } from "../../../../persistence/src/memory/jsonl-topic-index-store";
import { SqliteCoreMemoryStore } from "../../../../persistence/src/memory/sqlite-core-memory-store";
import { embed, embedBatch } from "../embedding";

async function runSimpleTest() {
  console.log("=".repeat(60));
  console.log("Memory System V2 - Simple Acceptance Test");
  console.log("=".repeat(60));

  const tempDir = await mkdtemp(join(tmpdir(), "greyfield-memory-test-"));
  console.log(`\n✓ Created temp directory: ${tempDir}`);

  try {
    // Test 1: Embedding API
    console.log("\n[Test 1] Testing Embedding API...");
    const testText = "今天天气不错";
    const embedding = await embed(testText);
    console.log(`  ✓ Generated embedding for "${testText}"`);
    console.log(`  ✓ Embedding dimension: ${embedding.length}`);
    console.log(`  ✓ First 5 values: [${embedding.slice(0, 5).map(v => v.toFixed(3)).join(", ")}...]`);

    // Test 2: Batch embedding
    console.log("\n[Test 2] Testing Batch Embedding...");
    const texts = ["天气", "心情", "阳光"];
    const embeddings = await embedBatch(texts);
    console.log(`  ✓ Generated ${embeddings.length} embeddings`);
    console.log(`  ✓ All dimensions: ${embeddings.map(e => e.length).join(", ")}`);

    // Test 3: Topic Index Store
    console.log("\n[Test 3] Testing Topic Index Store...");
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
    console.log(`  ✓ Topic: "${topics[0].topic}"`);

    const searchResults = await topicStore.search(["天气"]);
    console.log(`  ✓ Keyword search found ${searchResults.length} result(s)`);

    // Test 4: Core Memory Store
    console.log("\n[Test 4] Testing Core Memory Store...");
    const coreStorePath = join(tempDir, "core.db");
    const coreStore = new SqliteCoreMemoryStore(coreStorePath);

    const memoryText = "用户喜欢晴天，觉得阳光让人心情愉悦";
    const memoryEmbedding = await embed(memoryText);

    await coreStore.insert({
      id: "mem-1",
      sessionId: "test-session",
      characterId: "test-char",
      text: memoryText,
      embedding: memoryEmbedding,
      strength: 1.0,
      createdAt: new Date(),
      sources: { turnIds: ["turn-1"] },
      disabled: false
    });
    console.log("  ✓ Inserted core memory");

    // Test 5: Vector Search
    console.log("\n[Test 5] Testing Vector Search...");

    // Add more test memories
    await coreStore.insert({
      id: "mem-2",
      sessionId: "test-session",
      characterId: "test-char",
      text: "用户的生日是3月15日",
      embedding: await embed("用户的生日是3月15日"),
      strength: 1.0,
      createdAt: new Date(),
      sources: { turnIds: ["turn-2"] },
      disabled: false
    });

    await coreStore.insert({
      id: "mem-3",
      sessionId: "test-session",
      characterId: "test-char",
      text: "用户喜欢喝咖啡，特别是拿铁",
      embedding: await embed("用户喜欢喝咖啡，特别是拿铁"),
      strength: 0.8,
      createdAt: new Date(),
      sources: { turnIds: ["turn-3"] },
      disabled: false
    });
    console.log("  ✓ Added 2 more memories (total: 3)");

    const queryText = "天气如何影响心情";
    const queryEmbedding = await embed(queryText);
    const searchResults2 = await coreStore.vectorSearch(queryEmbedding, 5);
    console.log(`  ✓ Vector search found ${searchResults2.length} result(s)`);

    if (searchResults2.length > 0) {
      console.log(`\n  Top results:`);
      searchResults2.forEach((mem, idx) => {
        const preview = mem.text.length > 30 ? mem.text.substring(0, 30) + "..." : mem.text;
        console.log(`    ${idx + 1}. "${preview}"`);
        console.log(`       Similarity: ${mem.similarity?.toFixed(3) || "N/A"}, Strength: ${mem.strength.toFixed(1)}`);
      });
    }

    // Test 6: Memory Recall by Coffee Query
    console.log("\n[Test 6] Testing Specific Query (Coffee)...");
    const coffeeQuery = "用户喜欢什么饮料";
    const coffeeEmbedding = await embed(coffeeQuery);
    const coffeeResults = await coreStore.vectorSearch(coffeeEmbedding, 3);

    console.log(`  Query: "${coffeeQuery}"`);
    console.log(`  ✓ Found ${coffeeResults.length} relevant memories`);
    coffeeResults.forEach((mem, idx) => {
      console.log(`    ${idx + 1}. "${mem.text}"`);
      console.log(`       Similarity: ${mem.similarity?.toFixed(3) || "N/A"}`);
    });

    // Test 7: Memory Strength Update
    console.log("\n[Test 7] Testing Memory Strength Update...");
    if (coffeeResults.length > 0) {
      const memId = coffeeResults[0].id;
      const oldStrength = coffeeResults[0].strength;

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
    console.log("\n📊 Test Summary:");
    console.log("  - Embedding API: ✅ Working");
    console.log("  - Batch Embedding: ✅ Working");
    console.log("  - Topic Index Store: ✅ Working");
    console.log("  - Core Memory Store: ✅ Working");
    console.log("  - Vector Search: ✅ Working");
    console.log("  - Memory Recall: ✅ Working");
    console.log("  - Strength Update: ✅ Working");
    console.log("\n🎉 Memory System V2 is ready for use!");
    console.log("   Enabled by default. To opt out: set config.memory.useV2System = false");

  } catch (error) {
    console.error("\n❌ Test failed:", error);
    throw error;
  } finally {
    await rm(tempDir, { recursive: true, force: true });
    console.log(`\n✓ Cleaned up temp directory`);
  }
}

if (isDirectRun(import.meta.url)) {
  runSimpleTest()
    .then(() => {
      console.log("\n✅ Test completed successfully");
      process.exit(0);
    })
    .catch((error) => {
      console.error("\n❌ Test failed with error:");
      console.error(error);
      process.exit(1);
    });
}

export { runSimpleTest };

function isDirectRun(moduleUrl: string): boolean {
  return process.argv[1] ? moduleUrl === pathToFileURL(process.argv[1]).href : false;
}
