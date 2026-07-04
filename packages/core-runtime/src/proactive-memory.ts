// Temporary stub file for backward compatibility
// TODO: Remove after migrating to new memory system

export interface ProactiveMemoryConfig {
  enabled: boolean;
}

export function createProactiveMemoryConfig(): ProactiveMemoryConfig {
  return { enabled: false };
}
