// Temporary stub file for backward compatibility
// TODO: Remove after migrating to new memory system

export class MemoryStore {
  constructor(private readonly filePath: string) {}

  async load(): Promise<string> {
    return "";
  }

  async save(content: string): Promise<void> {
    // Stub implementation
  }
}
