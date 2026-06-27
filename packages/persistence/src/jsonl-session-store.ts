import { appendFile, mkdir, readFile } from "node:fs/promises";
import { dirname } from "node:path";
import { normalizeTurnIds, type AppendSessionTurn, type SessionHandoff, type SessionTurn, type SourceSessionStore } from "@greyfield/core-runtime";

export class JsonlSessionStore implements SourceSessionStore {
  private sequence = 0;
  private mutation = Promise.resolve();

  constructor(readonly sessionId: string, private readonly path: string) {}

  async append(turn: AppendSessionTurn): Promise<SessionTurn> {
    return this.serializeMutation(async () => {
      const current = await this.readTurns();
      this.sequence = Math.max(this.sequence, current.length);
      this.sequence += 1;
      const stored: SessionTurn = {
        id: `${this.sessionId}-${this.sequence}`,
        role: turn.role,
        content: turn.content,
        createdAt: turn.createdAt ?? new Date().toISOString(),
        meta: turn.meta
      };
      await mkdir(dirname(this.path), { recursive: true });
      await appendFile(this.path, `${JSON.stringify(stored)}\n`, "utf8");
      return stored;
    });
  }

  async getRecent(limit: number): Promise<SessionTurn[]> {
    if (limit <= 0) {
      return [];
    }
    return (await this.readTurns()).slice(-limit);
  }

  async getByIds(turnIds: string[]): Promise<SessionTurn[]> {
    const requested = normalizeTurnIds(turnIds);
    if (requested.length === 0) {
      return [];
    }
    const turns = await this.readTurns();
    const byId = new Map(turns.map((turn) => [turn.id, turn]));
    return requested.flatMap((turnId) => {
      const turn = byId.get(turnId);
      return turn ? [turn] : [];
    });
  }

  async createHandoff(limit = 20): Promise<SessionHandoff> {
    const turns = await this.getRecent(limit);
    return {
      sessionId: this.sessionId,
      turns,
      summary: turns.map((turn) => `${turn.role}: ${turn.content}`).join("\n")
    };
  }

  private async readTurns(): Promise<SessionTurn[]> {
    try {
      const raw = await readFile(this.path, "utf8");
      return raw
        .split(/\r?\n/)
        .filter(Boolean)
        .map((line) => JSON.parse(line) as SessionTurn);
    } catch (error) {
      if (isNotFoundError(error)) {
        return [];
      }
      throw error;
    }
  }

  private async serializeMutation<T>(work: () => Promise<T>): Promise<T> {
    const previous = this.mutation;
    let release!: () => void;
    this.mutation = new Promise<void>((resolve) => {
      release = resolve;
    });
    await previous;
    try {
      return await work();
    } finally {
      release();
    }
  }
}

function isNotFoundError(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && error.code === "ENOENT";
}
