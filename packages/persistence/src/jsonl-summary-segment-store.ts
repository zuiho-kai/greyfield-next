import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import {
  buildMemorySourceDrilldownResult,
  getSummarySegmentSourceTurnIds,
  normalizeSummarySegment,
  normalizeSummarySegmentSources,
  normalizeRecallCues,
  normalizeSourceTurnIds,
  type AppendSummarySegment,
  type MemorySourceDrilldownRequest,
  type MemorySourceDrilldownResult,
  type MemorySourceDrilldownSource,
  type SessionTurnLookup,
  type SummarySegment,
  type SummarySegmentLookup,
  type SummarySegmentStore,
  type UpdateSummarySegment
} from "@greyfield/core-runtime";

export class JsonlSummarySegmentStore implements SummarySegmentStore {
  private sequence = 0;
  private mutation = Promise.resolve();

  constructor(private readonly path: string) {}

  async append(segment: AppendSummarySegment): Promise<SummarySegment> {
    return this.serializeMutation(async () => {
      const current = await this.readSegments();
      this.sequence = Math.max(this.sequence, ...current.map((item) => parseSequence(item.id)));
      this.sequence += 1;
      const createdAt = segment.createdAt ?? new Date().toISOString();
      const sources = normalizeSummarySegmentSources(segment);
      const stored: SummarySegment = {
        id: `summary-${this.sequence}`,
        threadId: segment.threadId,
        sessionId: segment.sessionId,
        summary: segment.summary,
        recallCues: normalizeRecallCues(segment.recallCues),
        sourceTurnIds: sources.sourceTurnIds,
        sourceTurns: sources.sourceTurns,
        createdAt,
        disabled: false,
        updatedAt: createdAt
      };
      await this.writeSegments([...current, stored]);
      return stored;
    });
  }

  async get(id: string): Promise<SummarySegment | null> {
    return (await this.readSegments()).find((segment) => segment.id === id) ?? null;
  }

  async list(threadId: string): Promise<SummarySegment[]> {
    return (await this.readSegments())
      .filter((segment) => segment.threadId === threadId)
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  }

  async update(id: string, patch: UpdateSummarySegment): Promise<SummarySegment | null> {
    return this.serializeMutation(async () => {
      const current = await this.readSegments();
      let updated: SummarySegment | null = null;
      const next = current.map((segment) => {
        if (segment.id !== id) {
          return segment;
        }
        updated = {
          ...segment,
          ...(patch.summary !== undefined ? { summary: patch.summary } : {}),
          ...(patch.recallCues !== undefined ? { recallCues: normalizeRecallCues(patch.recallCues) } : {}),
          ...(patch.disabled !== undefined ? { disabled: patch.disabled } : {}),
          updatedAt: patch.updatedAt ?? new Date().toISOString()
        };
        return updated;
      });
      if (!updated) {
        return null;
      }
      await this.writeSegments(next);
      return updated;
    });
  }

  async delete(id: string): Promise<boolean> {
    return this.serializeMutation(async () => {
      const current = await this.readSegments();
      const next = current.filter((segment) => segment.id !== id);
      if (next.length === current.length) {
        return false;
      }
      await this.writeSegments(next);
      return true;
    });
  }

  private async readSegments(): Promise<SummarySegment[]> {
    try {
      const raw = await readFile(this.path, "utf8");
      return raw
        .split(/\r?\n/)
        .filter(Boolean)
        .map((line) => normalizeSegment(JSON.parse(line) as SummarySegment));
    } catch (error) {
      if (isNotFoundError(error)) {
        return [];
      }
      throw error;
    }
  }

  private async writeSegments(segments: SummarySegment[]): Promise<void> {
    await mkdir(dirname(this.path), { recursive: true });
    const body = segments.map((segment) => JSON.stringify(segment)).join("\n");
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

export interface MemorySourceDrilldownStoreOptions {
  sessionStore: SessionTurnLookup;
  summarySegmentStore: SummarySegmentLookup;
}

export class MemorySourceDrilldownStore {
  constructor(private readonly options: MemorySourceDrilldownStoreOptions) {}

  async resolve(request: MemorySourceDrilldownRequest): Promise<MemorySourceDrilldownResult | null> {
    if (request.kind === "summary-segment") {
      const segment = await this.options.summarySegmentStore.get(request.id);
      if (!segment) {
        return null;
      }
      return this.resolveSourceTurnIds(
        {
          kind: "summary-segment",
          id: segment.id
        },
        getSummarySegmentSourceTurnIds(segment)
      );
    }

    if (request.kind === "recall-context-item") {
      return this.resolveSourceTurnIds(
        {
          kind: request.item.kind,
          id: request.item.id
        },
        request.item.sourceTurnIds
      );
    }

    return this.resolveSourceTurnIds({ kind: "source-turns" }, request.sourceTurnIds);
  }

  private async resolveSourceTurnIds(
    source: MemorySourceDrilldownSource,
    turnIds: string[]
  ): Promise<MemorySourceDrilldownResult> {
    const sourceTurnIds = normalizeSourceTurnIds(turnIds);
    const turns = await this.options.sessionStore.getByIds(sourceTurnIds);
    return buildMemorySourceDrilldownResult({
      source,
      sourceTurnIds,
      turns
    });
  }
}

function normalizeSegment(segment: SummarySegment): SummarySegment {
  return normalizeSummarySegment(segment);
}

function parseSequence(id: string): number {
  const match = /^summary-(\d+)$/.exec(id);
  return match ? Number(match[1]) : 0;
}

function isNotFoundError(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && error.code === "ENOENT";
}
