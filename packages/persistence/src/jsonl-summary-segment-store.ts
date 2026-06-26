import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import type { AppendSummarySegment, SummarySegment, SummarySegmentStore } from "@greyfield/core-runtime";

export class JsonlSummarySegmentStore implements SummarySegmentStore {
  private sequence = 0;

  constructor(private readonly path: string) {}

  async append(segment: AppendSummarySegment): Promise<SummarySegment> {
    const current = await this.readSegments();
    this.sequence = Math.max(this.sequence, ...current.map((item) => parseSequence(item.id)));
    this.sequence += 1;
    const stored: SummarySegment = {
      id: `summary-${this.sequence}`,
      threadId: segment.threadId,
      sessionId: segment.sessionId,
      summary: segment.summary,
      recallCues: uniqueCleanStrings(segment.recallCues),
      sourceTurns: segment.sourceTurns,
      createdAt: segment.createdAt ?? new Date().toISOString()
    };
    await this.writeSegments([...current, stored]);
    return stored;
  }

  async list(threadId: string): Promise<SummarySegment[]> {
    return (await this.readSegments())
      .filter((segment) => segment.threadId === threadId)
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  }

  async delete(id: string): Promise<boolean> {
    const current = await this.readSegments();
    const next = current.filter((segment) => segment.id !== id);
    if (next.length === current.length) {
      return false;
    }
    await this.writeSegments(next);
    return true;
  }

  private async readSegments(): Promise<SummarySegment[]> {
    try {
      const raw = await readFile(this.path, "utf8");
      return raw
        .split(/\r?\n/)
        .filter(Boolean)
        .map((line) => JSON.parse(line) as SummarySegment);
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
}

function parseSequence(id: string): number {
  const match = /^summary-(\d+)$/.exec(id);
  return match ? Number(match[1]) : 0;
}

function uniqueCleanStrings(values: string[]): string[] {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))];
}

function isNotFoundError(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && error.code === "ENOENT";
}
