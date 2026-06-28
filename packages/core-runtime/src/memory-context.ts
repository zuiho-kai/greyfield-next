import type { ChatMessage } from "./providers";
import type { SessionTurn } from "./session-store";

export interface MemorySourceTurnRef {
  sessionId: string;
  turnId: string;
  role: SessionTurn["role"];
  createdAt: string;
}

export interface SummarySegment {
  id: string;
  threadId: string;
  sessionId: string;
  summary: string;
  recallCues: string[];
  sourceTurnIds?: string[];
  sourceTurns: MemorySourceTurnRef[];
  createdAt: string;
  disabled?: boolean;
  updatedAt?: string;
}

export interface AppendSummarySegment {
  threadId: string;
  sessionId: string;
  summary: string;
  recallCues: string[];
  sourceTurns: MemorySourceTurnRef[];
  sourceTurnIds?: string[];
  createdAt?: string;
}

export interface SummarySegmentLookup {
  get(id: string): Promise<SummarySegment | null>;
}

export interface SummarySegmentStore extends SummarySegmentLookup {
  append(segment: AppendSummarySegment): Promise<SummarySegment>;
  list(threadId: string): Promise<SummarySegment[]>;
  update(id: string, patch: UpdateSummarySegment): Promise<SummarySegment | null>;
  delete(id: string): Promise<boolean>;
}

export interface UpdateSummarySegment {
  summary?: string;
  recallCues?: string[];
  disabled?: boolean;
  updatedAt?: string;
}

export function normalizeRecallCues(values: string[]): string[] {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))];
}

export function normalizeSourceTurnIds(values: string[]): string[] {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))];
}

export function normalizeSummarySegmentUpdate(patch: UpdateSummarySegment): UpdateSummarySegment {
  return {
    ...(patch.summary !== undefined ? { summary: patch.summary.trim() } : {}),
    ...(patch.recallCues !== undefined ? { recallCues: normalizeRecallCues(patch.recallCues) } : {}),
    ...(patch.disabled !== undefined ? { disabled: patch.disabled } : {}),
    ...(patch.updatedAt !== undefined ? { updatedAt: patch.updatedAt } : {})
  };
}

export function normalizeSummarySegmentSources(segment: {
  sourceTurns?: MemorySourceTurnRef[];
  sourceTurnIds?: string[];
}): Pick<SummarySegment, "sourceTurns" | "sourceTurnIds"> {
  const sourceTurns = segment.sourceTurns ?? [];
  return {
    sourceTurns,
    sourceTurnIds: normalizeSourceTurnIds([...sourceTurns.map((turn) => turn.turnId), ...(segment.sourceTurnIds ?? [])])
  };
}

export function getSummarySegmentSourceTurnIds(segment: {
  sourceTurns?: MemorySourceTurnRef[];
  sourceTurnIds?: string[];
}): string[] {
  return normalizeSourceTurnIds([...(segment.sourceTurnIds ?? []), ...(segment.sourceTurns ?? []).map((turn) => turn.turnId)]);
}

export function normalizeSummarySegment(
  segment: Omit<SummarySegment, "sourceTurns" | "sourceTurnIds"> & {
    sourceTurns?: MemorySourceTurnRef[];
    sourceTurnIds?: string[];
  }
): SummarySegment {
  const sources = normalizeSummarySegmentSources(segment);
  return {
    ...segment,
    recallCues: normalizeRecallCues(segment.recallCues),
    sourceTurns: sources.sourceTurns,
    sourceTurnIds: sources.sourceTurnIds,
    disabled: segment.disabled ?? false,
    updatedAt: segment.updatedAt ?? segment.createdAt
  };
}

export interface SummarySegmentDraft {
  summary: string;
  recallCues: string[];
  sourceTurnIds: string[];
  sourceTurns: MemorySourceTurnRef[];
}

export interface CreateSummarySegmentDraftOptions {
  sessionId: string;
  turns: SessionTurn[];
  maxSummaryCharacters?: number;
  maxRecallCues?: number;
}

export interface RecallContextItem {
  kind: "summary-segment";
  id: string;
  summary: string;
  recallCues: string[];
  sourceTurnIds: string[];
  reason: string;
  score: number;
}

export interface RecallContext {
  items: RecallContextItem[];
  skipped: Array<{
    kind: RecallContextItem["kind"];
    id: string;
    reason: RecallSkipReason;
  }>;
  budget: RecallPromptBudgetTrace;
}

export type RecallSkipReason = "disabled" | "low score" | "over budget" | "irrelevant";

export interface RecallPromptBudgetTrace {
  itemCount: {
    used: number;
    limit: number;
    skipped: number;
  };
  characters: {
    used: number;
    limit: number;
    skipped: number;
  };
  sourcePassages: {
    usedCharacters: number;
    limitCharacters: number;
    usedCount: number;
    limitCount: number;
    skippedCount: number;
  };
}

export interface BuildRecallContextOptions {
  input: string;
  summarySegments: SummarySegment[];
  maxItems?: number;
  maxCharacters?: number;
  minScore?: number;
}

export type MemorySourceDrilldownRequest =
  | { kind: "summary-segment"; id: string }
  | { kind: "recall-context-item"; item: Pick<RecallContextItem, "kind" | "id" | "sourceTurnIds"> }
  | { kind: "source-turns"; sourceTurnIds: string[] };

export type MemorySourceDrilldownSource =
  | { kind: "summary-segment"; id: string }
  | { kind: "source-turns" };

export interface MemorySourceDrilldownResult {
  source: MemorySourceDrilldownSource;
  sourceTurnIds: string[];
  turns: SessionTurn[];
  missingTurnIds: string[];
}

const defaultMaxSummaryCharacters = 700;
const defaultMaxRecallCues = 8;
const defaultMaxRecallItems = 3;
const defaultMaxRecallCharacters = 1200;
const minTokenLength = 2;

const stopWords = new Set([
  "the",
  "and",
  "for",
  "with",
  "that",
  "this",
  "from",
  "have",
  "about",
  "现在",
  "这个",
  "那个",
  "我们",
  "你们",
  "他们",
  "继续",
  "问题"
]);

export function createSummarySegmentDraft(options: CreateSummarySegmentDraftOptions): SummarySegmentDraft {
  const eligibleTurns = options.turns.filter((turn) => turn.role === "user" || turn.role === "assistant");
  const sourceTurns = eligibleTurns.map((turn): MemorySourceTurnRef => ({
    sessionId: options.sessionId,
    turnId: turn.id,
    role: turn.role,
    createdAt: turn.createdAt
  }));
  const maxSummaryCharacters = options.maxSummaryCharacters ?? defaultMaxSummaryCharacters;
  const summary = truncateAtBoundary(
    eligibleTurns.map((turn) => `${turn.role}: ${turn.content.trim()}`).filter(Boolean).join("\n"),
    maxSummaryCharacters
  );

  return {
    summary,
    recallCues: extractRecallCues(
      eligibleTurns.map((turn) => turn.content).join(" "),
      options.maxRecallCues ?? defaultMaxRecallCues
    ),
    sourceTurnIds: normalizeSourceTurnIds(sourceTurns.map((turn) => turn.turnId)),
    sourceTurns
  };
}

export function buildRecallContext(options: BuildRecallContextOptions): RecallContext {
  const maxItems = Math.max(0, options.maxItems ?? defaultMaxRecallItems);
  const maxCharacters = Math.max(0, options.maxCharacters ?? defaultMaxRecallCharacters);
  const minScore = Math.max(0, options.minScore ?? 0);
  const inputTokens = tokenize(options.input);
  const skipped: RecallContext["skipped"] = options.summarySegments
    .filter((segment) => segment.disabled)
    .map((segment) => ({
      kind: "summary-segment",
      id: segment.id,
      reason: "disabled"
    }));
  const scored = options.summarySegments
    .filter((segment) => !segment.disabled)
    .map((segment) => {
      const cueMatches = segment.recallCues.filter((cue) => containsCue(options.input, cue));
      const summaryTokens = tokenList(segment.summary);
      const tokenMatches = summaryTokens.filter((token) => inputTokens.has(token));
      const matchScore = cueMatches.length * 5 + tokenMatches.length;
      const score = matchScore > 0 ? matchScore + recencyScore(segment.createdAt) : 0;
      return {
        segment,
        cueMatches,
        tokenMatches,
        score
      };
    });
  for (const item of scored) {
    if (item.score <= 0) {
      skipped.push({ kind: "summary-segment", id: item.segment.id, reason: "irrelevant" });
      continue;
    }
    if (item.score < minScore) {
      skipped.push({ kind: "summary-segment", id: item.segment.id, reason: "low score" });
    }
  }
  const ranked = scored
    .filter((item) => item.score > 0 && item.score >= minScore)
    .sort((a, b) => b.score - a.score || b.segment.createdAt.localeCompare(a.segment.createdAt));

  const items: RecallContextItem[] = [];
  let usedCharacters = 0;
  let overBudgetSkipped = 0;

  for (const item of ranked) {
    const candidate: RecallContextItem = {
      kind: "summary-segment",
      id: item.segment.id,
      summary: item.segment.summary,
      recallCues: item.segment.recallCues,
      sourceTurnIds: getSummarySegmentSourceTurnIds(item.segment),
      reason: item.cueMatches.length > 0 ? `cue:${item.cueMatches.join(",")}` : "lexical",
      score: item.score
    };
    const nextCharacters = formatRecallContextForPrompt({ items: [...items, candidate] }).length;
    if (items.length >= maxItems || nextCharacters > maxCharacters) {
      skipped.push({
        kind: "summary-segment",
        id: item.segment.id,
        reason: "over budget"
      });
      overBudgetSkipped += 1;
      continue;
    }
    items.push(candidate);
    usedCharacters = nextCharacters;
  }

  return {
    items,
    skipped,
    budget: {
      itemCount: {
        used: items.length,
        limit: maxItems,
        skipped: overBudgetSkipped
      },
      characters: {
        used: usedCharacters,
        limit: maxCharacters,
        skipped: overBudgetSkipped
      },
      sourcePassages: {
        usedCharacters: 0,
        limitCharacters: 0,
        usedCount: 0,
        limitCount: 0,
        skippedCount: 0
      }
    }
  };
}

export function buildMemorySourceDrilldownResult(options: {
  source: MemorySourceDrilldownSource;
  sourceTurnIds: string[];
  turns: SessionTurn[];
}): MemorySourceDrilldownResult {
  const sourceTurnIds = normalizeSourceTurnIds(options.sourceTurnIds);
  const foundTurnIds = new Set(options.turns.map((turn) => turn.id));
  return {
    source: options.source,
    sourceTurnIds,
    turns: options.turns,
    missingTurnIds: sourceTurnIds.filter((turnId) => !foundTurnIds.has(turnId))
  };
}

export function formatRecallContextForPrompt(
  context: Pick<RecallContext, "items"> & Partial<Pick<RecallContext, "skipped" | "budget">>
): string {
  if (context.items.length === 0) {
    return "";
  }
  return context.items
    .map((item) => {
      const sources = item.sourceTurnIds.join(", ");
      const cues = item.recallCues.join(", ");
      return [
        `- ${item.kind} ${item.id}`,
        `  Reason: ${item.reason}`,
        `  Source turns: ${sources}`,
        cues.length > 0 ? `  Recall cues: ${cues}` : "",
        `  Summary: ${item.summary}`
      ]
        .filter(Boolean)
        .join("\n");
    })
    .join("\n");
}

export function recallContextToMessage(context: RecallContext): ChatMessage | undefined {
  const formatted = formatRecallContextForPrompt(context);
  if (formatted.length === 0) {
    return undefined;
  }
  return {
    role: "system",
    content: `Relevant recalled memory:\n${formatted}`
  };
}

function extractRecallCues(text: string, maxCues: number): string[] {
  const counts = new Map<string, number>();
  for (const token of tokenList(text)) {
    counts.set(token, (counts.get(token) ?? 0) + 1);
  }
  return [...counts.entries()]
    .sort((a, b) => cueScore(b) - cueScore(a) || a[0].localeCompare(b[0]))
    .slice(0, maxCues)
    .map(([token]) => token);
}

function cueScore(entry: [string, number]): number {
  const [token, count] = entry;
  const asciiNameBoost = /^[a-z][a-z0-9_-]*$/i.test(token) ? 0.5 : 0;
  return count + asciiNameBoost;
}

function tokenize(text: string): Set<string> {
  return new Set(tokenList(text));
}

function tokenList(text: string): string[] {
  const matches = text.toLowerCase().match(/[\p{L}\p{N}_-]{2,}/gu) ?? [];
  return matches.filter((token) => token.length >= minTokenLength && !stopWords.has(token));
}

function containsCue(input: string, cue: string): boolean {
  return input.toLowerCase().includes(cue.toLowerCase());
}

function truncateAtBoundary(text: string, maxCharacters: number): string {
  if (text.length <= maxCharacters) {
    return text;
  }
  const clipped = text.slice(0, maxCharacters);
  const lastNewline = clipped.lastIndexOf("\n");
  if (lastNewline > Math.floor(maxCharacters * 0.6)) {
    return `${clipped.slice(0, lastNewline).trimEnd()}\n...`;
  }
  return `${clipped.trimEnd()}...`;
}

function recencyScore(createdAt: string): number {
  const time = Date.parse(createdAt);
  if (Number.isNaN(time)) {
    return 0;
  }
  return Math.min(1, Math.max(0, time / 10_000_000_000_000));
}
