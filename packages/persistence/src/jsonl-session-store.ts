import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import type { AppendSessionTurn, SessionHandoff, SessionStore, SessionTurn } from "@greyfield/core-runtime";

export class JsonlSessionStore implements SessionStore {
  private sequence = 0;

  constructor(readonly sessionId: string, private readonly path: string) {}

  async append(turn: AppendSessionTurn): Promise<SessionTurn> {
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
    await writeFile(this.path, `${current.map((item) => JSON.stringify(item)).join("\n")}${current.length > 0 ? "\n" : ""}${JSON.stringify(stored)}\n`, "utf8");
    return stored;
  }

  async getRecent(limit: number): Promise<SessionTurn[]> {
    if (limit <= 0) {
      return [];
    }
    return (await this.readTurns()).slice(-limit);
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
}

function isNotFoundError(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && error.code === "ENOENT";
}
