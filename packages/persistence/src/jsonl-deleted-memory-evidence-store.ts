// Temporary stub file for backward compatibility
// TODO: Remove after migrating to new memory system

import type { DeletedMemoryEvidence, DeletedMemoryEvidenceStore, AppendDeletedMemoryEvidence } from "@greyfield/core-runtime";

export class JsonlDeletedMemoryEvidenceStore implements DeletedMemoryEvidenceStore {
  constructor(private readonly filePath: string) {}

  async append(evidence: AppendDeletedMemoryEvidence): Promise<void> {
    // Stub implementation
  }

  async list(): Promise<DeletedMemoryEvidence[]> {
    return [];
  }
}
