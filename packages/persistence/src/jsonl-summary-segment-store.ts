// Temporary stub file for backward compatibility
// TODO: Remove after migrating to new memory system

import type { SummarySegment, SummarySegmentStore } from "@greyfield/core-runtime";

export class JsonlSummarySegmentStore implements SummarySegmentStore {
  constructor(private readonly filePath: string) {}

  async append(segment: SummarySegment): Promise<void> {
    // Stub implementation
  }

  async list(): Promise<SummarySegment[]> {
    return [];
  }
}
