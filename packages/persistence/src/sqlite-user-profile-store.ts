import Database, { type Database as BetterSqliteDatabase } from "better-sqlite3";

export type ProfileFactCategory =
  | "allergy"
  | "important-date"
  | "identity"
  | "preference"
  | "free-form";

export interface UserProfileFact {
  id: string;
  sessionId: string;
  characterId: string;
  category: ProfileFactCategory;
  key: string;
  value: string;
  createdAt: Date;
  sourceTurnIds: string[];
  supersedes?: string[];
  disabled: boolean;
}

export class SqliteUserProfileStore {
  private db: BetterSqliteDatabase;

  constructor(dbPath: string) {
    this.db = new Database(dbPath);
    this.initialize();
  }

  private initialize(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS user_self_profile (
        id TEXT PRIMARY KEY,
        session_id TEXT NOT NULL,
        character_id TEXT NOT NULL,
        category TEXT NOT NULL,
        key TEXT NOT NULL,
        value TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        source_turn_ids TEXT NOT NULL,
        supersedes TEXT,
        disabled INTEGER NOT NULL DEFAULT 0,
        UNIQUE(session_id, character_id, category, key COLLATE NOCASE)
      );

      CREATE INDEX IF NOT EXISTS idx_session_character
        ON user_self_profile(session_id, character_id);

      CREATE INDEX IF NOT EXISTS idx_category
        ON user_self_profile(category);
    `);
  }

  async insert(fact: UserProfileFact): Promise<void> {
    const stmt = this.db.prepare(`
      INSERT INTO user_self_profile
        (id, session_id, character_id, category, key, value, created_at, source_turn_ids, supersedes, disabled)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(session_id, character_id, category, key)
      DO UPDATE SET
        value = excluded.value,
        created_at = excluded.created_at,
        source_turn_ids = excluded.source_turn_ids,
        supersedes = excluded.supersedes,
        disabled = excluded.disabled
    `);

    stmt.run(
      fact.id,
      fact.sessionId,
      fact.characterId,
      fact.category,
      fact.key,
      fact.value,
      fact.createdAt.getTime(),
      JSON.stringify(fact.sourceTurnIds),
      fact.supersedes ? JSON.stringify(fact.supersedes) : null,
      fact.disabled ? 1 : 0
    );
  }

  async update(id: string, updates: Partial<Pick<UserProfileFact, "disabled" | "supersedes">>): Promise<void> {
    const fields: string[] = [];
    const values: unknown[] = [];

    if (updates.disabled !== undefined) {
      fields.push("disabled = ?");
      values.push(updates.disabled ? 1 : 0);
    }

    if (updates.supersedes !== undefined) {
      fields.push("supersedes = ?");
      values.push(JSON.stringify(updates.supersedes));
    }

    if (fields.length === 0) return;

    values.push(id);
    const stmt = this.db.prepare(`UPDATE user_self_profile SET ${fields.join(", ")} WHERE id = ?`);
    stmt.run(...values);
  }

  async delete(id: string): Promise<boolean> {
    const stmt = this.db.prepare("DELETE FROM user_self_profile WHERE id = ?");
    const result = stmt.run(id);
    return result.changes > 0;
  }

  async getBySession(sessionId: string, characterId: string, includeDisabled = false): Promise<UserProfileFact[]> {
    const stmt = this.db.prepare(`
      SELECT * FROM user_self_profile
      WHERE session_id = ? AND character_id = ?
        ${includeDisabled ? "" : "AND disabled = 0"}
      ORDER BY created_at DESC
    `);

    const rows = stmt.all(sessionId, characterId) as Array<{
      id: string;
      session_id: string;
      character_id: string;
      category: string;
      key: string;
      value: string;
      created_at: number;
      source_turn_ids: string;
      supersedes: string | null;
      disabled: number;
    }>;

    return rows.map(row => ({
      id: row.id,
      sessionId: row.session_id,
      characterId: row.character_id,
      category: row.category as UserProfileFact["category"],
      key: row.key,
      value: row.value,
      createdAt: new Date(row.created_at),
      sourceTurnIds: JSON.parse(row.source_turn_ids),
      supersedes: row.supersedes ? JSON.parse(row.supersedes) : undefined,
      disabled: row.disabled === 1
    }));
  }

  /** Get only active facts (not disabled, not superseded by another active fact) */
  async getActiveBySession(sessionId: string, characterId: string): Promise<UserProfileFact[]> {
    const all = await this.getBySession(sessionId, characterId, false);
    const supersededIds = new Set<string>();

    for (const fact of all) {
      if (fact.supersedes) {
        fact.supersedes.forEach((id: string) => supersededIds.add(id));
      }
    }

    return all.filter(fact => !supersededIds.has(fact.id));
  }

  async get(id: string): Promise<UserProfileFact | null> {
    const stmt = this.db.prepare("SELECT * FROM user_self_profile WHERE id = ?");
    const row = stmt.get(id) as {
      id: string;
      session_id: string;
      character_id: string;
      category: string;
      key: string;
      value: string;
      created_at: number;
      source_turn_ids: string;
      supersedes: string | null;
      disabled: number;
    } | undefined;

    if (!row) return null;

    return {
      id: row.id,
      sessionId: row.session_id,
      characterId: row.character_id,
      category: row.category as UserProfileFact["category"],
      key: row.key,
      value: row.value,
      createdAt: new Date(row.created_at),
      sourceTurnIds: JSON.parse(row.source_turn_ids),
      supersedes: row.supersedes ? JSON.parse(row.supersedes) : undefined,
      disabled: row.disabled === 1
    };
  }

  close(): void {
    this.db.close();
  }
}
