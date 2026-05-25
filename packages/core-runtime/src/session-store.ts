export type SessionTurnRole = "user" | "assistant" | "system" | "event";

export interface SessionTurn {
  id: string;
  role: SessionTurnRole;
  content: string;
  createdAt: string;
  meta?: Record<string, unknown>;
}

export interface AppendSessionTurn {
  role: SessionTurnRole;
  content: string;
  createdAt?: string;
  meta?: Record<string, unknown>;
}

export interface SessionHandoff {
  sessionId: string;
  summary: string;
  turns: SessionTurn[];
}

export interface SessionStore {
  readonly sessionId: string;
  append(turn: AppendSessionTurn): Promise<SessionTurn>;
  getRecent(limit: number): Promise<SessionTurn[]>;
  createHandoff(limit?: number): Promise<SessionHandoff>;
}

export class InMemorySessionStore implements SessionStore {
  private readonly turns: SessionTurn[] = [];
  private sequence = 0;

  constructor(readonly sessionId: string = `session-${Date.now()}`) {}

  async append(turn: AppendSessionTurn): Promise<SessionTurn> {
    this.sequence += 1;
    const stored: SessionTurn = {
      id: `${this.sessionId}-${this.sequence}`,
      role: turn.role,
      content: turn.content,
      createdAt: turn.createdAt ?? new Date().toISOString(),
      meta: turn.meta
    };
    this.turns.push(stored);
    return stored;
  }

  async getRecent(limit: number): Promise<SessionTurn[]> {
    if (limit <= 0) {
      return [];
    }
    return this.turns.slice(-limit);
  }

  async createHandoff(limit = 20): Promise<SessionHandoff> {
    const turns = await this.getRecent(limit);
    const summary = turns.map((turn) => `${turn.role}: ${turn.content}`).join("\n");
    return {
      sessionId: this.sessionId,
      summary,
      turns
    };
  }
}
