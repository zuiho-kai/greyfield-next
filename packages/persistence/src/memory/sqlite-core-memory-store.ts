import Database, { type Database as BetterSqliteDatabase } from "better-sqlite3";
import * as sqliteVss from "sqlite-vss";
import { deterministicEmbedding, type CoreMemory, type CoreMemoryVectorSearchOptions } from "@greyfield/core-runtime";
import { dirname } from "node:path";
import { mkdirSync } from "node:fs";

export interface CoreMemoryEmbeddingService {
  embed(text: string): Promise<number[]>;
}

export type CoreMemoryInsertInput = Partial<Pick<CoreMemory, "id" | "createdAt" | "sources" | "disabled" | "embedding">> &
  Pick<CoreMemory, "sessionId" | "characterId" | "text" | "strength"> &
  Partial<Pick<CoreMemory, "lastRecalledAt" | "triggers">>;

export class SqliteCoreMemoryStore {
  private db: BetterSqliteDatabase;
  private hasVectorExtension = false;

  constructor(dbPath: string, private readonly embeddingService?: CoreMemoryEmbeddingService) {
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
      sqliteVss.load(this.db);

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

  async insert(input: CoreMemoryInsertInput): Promise<void> {
    const memory = await this.normalizeInsert(input);
    const stmt = this.db.prepare(`
      INSERT INTO core_memories
      (id, sessionId, characterId, text, embedding, strength, createdAt, lastRecalledAt, triggers, sources, disabled)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const embeddingBuffer = Buffer.from(new Float32Array(memory.embedding).buffer);

    this.db.exec("BEGIN");
    try {
      const result = stmt.run(
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

      if (this.hasVectorExtension) {
        this.db.prepare(`INSERT INTO memory_vectors(rowid, embedding) VALUES (?, ?)`).run(
          Number(result.lastInsertRowid),
          embeddingBuffer
        );
      }

      this.db.exec("COMMIT");
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
    }
  }

  async update(id: string, updates: Partial<CoreMemory>): Promise<void> {
    const fields: string[] = [];
    const values: unknown[] = [];

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
    const row = this.db.prepare(`SELECT * FROM core_memories WHERE id = ?`).get(id) as CoreMemoryRow | undefined;
    return row ? this.rowToMemory(row) : null;
  }

  async getBySession(sessionId: string, includeDisabled = false): Promise<CoreMemory[]> {
    const rows = includeDisabled
      ? this.db.prepare(`SELECT * FROM core_memories WHERE sessionId = ? ORDER BY createdAt DESC`).all(sessionId) as CoreMemoryRow[]
      : this.db.prepare(`SELECT * FROM core_memories WHERE sessionId = ? AND disabled = 0`).all(sessionId) as CoreMemoryRow[];
    return rows.map((row) => this.rowToMemory(row));
  }

  async vectorSearch(query: number[] | string, topK: number, options?: CoreMemoryVectorSearchOptions): Promise<CoreMemory[]> {
    const queryEmbedding = Array.isArray(query) ? query : await this.embedSearchText(query);
    if (this.hasVectorExtension) {
      try {
        return this.vectorExtensionSearch(queryEmbedding, topK, options);
      } catch (error) {
        console.warn('[Memory] Vector search failed, falling back to brute-force:', error);
      }
    }

    // Fallback: brute-force cosine similarity
    return this.bruteForceSearch(queryEmbedding, topK, options);
  }

  private vectorExtensionSearch(queryEmbedding: number[], topK: number, options?: CoreMemoryVectorSearchOptions): CoreMemory[] {
    const queryBuffer = Buffer.from(new Float32Array(queryEmbedding).buffer);
    const sessionFilter = options?.sessionId ? "AND m.sessionId = ?" : "";
    const params: unknown[] = options?.sessionId ? [queryBuffer, options.sessionId, topK] : [queryBuffer, topK];

    const rows = this.db.prepare(`
      SELECT m.* FROM core_memories m
      JOIN memory_vectors v ON m.rowid = v.rowid
      WHERE vss_search(v.embedding, ?)
      AND m.disabled = 0
      ${sessionFilter}
      LIMIT ?
    `).all(...params) as CoreMemoryRow[];

    // Attach cosine similarity so callers can threshold on relevance,
    // matching the brute-force path.
    return rows.map((row) => {
      const memory = this.rowToMemory(row);
      return {
        ...memory,
        similarity: this.cosineSimilarity(queryEmbedding, memory.embedding)
      };
    });
  }

  private bruteForceSearch(queryEmbedding: number[], topK: number, options?: CoreMemoryVectorSearchOptions): CoreMemory[] {
    const rows = options?.sessionId
      ? this.db.prepare(`SELECT * FROM core_memories WHERE disabled = 0 AND sessionId = ?`).all(options.sessionId) as CoreMemoryRow[]
      : this.db.prepare(`SELECT * FROM core_memories WHERE disabled = 0`).all() as CoreMemoryRow[];

    const scored = rows.map((row) => {
      const memory = this.rowToMemory(row);
      const similarity = this.cosineSimilarity(queryEmbedding, memory.embedding);
      return { memory, similarity };
    });

    return scored
      .sort((a, b) => b.similarity - a.similarity)
      .slice(0, topK)
      .map((item) => ({
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

  private rowToMemory(row: CoreMemoryRow): CoreMemory {
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

  private async normalizeInsert(input: CoreMemoryInsertInput): Promise<CoreMemory> {
    const createdAt = input.createdAt ?? new Date();
    return {
      id: input.id ?? `core-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`,
      sessionId: input.sessionId,
      characterId: input.characterId,
      text: input.text,
      embedding: input.embedding ?? await this.embedSearchText(input.text),
      strength: input.strength,
      createdAt,
      lastRecalledAt: input.lastRecalledAt,
      triggers: input.triggers,
      sources: input.sources ?? { turnIds: [] },
      disabled: input.disabled ?? false
    };
  }

  private async embedSearchText(text: string): Promise<number[]> {
    return this.embeddingService ? this.embeddingService.embed(text) : deterministicEmbedding(text);
  }

  async delete(id: string): Promise<boolean> {
    this.db.exec("BEGIN");
    try {
      const row = this.db.prepare(`SELECT rowid FROM core_memories WHERE id = ?`).get(id) as { rowid: number } | undefined;
      if (!row) {
        this.db.exec("COMMIT");
        return false;
      }

      if (this.hasVectorExtension) {
        this.db.prepare(`DELETE FROM memory_vectors WHERE rowid = ?`).run(row.rowid);
      }

      const result = this.db.prepare(`DELETE FROM core_memories WHERE id = ?`).run(id);
      this.db.exec("COMMIT");
      return result.changes > 0;
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
    }
  }

  close(): void {
    this.db.close();
  }
}

interface CoreMemoryRow {
  id: string;
  sessionId: string;
  characterId: string;
  text: string;
  embedding: Buffer;
  strength: number;
  createdAt: string;
  lastRecalledAt: string | null;
  triggers: string | null;
  sources: string;
  disabled: number;
}
