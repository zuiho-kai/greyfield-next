// Temporary stub file for backward compatibility
// TODO: Remove after migrating to new memory system

export interface DeletedMemoryEvidence {
  turnId: string;
  sessionId: string;
  deletedAt: Date;
}

export interface DeletedMemoryEvidenceStore {
  append(evidence: DeletedMemoryEvidence): Promise<void>;
  list(): Promise<DeletedMemoryEvidence[]>;
}

export interface AppendDeletedMemoryEvidence {
  turnId: string;
  sessionId: string;
}

export function filterDeletedSessionTurns(
  turns: any[],
  evidence: DeletedMemoryEvidence[],
  sessionId: string
): any[] {
  return turns.filter(turn =>
    !hasDeletedMemoryEvidenceSource(evidence, turn.id, sessionId)
  );
}

export function hasDeletedMemoryEvidenceSource(
  evidence: DeletedMemoryEvidence[],
  turnId: string,
  sessionId: string
): boolean {
  return evidence.some(e => e.turnId === turnId && e.sessionId === sessionId);
}

export function sourceTurnIdsContainDeletedEvidence(
  turnIds: string[],
  evidence: DeletedMemoryEvidence[],
  sessionId: string
): boolean {
  return turnIds.some(turnId =>
    hasDeletedMemoryEvidenceSource(evidence, turnId, sessionId)
  );
}
