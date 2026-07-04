// Temporary stub file for backward compatibility
// TODO: Remove after migrating to new memory system

import type { SessionTurn } from "./session-store";

export interface SummarySegment {
  id: string;
  sessionId: string;
  summary: string;
  turnIds: string[];
  createdAt: Date;
}

export interface SummarySegmentStore {
  append(segment: SummarySegment): Promise<void>;
  list(): Promise<SummarySegment[]>;
}

export interface RecallContext {
  items: SummarySegment[];
  skipped: SummarySegment[];
}

export function buildRecallContext(options: {
  input: string;
  summarySegments: SummarySegment[];
  maxItems?: number;
  maxCharacters?: number;
}): RecallContext {
  return { items: [], skipped: [] };
}

export function formatRecallContextForPrompt(context: RecallContext): string {
  return "";
}

export function createSummarySegmentDraft(turns: SessionTurn[], sessionId: string): SummarySegment {
  return {
    id: "",
    sessionId,
    summary: "",
    turnIds: [],
    createdAt: new Date()
  };
}

export function getSummarySegmentSourceTurnIds(segment: SummarySegment): string[] {
  return segment.turnIds || [];
}

export function normalizeSummarySegment(segment: any): SummarySegment {
  return segment;
}
