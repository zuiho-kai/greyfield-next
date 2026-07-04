import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import {
  createDeletedMemoryEvidence,
  normalizeDeletedMemoryEvidence,
  type AppendDeletedMemoryEvidence,
  type DeletedMemoryEvidence,
  type DeletedMemoryEvidenceStore
} from "@greyfield/core-runtime";

export class JsonlDeletedMemoryEvidenceStore implements DeletedMemoryEvidenceStore {
  private mutation = Promise.resolve();

  constructor(private readonly path: string) {}

  async append(record: AppendDeletedMemoryEvidence): Promise<DeletedMemoryEvidence> {
    return this.serializeMutation(async () => {
      const current = await this.readRecords();
      const stored = createDeletedMemoryEvidence(record);
      const existingIndex = current.findIndex((item) => item.id === stored.id);
      if (existingIndex === -1) {
        await this.writeRecords([...current, stored]);
        return stored;
      }
      const next = [...current];
      next[existingIndex] = {
        ...next[existingIndex]!,
        sourceTurnIds: stored.sourceTurnIds,
        deletedAt: stored.deletedAt
      };
      await this.writeRecords(next);
      return next[existingIndex]!;
    });
  }

  async list(threadId: string): Promise<DeletedMemoryEvidence[]> {
    return (await this.readRecords())
      .filter((record) => record.threadId === threadId)
      .sort((a, b) => a.deletedAt.localeCompare(b.deletedAt) || a.id.localeCompare(b.id));
  }

  private async readRecords(): Promise<DeletedMemoryEvidence[]> {
    try {
      const raw = await readFile(this.path, "utf8");
      return raw
        .split(/\r?\n/)
        .filter(Boolean)
        .map((line) => normalizeDeletedMemoryEvidence(JSON.parse(line) as DeletedMemoryEvidence));
    } catch (error) {
      if (isNotFoundError(error)) {
        return [];
      }
      throw error;
    }
  }

  private async writeRecords(records: DeletedMemoryEvidence[]): Promise<void> {
    await mkdir(dirname(this.path), { recursive: true });
    const body = records.map((record) => JSON.stringify(normalizeDeletedMemoryEvidence(record))).join("\n");
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

function isNotFoundError(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && error.code === "ENOENT";
}
