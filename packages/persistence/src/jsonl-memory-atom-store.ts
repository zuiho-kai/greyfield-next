import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import {
  normalizeSourceTurnIds,
  normalizeTriggers,
  type MemoryAtom,
  type MemoryAtomStore,
  type MemoryAtomTriggers,
  type UpdateMemoryAtom
} from "@greyfield/core-runtime";

export class JsonlMemoryAtomStore implements MemoryAtomStore {
  private mutation = Promise.resolve();

  constructor(private readonly path: string) {}

  async append(atom: MemoryAtom): Promise<MemoryAtom> {
    return this.upsert(atom);
  }

  async upsert(atom: MemoryAtom): Promise<MemoryAtom> {
    return this.serializeMutation(async () => {
      const current = await this.readAtoms();
      const stored = normalizeAtom(atom);
      const existingIndex = current.findIndex((item) => item.id === stored.id);
      if (existingIndex === -1) {
        await this.writeAtoms([...current, stored]);
        return stored;
      }

      const existing = current[existingIndex];
      const updated = normalizeAtom({
        ...existing,
        ...stored,
        createdAt: existing.createdAt,
        sourceTurnIds: normalizeSourceTurnIds([...existing.sourceTurnIds, ...stored.sourceTurnIds]),
        updatedAt: stored.updatedAt ?? existing.updatedAt ?? stored.createdAt
      });
      const next = [...current];
      next[existingIndex] = updated;
      await this.writeAtoms(next);
      return updated;
    });
  }

  async list(threadId: string): Promise<MemoryAtom[]> {
    return (await this.readAtoms())
      .filter((atom) => atom.threadId === threadId)
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id));
  }

  async update(id: string, patch: UpdateMemoryAtom): Promise<MemoryAtom | null> {
    return this.serializeMutation(async () => {
      const current = await this.readAtoms();
      let updated: MemoryAtom | null = null;
      const next = current.map((atom) => {
        if (atom.id !== id) {
          return atom;
        }
        const triggers = patch.triggers ? mergeTriggers(atom.triggers, patch.triggers) : atom.triggers;
        updated = normalizeAtom({
          ...atom,
          ...(patch.text !== undefined ? { text: patch.text } : {}),
          ...(patch.disabled !== undefined ? { disabled: patch.disabled } : {}),
          ...(patch.importance !== undefined ? { importance: patch.importance } : {}),
          triggers,
          updatedAt: patch.updatedAt ?? new Date().toISOString()
        });
        return updated;
      });
      if (!updated) {
        return null;
      }
      await this.writeAtoms(next);
      return updated;
    });
  }

  async delete(id: string): Promise<boolean> {
    return this.serializeMutation(async () => {
      const current = await this.readAtoms();
      const next = current.filter((atom) => atom.id !== id);
      if (next.length === current.length) {
        return false;
      }
      await this.writeAtoms(next);
      return true;
    });
  }

  async clear(threadId?: string): Promise<number> {
    return this.serializeMutation(async () => {
      const current = await this.readAtoms();
      const next = threadId ? current.filter((atom) => atom.threadId !== threadId) : [];
      const removed = current.length - next.length;
      if (removed === 0) {
        return 0;
      }
      await this.writeAtoms(next);
      return removed;
    });
  }

  private async readAtoms(): Promise<MemoryAtom[]> {
    try {
      const raw = await readFile(this.path, "utf8");
      return raw
        .split(/\r?\n/)
        .filter(Boolean)
        .map((line) => normalizeAtom(JSON.parse(line) as MemoryAtom));
    } catch (error) {
      if (isNotFoundError(error)) {
        return [];
      }
      throw error;
    }
  }

  private async writeAtoms(atoms: MemoryAtom[]): Promise<void> {
    await mkdir(dirname(this.path), { recursive: true });
    const body = atoms.map((atom) => JSON.stringify(normalizeAtom(atom))).join("\n");
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

function normalizeAtom(atom: MemoryAtom): MemoryAtom {
  const triggers = normalizeMemoryAtomTriggers(atom.triggers);
  return {
    ...atom,
    sourceTurnIds: normalizeSourceTurnIds(atom.sourceTurnIds ?? []),
    triggers,
    triggerKeys: flattenTriggerKeys(triggers)
  };
}

function mergeTriggers(base: MemoryAtomTriggers, patch: UpdateMemoryAtom["triggers"]): MemoryAtomTriggers {
  return normalizeMemoryAtomTriggers({
    exact: patch?.exact ?? base.exact,
    aliases: patch?.aliases ?? base.aliases,
    secondary: patch?.secondary ?? base.secondary,
    ...(patch?.calendar !== undefined || base.calendar !== undefined ? { calendar: patch?.calendar ?? base.calendar ?? [] } : {}),
    ...(patch?.environment !== undefined || base.environment !== undefined ? { environment: patch?.environment ?? base.environment ?? [] } : {}),
    ...(patch?.semantic !== undefined || base.semantic !== undefined ? { semantic: patch?.semantic ?? base.semantic ?? [] } : {}),
    ...(patch?.relationship !== undefined || base.relationship !== undefined ? { relationship: patch?.relationship ?? base.relationship ?? [] } : {})
  });
}

function normalizeMemoryAtomTriggers(triggers: MemoryAtomTriggers | undefined): MemoryAtomTriggers {
  const rawTriggers = triggers ?? { exact: [], aliases: [], secondary: [] };
  return normalizeTriggers({
    exact: rawTriggers.exact ?? [],
    aliases: rawTriggers.aliases ?? [],
    secondary: rawTriggers.secondary ?? [],
    ...(rawTriggers.calendar !== undefined ? { calendar: rawTriggers.calendar } : {}),
    ...(rawTriggers.environment !== undefined ? { environment: rawTriggers.environment } : {}),
    ...(rawTriggers.semantic !== undefined ? { semantic: rawTriggers.semantic } : {}),
    ...(rawTriggers.relationship !== undefined ? { relationship: rawTriggers.relationship } : {})
  });
}

function flattenTriggerKeys(triggers: MemoryAtomTriggers): string[] {
  return mergeUniqueStrings([...triggers.exact, ...triggers.aliases, ...triggers.secondary].map(normalizeTriggerKey).filter(Boolean));
}

function normalizeTriggerKey(key: string): string {
  return key.trim().replace(/\s+/g, " ").toLowerCase();
}

function mergeUniqueStrings(...groups: string[][]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const value of groups.flat()) {
    if (seen.has(value)) {
      continue;
    }
    seen.add(value);
    result.push(value);
  }
  return result;
}

function isNotFoundError(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && error.code === "ENOENT";
}
