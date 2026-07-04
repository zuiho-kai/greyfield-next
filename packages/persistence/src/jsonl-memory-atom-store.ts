// Temporary stub file for backward compatibility
// TODO: Remove after migrating to new memory system

import type { MemoryAtom, MemoryAtomStore, UpdateMemoryAtom } from "@greyfield/core-runtime";

export class JsonlMemoryAtomStore implements MemoryAtomStore {
  constructor(private readonly filePath: string) {}

  async append(atom: MemoryAtom): Promise<void> {
    // Stub implementation
  }

  async list(): Promise<MemoryAtom[]> {
    return [];
  }

  async update(id: string, updates: UpdateMemoryAtom): Promise<void> {
    // Stub implementation
  }
}
