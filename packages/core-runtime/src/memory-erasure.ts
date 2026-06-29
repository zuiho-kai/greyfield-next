import { normalizeSourceTurnIds } from "./memory-context";
import type { SessionTurn } from "./session-store";

export type DeletedMemoryEvidenceKind = "summary-segment" | "memory-atom";

export interface DeletedMemoryEvidence {
  id: string;
  threadId: string;
  kind: DeletedMemoryEvidenceKind;
  memoryId: string;
  sourceTurnIds: string[];
  sourceSessionId?: string;
  deletedAt: string;
}

export interface AppendDeletedMemoryEvidence {
  threadId: string;
  kind: DeletedMemoryEvidenceKind;
  memoryId: string;
  sourceTurnIds: string[];
  sourceSessionId?: string;
  deletedAt?: string;
}

export interface DeletedMemoryEvidenceLookup {
  list(threadId: string): Promise<DeletedMemoryEvidence[]>;
}

export interface DeletedMemoryEvidenceStore extends DeletedMemoryEvidenceLookup {
  append(record: AppendDeletedMemoryEvidence): Promise<DeletedMemoryEvidence>;
}

export function normalizeDeletedMemoryEvidence(record: DeletedMemoryEvidence): DeletedMemoryEvidence {
  return {
    ...record,
    sourceTurnIds: normalizeSourceTurnIds(record.sourceTurnIds ?? [])
  };
}

export function createDeletedMemoryEvidence(record: AppendDeletedMemoryEvidence): DeletedMemoryEvidence {
  const deletedAt = record.deletedAt ?? new Date().toISOString();
  const sourceTurnIds = normalizeSourceTurnIds(record.sourceTurnIds);
  return normalizeDeletedMemoryEvidence({
    id: buildDeletedMemoryEvidenceId(record.threadId, record.kind, record.memoryId, sourceTurnIds, record.sourceSessionId),
    threadId: record.threadId,
    kind: record.kind,
    memoryId: record.memoryId,
    sourceTurnIds,
    ...(record.sourceSessionId ? { sourceSessionId: record.sourceSessionId } : {}),
    deletedAt
  });
}

export function hasDeletedMemoryEvidenceSource(
  records: DeletedMemoryEvidence[],
  turnId: string,
  sessionId?: string
): boolean {
  const normalizedTurnId = turnId.trim();
  if (normalizedTurnId.length === 0) {
    return false;
  }
  return records.some((record) => {
    if (!record.sourceTurnIds.includes(normalizedTurnId)) {
      return false;
    }
    return !record.sourceSessionId || !sessionId || record.sourceSessionId === sessionId;
  });
}

export function filterDeletedSourceTurnIds(
  turnIds: string[],
  records: DeletedMemoryEvidence[],
  sessionId?: string
): string[] {
  return normalizeSourceTurnIds(turnIds).filter((turnId) => !hasDeletedMemoryEvidenceSource(records, turnId, sessionId));
}

export function filterDeletedSessionTurns<T extends SessionTurn>(
  turns: T[],
  records: DeletedMemoryEvidence[],
  sessionId: string
): T[] {
  return turns.filter((turn) => !hasDeletedMemoryEvidenceSource(records, turn.id, sessionId));
}

export function sourceTurnIdsContainDeletedEvidence(
  turnIds: string[] | undefined,
  records: DeletedMemoryEvidence[],
  sessionId?: string
): boolean {
  return (turnIds ?? []).some((turnId) => hasDeletedMemoryEvidenceSource(records, turnId, sessionId));
}

function buildDeletedMemoryEvidenceId(
  threadId: string,
  kind: DeletedMemoryEvidenceKind,
  memoryId: string,
  sourceTurnIds: string[],
  sourceSessionId?: string
): string {
  return `deleted-evidence-${stableHash([threadId, kind, memoryId, sourceSessionId ?? "", ...sourceTurnIds].join("|"))}`;
}

function stableHash(value: string): string {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
}
