import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import type { ProfileFactStore } from "@greyfield/core-runtime";
import type { UserProfileFact } from "./sqlite-user-profile-store";

export class JsonlUserProfileStore implements ProfileFactStore {
  private mutation = Promise.resolve();

  constructor(private readonly path: string) {}

  async insert(fact: UserProfileFact): Promise<void> {
    await this.serializeMutation(async () => {
      const current = await this.readFacts();
      const existingIndex = current.findIndex((item) => isSameProfileKey(item, fact));
      const normalized = normalizeFact(fact);
      if (existingIndex === -1) {
        await this.writeFacts([...current, normalized]);
        return;
      }
      const next = [...current];
      next[existingIndex] = normalized;
      await this.writeFacts(next);
    });
  }

  async update(id: string, updates: Partial<Pick<UserProfileFact, "disabled" | "supersedes">>): Promise<void> {
    await this.serializeMutation(async () => {
      const current = await this.readFacts();
      const next = current.map((fact) =>
        fact.id === id
          ? normalizeFact({
              ...fact,
              ...(updates.disabled !== undefined ? { disabled: updates.disabled } : {}),
              ...(updates.supersedes !== undefined ? { supersedes: updates.supersedes } : {})
            })
          : fact
      );
      await this.writeFacts(next);
    });
  }

  async delete(id: string): Promise<boolean> {
    return this.serializeMutation(async () => {
      const current = await this.readFacts();
      const next = current.filter((fact) => fact.id !== id);
      if (next.length === current.length) {
        return false;
      }
      await this.writeFacts(next);
      return true;
    });
  }

  async get(id: string): Promise<UserProfileFact | null> {
    return (await this.readFacts()).find((fact) => fact.id === id) ?? null;
  }

  async getBySession(sessionId: string, characterId: string, includeDisabled = false): Promise<UserProfileFact[]> {
    return (await this.readFacts())
      .filter((fact) => fact.sessionId === sessionId && fact.characterId === characterId)
      .filter((fact) => includeDisabled || !fact.disabled)
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime() || a.id.localeCompare(b.id));
  }

  async getActiveBySession(sessionId: string, characterId: string): Promise<UserProfileFact[]> {
    const all = await this.getBySession(sessionId, characterId, false);
    const supersededIds = new Set<string>();
    for (const fact of all) {
      fact.supersedes?.forEach((id) => supersededIds.add(id));
    }
    return all.filter((fact) => !supersededIds.has(fact.id));
  }

  private async readFacts(): Promise<UserProfileFact[]> {
    try {
      const raw = await readFile(this.path, "utf8");
      return raw
        .split(/\r?\n/u)
        .filter(Boolean)
        .map((line) => normalizeFact(JSON.parse(line) as JsonUserProfileFact));
    } catch (error) {
      if (isNotFoundError(error)) {
        return [];
      }
      throw error;
    }
  }

  private async writeFacts(facts: UserProfileFact[]): Promise<void> {
    await mkdir(dirname(this.path), { recursive: true });
    const body = facts.map((fact) => JSON.stringify(serializeFact(fact))).join("\n");
    await writeFile(this.path, body.length > 0 ? `${body}\n` : "", "utf8");
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

type JsonUserProfileFact = Omit<UserProfileFact, "createdAt"> & { createdAt: string };

function normalizeFact(fact: UserProfileFact | JsonUserProfileFact): UserProfileFact {
  return {
    ...fact,
    createdAt: fact.createdAt instanceof Date ? fact.createdAt : new Date(fact.createdAt),
    sourceTurnIds: [...new Set(fact.sourceTurnIds ?? [])],
    disabled: fact.disabled === true
  };
}

function serializeFact(fact: UserProfileFact): JsonUserProfileFact {
  return {
    ...fact,
    createdAt: fact.createdAt.toISOString()
  };
}

function isSameProfileKey(left: UserProfileFact, right: UserProfileFact): boolean {
  return (
    left.sessionId === right.sessionId &&
    left.characterId === right.characterId &&
    left.category === right.category &&
    normalizeProfileFactKey(left.key) === normalizeProfileFactKey(right.key)
  );
}

function normalizeProfileFactKey(text: string): string {
  return text.trim().toLowerCase().replace(/\s+/gu, "");
}

function isNotFoundError(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && error.code === "ENOENT";
}
