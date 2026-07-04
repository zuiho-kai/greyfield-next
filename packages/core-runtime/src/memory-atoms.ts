// Temporary stub file for backward compatibility
// TODO: Remove after migrating to new memory system

export interface MemoryAtom {
  id: string;
  content: string;
  sourceTurnIds: string[];
  sourceSessionId?: string;
}

export interface MemoryAtomStore {
  append(atom: MemoryAtom): Promise<void>;
  list(): Promise<MemoryAtom[]>;
  update(id: string, updates: UpdateMemoryAtom): Promise<void>;
}

export interface UpdateMemoryAtom {
  content?: string;
}

export interface MemoryAtomRecallContext {
  items: MemoryAtom[];
  skipped: MemoryAtom[];
}

export type MemoryAtomExtractionMode = "disabled" | "manual" | "auto";
export type MemoryAtomExtractionStatusReason = "disabled" | "provider-unavailable" | "ok";

export interface MemoryAtomExtractionStatus {
  mode: MemoryAtomExtractionMode;
  reason?: MemoryAtomExtractionStatusReason;
}

export interface MemoryAtomExtractionReport {
  status: MemoryAtomExtractionStatus;
  atoms: MemoryAtom[];
}

export interface MemoryAtomExtractor {
  extract(content: string): Promise<MemoryAtom[]>;
}

export interface MemoryAtomWritePolicyOptions {
  autoWrite?: boolean;
}

export function buildMemoryAtomRecallContext(options: {
  input: string;
  atoms: MemoryAtom[];
  maxItems?: number;
  maxCharacters?: number;
  sourceTurns?: any[];
}): MemoryAtomRecallContext {
  return { items: [], skipped: [] };
}

export function formatMemoryAtomRecallContextForPrompt(context: MemoryAtomRecallContext): string {
  return "";
}

export function createMemoryAtomMergePatch(existing: MemoryAtom[], incoming: MemoryAtom[]): any {
  return { toCreate: [], toUpdate: [] };
}

export function filterMemoryAtomsForAutomaticWrite(atoms: MemoryAtom[]): MemoryAtom[] {
  return [];
}

export function findSimilarMemoryAtom(atoms: MemoryAtom[], target: MemoryAtom): MemoryAtom | undefined {
  return undefined;
}

export class DeterministicMemoryAtomExtractor implements MemoryAtomExtractor {
  async extract(): Promise<MemoryAtom[]> {
    return [];
  }
}

export class LLMBackedMemoryAtomExtractor implements MemoryAtomExtractor {
  async extract(): Promise<MemoryAtom[]> {
    return [];
  }
}
