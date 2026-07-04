import Database from "better-sqlite3";
import type { CoreMemory } from "@greyfield/core-runtime";
import { dirname } from "node:path";
import { mkdirSync } from "node:fs";

export class SqliteCoreMemoryStore {
  private db: Database.Database;
  private hasVectorExtension = false;

  constructor(dbPath: string) {
    // Ensure directory exists
    mkdirSync(dirname(dbPath), { recursive: true });

    this.db = new Database(dbPath);
    this.initSchema();
    this.tryLoadVectorExtension();
  }

  private initSchema(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS core_memories (
        id TEXT PRIMARY KEY,
        sessionId TEXT NOT NULL,
        characterId TEXT NOT NULL,
        text TEXT NOT NULL,
        embedding BLOB NOT NULL,
        strength REAL NOT NULL,
        createdAt TEXT NOT NULL,
        lastRecalledAt TEXT,
        triggers TEXT,
        sources TEXT NOT NULL,
        disabled INTEGER NOT NULL DEFAULT 0
      );

      CREATE INDEX IF NOT EXISTS idx_session ON core_memories(sessionId);
      CREATE INDEX IF NOT EXISTS idx_character ON core_memories(characterId);
      CREATE INDEX IF NOT EXISTS idx_strength ON core_memories(strength);
      CREATE INDEX IF NOT EXISTS idx_disabled ON core_memories(disabled);
    `);
  }

  private tryLoadVectorExtension(): void {
    try {
      // Try to load sqlite-vss extension
      this.db.loadExtension('vss0');

      // Create vector table
      this.db.exec(`
        CREATE VIRTUAL TABLE IF NOT EXISTS memory_vectors
        USING vss0(embedding(1024));
      `);

      this.hasVectorExtension = true;
      console.log('[Memory] Vector extension loaded successfully');
    } catch (error) {
      console.warn('[Memory] Vector extension not available, using brute-force search');
      this.hasVectorExtension = false;
    }
  }

  async insert(memory: CoreMemory): Promise<void> {
    const stmt = this.db.prepare(`
      INSERT INTO core_memories
      (id, sessionId, characterId, text, embedding, strength, createdAt, lastRecalledAt, triggers, sources, disabled)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const embeddingBuffer = Buffer.from(new Float32Array(memory.embedding).buffer);

    stmt.run(
      memory.id,
      memory.sessionId,
      memory.characterId,
      memory.text,
      embeddingBuffer,
      memory.strength,
      memory.createdAt.toISOString(),
      memory.lastRecalledAt?.toISOString() || null,
      memory.triggers ? JSON.stringify(memory.triggers) : null,
      JSON.stringify(memory.sources),
      memory.disabled ? 1 : 0
    );

    // Try to insert into vector index
    if (this.hasVectorExtension) {
      try {
        this.db.prepare(`INSERT INTO memory_vectors(rowid, embedding) VALUES (?, ?)`).run(
          memory.id,
          embeddingBuffer
        );
      } catch (error) {
        console.warn('[Memory] Failed to insert into vector index:', error);
      }
    }
  }

  async update(id: string, updates: Partial<CoreMemory>): Promise<void> {
    const fields: string[] = [];
    const values: any[] = [];

    if (updates.text !== undefined) {
      fields.push('text = ?');
      values.push(updates.text);
    }
    if (updates.strength !== undefined) {
      fields.push('strength = ?');
      values.push(updates.strength);
    }
    if (updates.lastRecalledAt !== undefined) {
      fields.push('lastRecalledAt = ?');
      values.push(updates.lastRecalledAt.toISOString());
    }
    if (updates.disabled !== undefined) {
      fields.push('disabled = ?');
      values.push(updates.disabled ? 1 : 0);
    }
    if (updates.triggers !== undefined) {
      fields.push('triggers = ?');
      values.push(JSON.stringify(updates.triggers));
    }

    if (fields.length > 0) {
      values.push(id);
      this.db.prepare(`UPDATE core_memories SET ${fields.join(', ')} WHERE id = ?`).run(...values);
    }
  }

  async get(id: string): Promise<CoreMemory | null> {
    const row = this.db.prepare(`SELECT * FROM core_memories WHERE id = ?`).get(id);
    return row ? this.rowToMemory(row as any) : null;
  }

  async getBySession(sessionId: string): Promise<CoreMemory[]> {
    const rows = this.db.prepare(`SELECT * FROM core_memories WHERE sessionId = ? AND disabled = 0`).all(sessionId);
    return rows.map(row => this.rowToMemory(row as any));
  }

  async vectorSearch(queryEmbedding: number[], topK: number): Promise<CoreMemory[]> {
    if (this.hasVectorExtension) {
      try {
        return this.vectorExtensionSearch(queryEmbedding, topK);
      } catch (error) {
        console.warn('[Memory] Vector search failed, falling back to brute-force:', error);
      }
    }

    // Fallback: brute-force cosine similarity
    return this.bruteForceSearch(queryEmbedding, topK);
  }

  private vectorExtensionSearch(queryEmbedding: number[], topK: number): CoreMemory[] {
    const queryBuffer = Buffer.from(new Float32Array(queryEmbedding).buffer);

    const rows = this.db.prepare(`
      SELECT m.* FROM core_memories m
      JOIN memory_vectors v ON m.id = v.rowid
      WHERE vss_search(v.embedding, ?)
      AND m.disabled = 0
      LIMIT ?
    `).all(queryBuffer, topK);

    return rows.map(row => this.rowToMemory(row as any));
  }

  private bruteForceSearch(queryEmbedding: number[], topK: number): CoreMemory[] {
    const rows = this.db.prepare(`SELECT * FROM core_memories WHERE disabled = 0`).all();

    const scored = rows.map(row => {
      const memory = this.rowToMemory(row as any);
      const similarity = this.cosineSimilarity(queryEmbedding, memory.embedding);
      return { memory, similarity };
    });

    return scored
      .sort((a, b) => b.similarity - a.similarity)
      .slice(0, topK)
      .map(item => ({
        ...item.memory,
        similarity: item.similarity
      }));
  }

  private cosineSimilarity(a: number[], b: number[]): number {
    if (a.length !== b.length) {
      throw new Error('Vector dimensions do not match');
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

  private rowToMemory(row: any): CoreMemory {
    const embeddingBuffer = Buffer.from(row.embedding);
    const embedding = Array.from(new Float32Array(
      embeddingBuffer.buffer,
      embeddingBuffer.byteOffset,
      embeddingBuffer.byteLength / Float32Array.BYTES_PER_ELEMENT
    ));

    return {
      id: row.id,
      sessionId: row.sessionId,
      characterId: row.characterId,
      text: row.text,
      embedding,
      strength: row.strength,
      createdAt: new Date(row.createdAt),
      lastRecalledAt: row.lastRecalledAt ? new Date(row.lastRecalledAt) : undefined,
      triggers: row.triggers ? JSON.parse(row.triggers) : undefined,
      sources: JSON.parse(row.sources),
      disabled: row.disabled === 1
    };
  }

  async delete(id: string): Promise<boolean> {
    const result = this.db.prepare(`DELETE FROM core_memories WHERE id = ?`).run(id);

    if (this.hasVectorExtension) {
      try {
        this.db.prepare(`DELETE FROM memory_vectors WHERE rowid = ?`).run(id);
      } catch (error) {
        console.warn('[Memory] Failed to delete from vector index:', error);
      }
    }

    return result.changes > 0;
  }

  close(): void {
    this.db.close();
  }
}
