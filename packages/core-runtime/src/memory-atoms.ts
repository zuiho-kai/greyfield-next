import type { ChatMessage, LLMProvider } from "./providers";
import type { SessionTurn } from "./session-store";
import { normalizeSourceTurnIds, type RecallPromptBudgetTrace, type RecallSkipReason } from "./memory-context";

export type MemoryAtomType = "fact" | "preference" | "opinion" | "relationship_event" | "episodic_scene" | "promise";
export type MemoryAtomSentiment = "positive" | "negative" | "neutral";
export type MemoryAtomExtractionMode = "deterministic" | "llm" | "hybrid";
export type MemoryAtomTriggerLane =
  | "exact"
  | "alias"
  | "secondary"
  | "calendar"
  | "environment"
  | "semantic"
  | "relationship";

export interface MemoryAtomEventDate {
  kind: "absolute" | "month_day";
  sourceText: string;
  precision: "day" | "month_day";
  isoDate?: string;
  month?: number;
  day?: number;
}

export interface MemoryAtomRecurrence {
  frequency: "annual";
  sourceText: string;
}

export interface MemoryAtomTriggers {
  exact: string[];
  aliases: string[];
  secondary: string[];
  calendar?: string[];
  environment?: string[];
  semantic?: string[];
  relationship?: string[];
}

export interface MemoryAtom {
  id: string;
  threadId: string;
  type: MemoryAtomType;
  text: string;
  sourceTurnIds: string[];
  sourceSessionId?: string;
  createdAt: string;
  updatedAt?: string;
  disabled?: boolean;
  importance: number;
  triggerKeys: string[];
  triggers: MemoryAtomTriggers;
  eventDate?: MemoryAtomEventDate;
  recurrence?: MemoryAtomRecurrence;
  ritualAction?: string;
  subject?: string;
  object?: string;
  sentiment?: MemoryAtomSentiment;
  metadata?: Record<string, string | string[] | number | boolean | null>;
}

export interface UpdateMemoryAtom {
  text?: string;
  sourceTurnIds?: string[];
  sourceSessionId?: string;
  disabled?: boolean;
  importance?: number;
  triggers?: Partial<MemoryAtomTriggers>;
  eventDate?: MemoryAtomEventDate;
  recurrence?: MemoryAtomRecurrence;
  ritualAction?: string;
  subject?: string;
  object?: string;
  sentiment?: MemoryAtomSentiment;
  metadata?: Record<string, string | string[] | number | boolean | null>;
  updatedAt?: string;
}

export interface MemoryAtomStore {
  append(atom: MemoryAtom): Promise<MemoryAtom>;
  list(threadId: string): Promise<MemoryAtom[]>;
  update(id: string, patch: UpdateMemoryAtom): Promise<MemoryAtom | null>;
  delete(id: string): Promise<boolean>;
}

export interface MemoryAtomExtractionInput {
  text: string;
  threadId: string;
  sourceTurnIds: string[];
  sourceSessionId?: string;
  createdAt?: string;
  now?: string | Date;
  signal?: AbortSignal;
}

export interface MemoryAtomExtractor {
  extract(input: MemoryAtomExtractionInput): Promise<MemoryAtom[]>;
}

export class DeterministicMemoryAtomExtractor implements MemoryAtomExtractor {
  async extract(input: MemoryAtomExtractionInput): Promise<MemoryAtom[]> {
    return extractDeterministicMemoryAtoms(input);
  }
}

export interface LLMBackedMemoryAtomExtractorOptions {
  llm: LLMProvider;
  mode?: Exclude<MemoryAtomExtractionMode, "deterministic">;
  fallbackExtractor?: MemoryAtomExtractor | false;
  maxResponseCharacters?: number;
  maxAtomTextCharacters?: number;
  maxTriggerCharacters?: number;
  minBackgroundImportance?: number;
  explicitSaveMinImportance?: number;
  explicitSaveImportanceFloor?: number;
  maxAtomsPerTurn?: number;
}

export interface MemoryAtomWritePolicyOptions {
  minBackgroundImportance?: number;
  explicitSaveMinImportance?: number;
  explicitSaveImportanceFloor?: number;
  maxAtomsPerTurn?: number;
}

export class LLMBackedMemoryAtomExtractor implements MemoryAtomExtractor {
  private readonly fallbackExtractor: MemoryAtomExtractor | false;

  constructor(private readonly options: LLMBackedMemoryAtomExtractorOptions) {
    this.fallbackExtractor = options.fallbackExtractor === undefined ? new DeterministicMemoryAtomExtractor() : options.fallbackExtractor;
  }

  async extract(input: MemoryAtomExtractionInput): Promise<MemoryAtom[]> {
    const fallbackAtoms = this.options.mode === "llm" ? [] : await this.extractFallback(input);
    if (shouldSkipBackgroundMemoryWrite(input)) {
      return [];
    }

    let llmAtoms: MemoryAtom[] | undefined;
    try {
      llmAtoms = await this.extractWithLLM(input);
    } catch {
      const degraded = this.options.mode === "llm" ? await this.extractFallback(input) : fallbackAtoms;
      return filterMemoryAtomsForAutomaticWrite(input, degraded, this.options);
    }

    const atoms = this.options.mode === "llm" ? llmAtoms : [...llmAtoms, ...fallbackAtoms];
    return filterMemoryAtomsForAutomaticWrite(input, dedupeAtomsByWriteKey(atoms), this.options);
  }

  private async extractFallback(input: MemoryAtomExtractionInput): Promise<MemoryAtom[]> {
    if (!this.fallbackExtractor) {
      return [];
    }
    return this.fallbackExtractor.extract(input);
  }

  private async extractWithLLM(input: MemoryAtomExtractionInput): Promise<MemoryAtom[]> {
    const response = await collectLLMText(
      this.options.llm,
      buildLLMAtomExtractionMessages(input),
      input.signal,
      this.options.maxResponseCharacters ?? defaultLLMAtomResponseCharacters
    );
    const parsed = parseLLMAtomResponse(response);
    const rawAtoms = Array.isArray(parsed.atoms) ? parsed.atoms : [];
    return rawAtoms
      .map((draft) =>
        normalizeLLMAtomDraft(draft, input, {
          maxAtomTextCharacters: this.options.maxAtomTextCharacters ?? defaultMaxLLMAtomTextCharacters,
          maxTriggerCharacters: this.options.maxTriggerCharacters ?? defaultMaxLLMTriggerCharacters
        })
      )
      .filter((atom): atom is MemoryAtom => Boolean(atom));
  }
}

export interface MemoryAtomRecallMatch {
  lane: MemoryAtomTriggerLane;
  key: string;
  score: number;
}

export interface MemoryAtomRecallLaneResolver {
  lane: Exclude<MemoryAtomTriggerLane, "exact" | "alias" | "secondary">;
  match(input: string, atom: MemoryAtom, options: BuildMemoryAtomRecallContextOptions): MemoryAtomRecallMatch[];
}

export interface MemoryAtomRecallContextItem {
  kind: "memory-atom";
  id: string;
  type: MemoryAtomType;
  text: string;
  sourceTurnIds: string[];
  matchedKeys: string[];
  reason: string;
  score: number;
  eventDate?: MemoryAtomEventDate;
  recurrence?: MemoryAtomRecurrence;
  ritualAction?: string;
  sourcePassages?: MemoryAtomSourcePassage[];
  missingSourceTurnIds?: string[];
}

export interface MemoryAtomSourcePassage {
  turnId: string;
  role: SessionTurn["role"];
  text: string;
  omittedCharacters?: number;
}

export interface MemoryAtomRecallContext {
  items: MemoryAtomRecallContextItem[];
  skipped: Array<{
    kind: "memory-atom";
    id: string;
    reason: RecallSkipReason;
  }>;
  budget: RecallPromptBudgetTrace;
}

export interface BuildMemoryAtomRecallContextOptions {
  input: string;
  atoms: MemoryAtom[];
  maxItems?: number;
  maxCharacters?: number;
  now?: string | Date;
  calendarWindowDays?: number;
  sourceTurns?: SessionTurn[];
  sourcePassageMode?: "auto" | "always" | "never";
  sourcePassageMaxCharacters?: number;
  sourcePassageMaxCharactersPerTurn?: number;
  sourcePassageMaxTurnsPerAtom?: number;
  minScore?: number;
  // Additional lanes can still be explicit adapters. The default deterministic path covers exact,
  // alias, secondary, calendar, semantic, and relationship graph-equivalent keys.
  resolvers?: MemoryAtomRecallLaneResolver[];
}

const defaultMaxAtomRecallItems = 4;
const defaultMaxAtomRecallCharacters = 1400;

const exactLaneScore = 100;
const aliasLaneScore = 70;
const semanticLaneScore = 58;
const relationshipLaneScore = 66;
const secondaryLaneScore = 40;
const calendarLaneScore = 82;
const defaultCalendarWindowDays = 1;
const defaultSourcePassageMaxCharacters = 360;
const defaultSourcePassageMaxCharactersPerTurn = 220;
const defaultSourcePassageMaxTurnsPerAtom = 2;
const defaultLLMAtomResponseCharacters = 12_000;
const defaultMaxLLMAtomTextCharacters = 260;
const defaultMaxLLMTriggerCharacters = 48;
const defaultMaxMetadataStringCharacters = 90;
const defaultMinBackgroundImportance = 0.78;
const defaultExplicitSaveMinImportance = 0.4;
const defaultExplicitSaveImportanceFloor = 0.65;
const defaultMaxAtomsPerTurn = 8;
const allowedMemoryAtomTypes = new Set<MemoryAtomType>([
  "fact",
  "preference",
  "opinion",
  "relationship_event",
  "episodic_scene",
  "promise"
]);
const allowedSentiments = new Set<MemoryAtomSentiment>(["positive", "negative", "neutral"]);

export function extractDeterministicMemoryAtoms(input: MemoryAtomExtractionInput): MemoryAtom[] {
  const normalizedText = normalizeText(input.text);
  if (normalizedText.length === 0) {
    return [];
  }

  const atoms: MemoryAtom[] = [];
  const push = (atom: Omit<MemoryAtom, "id" | "createdAt" | "threadId" | "sourceTurnIds" | "triggerKeys">) => {
    const createdAt = toIsoDateTime(input.createdAt ?? input.now ?? new Date());
    const draft: MemoryAtom = {
      ...atom,
      id: "",
      threadId: input.threadId,
      sourceTurnIds: input.sourceTurnIds,
      sourceSessionId: input.sourceSessionId,
      createdAt,
      triggers: normalizeTriggers(atom.triggers),
      triggerKeys: []
    };
    draft.triggerKeys = flattenTriggerKeys(draft.triggers);
    draft.id = buildMemoryAtomId(draft);
    atoms.push(draft);
  };

  const birthday = extractBirthdayAtom(normalizedText, input);
  if (birthday) {
    push(birthday);
  }

  const callName = extractCallNameAtom(normalizedText);
  if (callName) {
    push(callName);
  }

  const relationshipEvent = extractRelationshipEventAtom(normalizedText, input);
  if (relationshipEvent) {
    push(relationshipEvent);
  }

  const promise = extractPromiseAtom(normalizedText);
  if (promise) {
    push(promise);
  }

  const gameOpinion = extractGameOpinionAtom(normalizedText);
  if (gameOpinion) {
    push(gameOpinion);
  }

  const episodicScene = extractEpisodicSceneAtom(normalizedText, input);
  if (episodicScene) {
    push(episodicScene);
  }

  if (atoms.length === 0 && hasExplicitSaveIntent(normalizedText) && !shouldRejectPromiseMemoryText(normalizedText)) {
    push({
      type: "fact",
      text: stripExplicitSavePrefix(normalizedText),
      importance: 0.65,
      subject: "user",
      triggers: {
        exact: extractFallbackTriggerKeys(normalizedText),
        aliases: [],
        secondary: []
      }
    });
  }

  return dedupeAtoms(atoms);
}

export function filterMemoryAtomsForAutomaticWrite(
  input: MemoryAtomExtractionInput,
  atoms: MemoryAtom[],
  options: MemoryAtomWritePolicyOptions = {}
): MemoryAtom[] {
  const explicitSave = hasExplicitSaveIntent(normalizeText(input.text));
  if (!explicitSave && shouldSkipBackgroundMemoryWrite(input)) {
    return [];
  }

  const minBackgroundImportance = options.minBackgroundImportance ?? defaultMinBackgroundImportance;
  const explicitSaveMinImportance = options.explicitSaveMinImportance ?? defaultExplicitSaveMinImportance;
  const explicitSaveImportanceFloor = options.explicitSaveImportanceFloor ?? defaultExplicitSaveImportanceFloor;
  const maxAtomsPerTurn = options.maxAtomsPerTurn ?? defaultMaxAtomsPerTurn;

  const filtered = atoms
    .map((atom) => (explicitSave && atom.importance < explicitSaveImportanceFloor ? { ...atom, importance: explicitSaveImportanceFloor } : atom))
    .filter((atom) => {
      if (atom.sourceTurnIds.some((turnId) => !input.sourceTurnIds.includes(turnId))) {
        return false;
      }
      if (atom.disabled || atom.text.trim().length === 0 || memoryAtomContainsUnsafeText(atom)) {
        return false;
      }
      if (isUnrelatedPromiseAtom(input.text, atom)) {
        return false;
      }
      if (!explicitSave && (isUiEventNoise(`${input.text} ${atom.text}`) || containsPrivateContextSignal(`${input.text} ${atom.text}`))) {
        return false;
      }
      return explicitSave ? atom.importance >= explicitSaveMinImportance : atom.importance >= minBackgroundImportance;
    });

  return dedupeAtomsByWriteKey(filtered).slice(0, maxAtomsPerTurn);
}

export function findSimilarMemoryAtom(existingAtoms: MemoryAtom[], candidate: MemoryAtom): MemoryAtom | undefined {
  const candidateKeys = buildMemoryAtomWriteKeys(candidate);
  return existingAtoms.find((atom) => {
    if (atom.threadId !== candidate.threadId || atom.type !== candidate.type || atom.disabled) {
      return false;
    }
    const existingKeys = buildMemoryAtomWriteKeys(atom);
    return candidateKeys.some((key) => existingKeys.includes(key));
  });
}

export function createMemoryAtomMergePatch(existing: MemoryAtom, candidate: MemoryAtom, updatedAt = new Date().toISOString()): UpdateMemoryAtom {
  return {
    text: candidate.text.length > existing.text.length ? candidate.text : existing.text,
    sourceTurnIds: normalizeSourceTurnIds([...existing.sourceTurnIds, ...candidate.sourceTurnIds]),
    sourceSessionId: existing.sourceSessionId ?? candidate.sourceSessionId,
    importance: Math.max(existing.importance, candidate.importance),
    triggers: mergeMemoryAtomTriggers(existing.triggers, candidate.triggers),
    eventDate: existing.eventDate ?? candidate.eventDate,
    recurrence: existing.recurrence ?? candidate.recurrence,
    ritualAction: existing.ritualAction ?? candidate.ritualAction,
    subject: existing.subject ?? candidate.subject,
    object: existing.object ?? candidate.object,
    sentiment: existing.sentiment ?? candidate.sentiment,
    metadata: mergeMemoryAtomMetadata(existing.metadata, candidate.metadata),
    updatedAt
  };
}

export function buildMemoryAtomRecallContext(options: BuildMemoryAtomRecallContextOptions): MemoryAtomRecallContext {
  const maxItems = Math.max(0, options.maxItems ?? defaultMaxAtomRecallItems);
  const maxCharacters = Math.max(0, options.maxCharacters ?? defaultMaxAtomRecallCharacters);
  const minScore = Math.max(0, options.minScore ?? 0);
  const sourcePassageCharactersLimit =
    options.sourceTurns !== undefined && options.sourcePassageMode !== "never"
      ? Math.max(0, options.sourcePassageMaxCharacters ?? defaultSourcePassageMaxCharacters)
      : 0;
  const sourcePassageCountLimit =
    options.sourceTurns !== undefined && options.sourcePassageMode !== "never"
      ? maxItems * Math.max(0, options.sourcePassageMaxTurnsPerAtom ?? defaultSourcePassageMaxTurnsPerAtom)
      : 0;
  const skipped: MemoryAtomRecallContext["skipped"] = options.atoms
    .filter((atom) => atom.disabled)
    .map((atom) => ({ kind: "memory-atom", id: atom.id, reason: "disabled" }));

  const scored = options.atoms
    .filter((atom) => !atom.disabled)
    .map((atom) => {
      if (shouldSuppressCompanionRelationshipRecall(options.input, atom)) {
        return { atom, matches: [], score: 0 };
      }
      if (shouldSuppressPromiseRecall(options.input, atom)) {
        return { atom, matches: [], score: 0 };
      }
      const matches = [
        ...matchTriggerLane(options.input, atom.triggers.exact, "exact", exactLaneScore),
        ...matchTriggerLane(options.input, atom.triggers.aliases, "alias", aliasLaneScore),
        ...matchTriggerLane(options.input, atom.triggers.secondary, "secondary", secondaryLaneScore),
        ...matchCalendarLane(options.input, atom, options),
        ...matchSemanticLane(options.input, atom),
        ...matchRelationshipLane(options.input, atom),
        ...(options.resolvers ?? []).flatMap((resolver) => resolver.match(options.input, atom, options))
      ];
      const uniqueMatches = dedupeMatches(matches);
      const score =
        uniqueMatches.reduce((total, match) => total + match.score, 0) +
        Math.min(1, Math.max(0, atom.importance)) * 10 +
        recencyScore(atom.createdAt);
      return { atom, matches: uniqueMatches, score: uniqueMatches.length > 0 ? score : 0 };
    });
  for (const item of scored) {
    if (item.score <= 0) {
      skipped.push({ kind: "memory-atom", id: item.atom.id, reason: "irrelevant" });
      continue;
    }
    if (item.score < minScore) {
      skipped.push({ kind: "memory-atom", id: item.atom.id, reason: "low score" });
    }
  }
  const ranked = scored
    .filter((item) => item.score > 0 && item.score >= minScore)
    .sort((a, b) => b.score - a.score || b.atom.createdAt.localeCompare(a.atom.createdAt));

  const items: MemoryAtomRecallContextItem[] = [];
  let usedCharacters = 0;
  let usedSourcePassageCharacters = 0;
  let usedSourcePassageCount = 0;
  let skippedSourcePassageCount = 0;
  let overBudgetSkipped = 0;

  for (const item of ranked) {
    const candidate: MemoryAtomRecallContextItem = {
      kind: "memory-atom",
      id: item.atom.id,
      type: item.atom.type,
      text: item.atom.text,
      sourceTurnIds: item.atom.sourceTurnIds,
      matchedKeys: item.matches.map((match) => match.key),
      reason: formatAtomRecallReason(item.matches),
      score: item.score,
      eventDate: item.atom.eventDate,
      recurrence: item.atom.recurrence,
      ritualAction: item.atom.ritualAction
    };
    if (items.length >= maxItems) {
      skipped.push({
        kind: "memory-atom",
        id: item.atom.id,
        reason: "over budget"
      });
      overBudgetSkipped += 1;
      continue;
    }
    const requestedSourcePassageCount = countRequestedSourcePassages(candidate, options);
    const availableCharactersForItem = Math.max(0, maxCharacters - usedCharacters - (items.length > 0 ? 1 : 0));
    const candidateWithSources = attachSourcePassagesToRecallItem(
      candidate,
      options,
      availableCharactersForItem,
      Math.max(0, sourcePassageCharactersLimit - usedSourcePassageCharacters)
    );
    const nextCharacters = formatMemoryAtomRecallContextForPrompt({ items: [...items, candidateWithSources] }).length;
    if (nextCharacters > maxCharacters) {
      skipped.push({
        kind: "memory-atom",
        id: item.atom.id,
        reason: "over budget"
      });
      overBudgetSkipped += 1;
      continue;
    }
    const sourcePassageStats = getSourcePassageStats(candidateWithSources);
    items.push(candidateWithSources);
    usedCharacters = nextCharacters;
    usedSourcePassageCharacters += sourcePassageStats.characters;
    usedSourcePassageCount += sourcePassageStats.count;
    skippedSourcePassageCount += Math.max(0, requestedSourcePassageCount - sourcePassageStats.count);
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
        usedCharacters: usedSourcePassageCharacters,
        limitCharacters: sourcePassageCharactersLimit,
        usedCount: usedSourcePassageCount,
        limitCount: sourcePassageCountLimit,
        skippedCount: skippedSourcePassageCount
      }
    }
  };
}

export function formatMemoryAtomRecallContextForPrompt(
  context: Pick<MemoryAtomRecallContext, "items"> & Partial<Pick<MemoryAtomRecallContext, "skipped" | "budget">>
): string {
  if (context.items.length === 0) {
    return "";
  }
  return context.items
    .map((item) => {
      const detailLines = [
        item.eventDate ? `  Event date: ${formatEventDate(item.eventDate)}` : "",
        item.recurrence ? `  Recurrence: ${item.recurrence.frequency} (${item.recurrence.sourceText})` : "",
        item.ritualAction ? `  Ritual action: ${item.ritualAction}` : ""
      ].filter(Boolean);
      return [
        `- Source-linked ${formatMemoryAtomTypeLabel(item.type)}`,
        `  Reason: ${item.reason}`,
        `  Source turns: ${item.sourceTurnIds.join(", ")}`,
        item.matchedKeys.length > 0 ? `  Matched keys: ${item.matchedKeys.join(", ")}` : "",
        ...detailLines,
        ...(item.sourcePassages && item.sourcePassages.length > 0
          ? [
              "  Source fragments:",
              ...item.sourcePassages.map((passage) => {
                const omitted =
                  passage.omittedCharacters && passage.omittedCharacters > 0 ? ` (${passage.omittedCharacters} chars omitted)` : "";
                return `    - ${passage.turnId} ${passage.role}: ${passage.text}${omitted}`;
              })
            ]
          : []),
        item.missingSourceTurnIds && item.missingSourceTurnIds.length > 0
          ? `  Missing source turns: ${item.missingSourceTurnIds.join(", ")}`
          : "",
        `  Memory: ${item.text}`
      ]
        .filter(Boolean)
        .join("\n");
    })
    .join("\n");
}

export function memoryAtomRecallContextToMessage(context: MemoryAtomRecallContext): ChatMessage | undefined {
  const formatted = formatMemoryAtomRecallContextForPrompt(context);
  if (formatted.length === 0) {
    return undefined;
  }
  return {
    role: "system",
    content: `Relevant source-linked long-term memories:\n${formatted}`
  };
}

function formatMemoryAtomTypeLabel(type: MemoryAtomType): string {
  if (type === "relationship_event") {
    return "relationship memory";
  }
  if (type === "episodic_scene") {
    return "scene memory";
  }
  if (type === "promise") {
    return "promise memory";
  }
  return `${type} memory`;
}

export function normalizeTriggers(triggers: MemoryAtomTriggers): MemoryAtomTriggers {
  return {
    exact: normalizeTriggerKeys(triggers.exact),
    aliases: normalizeTriggerKeys(triggers.aliases),
    secondary: normalizeTriggerKeys(triggers.secondary),
    ...(triggers.calendar ? { calendar: normalizeTriggerKeys(triggers.calendar) } : {}),
    ...(triggers.environment ? { environment: normalizeTriggerKeys(triggers.environment) } : {}),
    ...(triggers.semantic ? { semantic: normalizeTriggerKeys(triggers.semantic) } : {}),
    ...(triggers.relationship ? { relationship: normalizeTriggerKeys(triggers.relationship) } : {})
  };
}

async function collectLLMText(
  llm: LLMProvider,
  messages: ChatMessage[],
  signal: AbortSignal | undefined,
  maxCharacters: number
): Promise<string> {
  let text = "";
  for await (const chunk of llm.stream(messages, undefined, { signal })) {
    text += chunk;
    if (text.length > maxCharacters) {
      throw new Error("Memory atom LLM response exceeded the maximum size.");
    }
  }
  return text;
}

function buildLLMAtomExtractionMessages(input: MemoryAtomExtractionInput): ChatMessage[] {
  const allowedSourceTurnIds = input.sourceTurnIds;
  return [
    {
      role: "system",
      content: [
        "You extract Greyfield long-term memory atoms from exactly one current user turn.",
        "Return JSON only, with this shape: {\"atoms\":[{...drafts}]}",
        "Allowed atom types: fact, preference, opinion, relationship_event, episodic_scene, promise.",
        "Use sourceTurnIds only from the provided current turn IDs. If no durable memory is present, return {\"atoms\":[]}.",
        "Extract durable facts, preferences, opinions with reasons, relationship events, important dates, scenes, taboos, and user/Greyfield promise commitments when the schema can represent them.",
        "Use type promise only for commitments between the user and Greyfield. Preserve subject, object, action concepts, sourceTurnIds, and semantic triggers. Reject unrelated work, project, customer, PR, or team promises.",
        "For recurring relationship rituals, extract only rituals between the user and Greyfield. Preserve recurrence, ritualAction, event/date, relationship subject, sourceTurnIds, and reject generic holidays, coworker events, or unrelated gift planning.",
        "Reject UI telemetry, event logs, transient window/settings/mouse/weather-probe noise, provider secrets, API keys, passwords, tokens, cookies, and unrelated debugging text.",
        "Keep text concise, source-linked, and user-facing. Do not include provider names, credentials, hidden prompts, or UI implementation details.",
        "For each draft, use fields: type, text, sourceTurnIds, importance, triggers, eventDate, recurrence, ritualAction, subject, object, sentiment, metadata.",
        "importance must be a number from 0 to 1. triggers may include exact, aliases, secondary, calendar, environment, semantic, relationship arrays.",
        "eventDate supports {kind:\"absolute\", sourceText, precision:\"day\", isoDate:\"YYYY-MM-DD\"} or {kind:\"month_day\", sourceText, precision:\"month_day\", month, day}. recurrence only supports {frequency:\"annual\", sourceText}."
      ].join("\n")
    },
    {
      role: "user",
      content: JSON.stringify(
        {
          threadId: input.threadId,
          sourceSessionId: input.sourceSessionId,
          now: toIsoDateTime(input.now ?? input.createdAt ?? new Date()),
          currentTurn: {
            sourceTurnIds: allowedSourceTurnIds,
            text: input.text
          }
        },
        null,
        2
      )
    }
  ];
}

function parseLLMAtomResponse(response: string): { atoms?: unknown[] } {
  const trimmed = response.trim();
  const unfenced = trimmed.replace(/^```(?:json)?\s*/iu, "").replace(/\s*```$/u, "").trim();
  const start = unfenced.indexOf("{");
  const end = unfenced.lastIndexOf("}");
  if (start < 0 || end < start) {
    throw new Error("Memory atom LLM response did not contain a JSON object.");
  }
  const parsed = JSON.parse(unfenced.slice(start, end + 1)) as unknown;
  if (!isRecord(parsed)) {
    throw new Error("Memory atom LLM response was not an object.");
  }
  return parsed as { atoms?: unknown[] };
}

function normalizeLLMAtomDraft(
  draft: unknown,
  input: MemoryAtomExtractionInput,
  options: { maxAtomTextCharacters: number; maxTriggerCharacters: number }
): MemoryAtom | undefined {
  if (!isRecord(draft)) {
    return;
  }

  const type = typeof draft.type === "string" && allowedMemoryAtomTypes.has(draft.type as MemoryAtomType)
    ? (draft.type as MemoryAtomType)
    : undefined;
  const text = normalizeBoundedText(draft.text, options.maxAtomTextCharacters);
  const sourceTurnIds = normalizeDraftSourceTurnIds(draft.sourceTurnIds, input.sourceTurnIds);
  const importance = normalizeImportance(draft.importance);
  if (!type || !text || !sourceTurnIds || importance === undefined || containsSecretLikeText(text) || isUiEventNoise(text)) {
    return;
  }

  let eventDate: MemoryAtomEventDate | undefined;
  let recurrence: MemoryAtomRecurrence | undefined;
  try {
    eventDate = normalizeDraftEventDate(draft.eventDate);
    recurrence = normalizeDraftRecurrence(draft.recurrence);
  } catch {
    return;
  }

  const triggers = normalizeDraftTriggers(draft.triggers, text, input.text, options.maxTriggerCharacters);
  const sentiment = typeof draft.sentiment === "string" && allowedSentiments.has(draft.sentiment as MemoryAtomSentiment)
    ? (draft.sentiment as MemoryAtomSentiment)
    : undefined;
  const metadata = normalizeDraftMetadata(draft.metadata);
  const createdAt = toIsoDateTime(input.createdAt ?? input.now ?? new Date());
  const atom: MemoryAtom = {
    id: "",
    threadId: input.threadId,
    type,
    text,
    sourceTurnIds,
    sourceSessionId: input.sourceSessionId,
    createdAt,
    importance,
    triggerKeys: [],
    triggers,
    eventDate,
    recurrence,
    ritualAction: normalizeOptionalBoundedText(draft.ritualAction, 48),
    subject: normalizeOptionalBoundedText(draft.subject, 60),
    object: normalizeOptionalBoundedText(draft.object, 80),
    sentiment,
    metadata
  };
  atom.triggerKeys = flattenTriggerKeys(atom.triggers);
  if (memoryAtomContainsUnsafeText(atom)) {
    return;
  }
  atom.id = buildMemoryAtomId(atom);
  return atom;
}

function normalizeDraftSourceTurnIds(raw: unknown, allowedSourceTurnIds: string[]): string[] | undefined {
  if (raw === undefined || raw === null) {
    return normalizeSourceTurnIds(allowedSourceTurnIds);
  }
  if (!Array.isArray(raw)) {
    return;
  }
  const sourceTurnIds = normalizeSourceTurnIds(raw.filter((value): value is string => typeof value === "string"));
  if (sourceTurnIds.length === 0) {
    return normalizeSourceTurnIds(allowedSourceTurnIds);
  }
  return sourceTurnIds.every((turnId) => allowedSourceTurnIds.includes(turnId)) ? sourceTurnIds : undefined;
}

function normalizeImportance(raw: unknown): number | undefined {
  if (typeof raw !== "number" || !Number.isFinite(raw) || raw < 0 || raw > 1) {
    return;
  }
  return roundScore(raw);
}

function normalizeDraftTriggers(
  raw: unknown,
  atomText: string,
  sourceText: string,
  maxTriggerCharacters: number
): MemoryAtomTriggers {
  const rawTriggers = isRecord(raw) ? raw : {};
  const normalized: MemoryAtomTriggers = {
    exact: normalizeDraftTriggerLane(rawTriggers.exact, maxTriggerCharacters),
    aliases: normalizeDraftTriggerLane(rawTriggers.aliases, maxTriggerCharacters),
    secondary: normalizeDraftTriggerLane(rawTriggers.secondary, maxTriggerCharacters)
  };
  for (const lane of ["calendar", "environment", "semantic", "relationship"] as const) {
    const values = normalizeDraftTriggerLane(rawTriggers[lane], maxTriggerCharacters);
    if (values.length > 0) {
      normalized[lane] = values;
    }
  }
  if (flattenTriggerKeys(normalized).length === 0) {
    normalized.exact = extractFallbackTriggerKeys(`${atomText} ${sourceText}`).slice(0, 6);
  }
  return normalizeTriggers(normalized);
}

function normalizeDraftTriggerLane(raw: unknown, maxTriggerCharacters: number): string[] {
  if (!Array.isArray(raw)) {
    return [];
  }
  return normalizeTriggerKeys(
    raw
      .filter((value): value is string => typeof value === "string")
      .map((value) => normalizeBoundedText(value, maxTriggerCharacters))
      .filter((value): value is string => Boolean(value))
      .filter((value) => !containsSecretLikeText(value) && !isUiEventNoise(value))
  ).slice(0, 8);
}

function normalizeDraftEventDate(raw: unknown): MemoryAtomEventDate | undefined {
  if (raw === undefined || raw === null) {
    return;
  }
  if (!isRecord(raw) || typeof raw.kind !== "string" || typeof raw.sourceText !== "string") {
    throw new Error("Invalid memory atom eventDate.");
  }
  if (raw.kind === "absolute") {
    const isoDate = typeof raw.isoDate === "string" ? raw.isoDate : undefined;
    const dateParts = isoDate?.match(/^(\d{4})-(\d{2})-(\d{2})$/u);
    const normalizedIsoDate = dateParts
      ? toIsoDateFromParts(Number(dateParts[1]), Number(dateParts[2]), Number(dateParts[3]))
      : undefined;
    if (!isoDate || normalizedIsoDate !== isoDate) {
      throw new Error("Invalid absolute memory atom eventDate.");
    }
    return {
      kind: "absolute",
      sourceText: normalizeText(raw.sourceText).slice(0, 40),
      precision: "day",
      isoDate
    };
  }
  if (raw.kind === "month_day") {
    const month = typeof raw.month === "number" ? raw.month : Number.NaN;
    const day = typeof raw.day === "number" ? raw.day : Number.NaN;
    if (!isValidMonthDay(month, day)) {
      throw new Error("Invalid month-day memory atom eventDate.");
    }
    return {
      kind: "month_day",
      sourceText: normalizeText(raw.sourceText).slice(0, 40),
      precision: "month_day",
      month,
      day
    };
  }
  throw new Error("Unsupported memory atom eventDate kind.");
}

function normalizeDraftRecurrence(raw: unknown): MemoryAtomRecurrence | undefined {
  if (raw === undefined || raw === null) {
    return;
  }
  if (!isRecord(raw) || raw.frequency !== "annual" || typeof raw.sourceText !== "string") {
    throw new Error("Invalid memory atom recurrence.");
  }
  return {
    frequency: "annual",
    sourceText: normalizeText(raw.sourceText).slice(0, 40)
  };
}

function normalizeDraftMetadata(raw: unknown): Record<string, string | string[] | number | boolean | null> | undefined {
  if (!isRecord(raw)) {
    return;
  }
  const entries = Object.entries(raw)
    .filter(([key]) => isSafeMetadataKey(key))
    .map(([key, value]) => [key, normalizeMetadataValue(value)] as const)
    .filter((entry): entry is readonly [string, string | string[] | number | boolean | null] => entry[1] !== undefined)
    .slice(0, 12);
  return entries.length > 0 ? Object.fromEntries(entries) : undefined;
}

function normalizeMetadataValue(value: unknown): string | string[] | number | boolean | null | undefined {
  if (value === null || typeof value === "boolean") {
    return value;
  }
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : undefined;
  }
  if (typeof value === "string") {
    return normalizeSafeMetadataString(value);
  }
  if (Array.isArray(value)) {
    const items = value
      .filter((item): item is string => typeof item === "string")
      .map(normalizeSafeMetadataString)
      .filter((item): item is string => Boolean(item))
      .slice(0, 8);
    return items.length > 0 ? items : undefined;
  }
  return;
}

function normalizeSafeMetadataString(value: string): string | undefined {
  const normalized = normalizeText(value);
  if (normalized.length === 0 || containsSecretLikeText(normalized) || isUiEventNoise(normalized)) {
    return;
  }
  return truncateAtBoundary(normalized, defaultMaxMetadataStringCharacters);
}

function normalizeBoundedText(raw: unknown, maxCharacters: number): string | undefined {
  if (typeof raw !== "string") {
    return;
  }
  const normalized = normalizeText(raw);
  if (normalized.length === 0) {
    return;
  }
  return truncateAtBoundary(normalized, maxCharacters);
}

function normalizeOptionalBoundedText(raw: unknown, maxCharacters: number): string | undefined {
  return raw === undefined || raw === null ? undefined : normalizeBoundedText(raw, maxCharacters);
}

function memoryAtomContainsUnsafeText(atom: MemoryAtom): boolean {
  return collectPersistedMemoryAtomStrings(atom).some((value) => {
    const text = normalizeText(value);
    return text.length > 0 && (containsSecretLikeText(text) || isUiEventNoise(text));
  });
}

function collectPersistedMemoryAtomStrings(atom: MemoryAtom): string[] {
  return [
    atom.text,
    ...atom.sourceTurnIds,
    atom.sourceSessionId,
    atom.subject,
    atom.object,
    atom.ritualAction,
    atom.eventDate?.sourceText,
    atom.recurrence?.sourceText,
    ...collectMemoryAtomTriggerStrings(atom.triggers),
    ...collectMetadataStrings(atom.metadata)
  ].filter((value): value is string => typeof value === "string");
}

function collectMemoryAtomTriggerStrings(triggers: MemoryAtomTriggers): string[] {
  return [
    ...triggers.exact,
    ...triggers.aliases,
    ...triggers.secondary,
    ...(triggers.calendar ?? []),
    ...(triggers.environment ?? []),
    ...(triggers.semantic ?? []),
    ...(triggers.relationship ?? [])
  ];
}

function collectMetadataStrings(metadata: MemoryAtom["metadata"]): string[] {
  if (!metadata) {
    return [];
  }
  const strings: string[] = [];
  for (const [key, value] of Object.entries(metadata)) {
    strings.push(key);
    if (typeof value === "string") {
      strings.push(value);
    } else if (Array.isArray(value)) {
      strings.push(...value.filter((item): item is string => typeof item === "string"));
    }
  }
  return strings;
}

function shouldSkipBackgroundMemoryWrite(input: MemoryAtomExtractionInput): boolean {
  const text = normalizeText(input.text);
  if (text.length === 0 || containsSecretLikeText(text)) {
    return true;
  }
  if (hasExplicitSaveIntent(text)) {
    return false;
  }
  return isUiEventNoise(text) || containsPrivateContextSignal(text);
}

function isUnrelatedPromiseAtom(sourceText: string, atom: MemoryAtom): boolean {
  if (atom.type !== "promise") {
    return false;
  }
  const combined = normalizeText([sourceText, ...collectPersistedMemoryAtomStrings(atom)].join(" "));
  return isPromiseSeparationWarning(sourceText) || (hasExternalPromiseTarget(combined) && !hasGreyfieldPromiseTarget(combined));
}

function containsSecretLikeText(text: string): boolean {
  return /(api[_\s-]?key|secret|token|password|authorization|bearer\s+[a-z0-9._-]+|sk-[a-z0-9_-]{12,}|cookie|credential)/iu.test(text);
}

function containsPrivateContextSignal(text: string): boolean {
  return /(截图|屏幕|剪贴板|浏览器地址|窗口标题|screenshot|screen capture|clipboard|window title|browser url|private tab)/iu.test(text);
}

function isUiEventNoise(text: string): boolean {
  return (
    /\b(settings window|window blurred|window focused|window resized|mouse moved|cursor moved|transparent desktop|runtime event|ipc event|weather probe)\b/iu.test(text) ||
    /\b(settings|window|mouse|cursor|drag|resize|blurred|focused|telemetry|probe)\b.*\b(opened|closed|resized|moved|blurred|focused|started)\b/iu.test(text)
  );
}

function isSafeMetadataKey(key: string): boolean {
  return /^[a-zA-Z0-9_:-]{1,40}$/u.test(key) && !/(api|key|secret|token|password|authorization|cookie|credential|provider)/iu.test(key);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function extractBirthdayAtom(
  text: string,
  input: MemoryAtomExtractionInput
): Omit<MemoryAtom, "id" | "createdAt" | "threadId" | "sourceTurnIds" | "triggerKeys"> | undefined {
  if (!/生日/u.test(text) || !/(记住|以后|别忘|今天|明天|后天|每年|生日是)/u.test(text)) {
    return;
  }
  const eventDate = parseEventDate(text, input.now);
  const dateKey = eventDate ? formatEventDate(eventDate) : "";
  return {
    type: "fact",
    text: dateKey.length > 0 ? `User birthday: ${dateKey}.` : "User shared a birthday memory.",
    importance: 0.9,
    subject: "user",
    object: "birthday",
    eventDate,
    recurrence: { frequency: "annual", sourceText: "生日" },
    triggers: {
      exact: ["生日", "birthday", dateKey],
      aliases: ["我的生日", "用户生日"],
      secondary: ["纪念日", "每年"],
      calendar: dateKey.length > 0 ? [dateKey] : []
    },
    metadata: {
      factType: "birthday"
    }
  };
}

function extractCallNameAtom(
  text: string
): Omit<MemoryAtom, "id" | "createdAt" | "threadId" | "sourceTurnIds" | "triggerKeys"> | undefined {
  const match = text.match(/(?:以后|记住|请)?\s*(?:叫我|称呼我)\s*([^，。,.!！?\s]+)/u);
  const name = match?.[1]?.trim();
  if (!name) {
    return;
  }
  return {
    type: "preference",
    text: `User prefers to be called ${name}.`,
    importance: 0.85,
    subject: "user",
    object: name,
    triggers: {
      exact: [name],
      aliases: ["称呼", "叫我", "怎么称呼"],
      secondary: ["称呼偏好", "名字"]
    },
    metadata: {
      preferenceType: "address_name",
      preferredName: name
    }
  };
}

interface RelationshipEventAttributes {
  text: string;
  eventType: string;
  object: string;
  eventDate?: MemoryAtomEventDate;
  recurrence?: MemoryAtomRecurrence;
  ritualAction?: string;
  exact: string[];
  aliases: string[];
  secondary: string[];
  semantic: string[];
  relationship: string[];
  metadata: Record<string, string | string[] | number | boolean | null>;
}

function extractRelationshipEventAtom(
  text: string,
  input: MemoryAtomExtractionInput
): Omit<MemoryAtom, "id" | "createdAt" | "threadId" | "sourceTurnIds" | "triggerKeys"> | undefined {
  const attributes = extractRelationshipEventAttributes(text, input);
  if (!attributes) {
    return;
  }
  return {
    type: "relationship_event",
    text: attributes.text,
    importance: 0.95,
    subject: "user_and_greyfield",
    object: attributes.object,
    eventDate: attributes.eventDate,
    recurrence: attributes.recurrence,
    ritualAction: attributes.ritualAction,
    triggers: {
      exact: attributes.exact,
      aliases: attributes.aliases,
      secondary: attributes.secondary,
      calendar: normalizeTriggerKeys([attributes.eventType, attributes.eventDate ? formatEventDate(attributes.eventDate) : ""]),
      semantic: attributes.semantic,
      relationship: attributes.relationship
    },
    metadata: attributes.metadata
  };
}

function extractRelationshipEventAttributes(text: string, input: MemoryAtomExtractionInput): RelationshipEventAttributes | undefined {
  if (!hasCompanionRelationshipTarget(text) || hasExternalRelationshipTarget(text)) {
    return;
  }
  return extractFirstMeetingRelationshipEventAttributes(text, input) ?? extractRecurringRelationshipRitualAttributes(text, input);
}

function extractFirstMeetingRelationshipEventAttributes(
  text: string,
  input: MemoryAtomExtractionInput
): RelationshipEventAttributes | undefined {
  if (!/(第一次遇见|第一次见面|初遇|相遇|first meeting|first met)/iu.test(text)) {
    return;
  }
  if (!/(记住|别忘|玫瑰|每年|纪念日|周年|anniversary)/iu.test(text)) {
    return;
  }
  const hasRose = /玫瑰|rose/iu.test(text);
  const eventDate = parseEventDate(text, input.now);
  return {
    text: hasRose
      ? "Relationship event: the user marked the first meeting anniversary by giving Greyfield a rose."
      : "Relationship event: the user marked the first meeting anniversary.",
    eventType: "first_meeting_anniversary",
    object: "first_meeting_anniversary",
    eventDate,
    recurrence: eventDate || /每年|纪念日|周年|anniversary/iu.test(text)
      ? { frequency: "annual", sourceText: /每年|annual/iu.test(text) ? "每年" : "first_meeting_anniversary" }
      : undefined,
    ritualAction: hasRose ? "送玫瑰" : undefined,
    exact: ["第一次遇见", "纪念日"],
    aliases: ["初遇", "相遇纪念日", "第一次见面"],
    secondary: hasRose ? ["玫瑰", "送花", "礼物"] : ["关系事件"],
    semantic: ["relationship milestone", "important day", "anniversary ritual", ...(hasRose ? ["gift ritual", "rose ritual"] : [])],
    relationship: [
      "user_and_greyfield",
      "relationship_event",
      "first_meeting_anniversary",
      "important_day",
      "relationship_ritual",
      ...(hasRose ? ["gift_ritual", "rose_ritual"] : [])
    ],
    metadata: {
      eventType: "first_meeting_anniversary",
      gift: hasRose ? "rose" : null
    }
  };
}

function extractRecurringRelationshipRitualAttributes(
  text: string,
  input: MemoryAtomExtractionInput
): RelationshipEventAttributes | undefined {
  if (!hasRecurringRelationshipRitualSignal(text)) {
    return;
  }
  const ritualAction = extractRelationshipRitualAction(text);
  if (!ritualAction) {
    return;
  }
  const eventDate = parseEventDate(text, input.now);
  const dateKey = eventDate ? formatEventDate(eventDate) : "";
  const ritualKind = classifyRelationshipRitualAction(ritualAction);
  return {
    text: `Relationship ritual: user and Greyfield repeat ${ritualAction} annually${dateKey ? ` on ${dateKey}` : ""}.`,
    eventType: "recurring_relationship_ritual",
    object: "recurring_relationship_ritual",
    eventDate,
    recurrence: { frequency: "annual", sourceText: /每年|annual/iu.test(text) ? "每年" : "relationship_ritual" },
    ritualAction,
    exact: normalizeTriggerKeys([dateKey, ritualAction]),
    aliases: ["我们的仪式", "固定仪式", "年度仪式", "小仪式", "老规矩"],
    secondary: normalizeTriggerKeys(["关系仪式", "重要日子", "每年", "年度", ritualAction]),
    semantic: ["relationship ritual", "recurring ritual", "annual ritual", "important day", relationshipRitualSemanticLabel(ritualKind)],
    relationship: [
      "user_and_greyfield",
      "relationship_event",
      "relationship_ritual",
      "recurring_relationship_ritual",
      "annual_ritual",
      "important_day",
      ritualKind
    ],
    metadata: {
      eventType: "recurring_relationship_ritual",
      ritualAction,
      ritualKind
    }
  };
}

function hasCompanionRelationshipTarget(text: string): boolean {
  if (/(greyfield|小灰|你和我|我和你|和你|给你|送你|我们之间|user\s+and\s+greyfield)/iu.test(text)) {
    return true;
  }
  return (
    /我们(?!公司|团队|项目|会议|同事|客户).{0,18}(第一次|初遇|相遇|纪念|仪式|传统|每年|日子|约定)/u.test(text) ||
    /(第一次|初遇|相遇|纪念|仪式|传统|每年|日子|约定).{0,18}我们/u.test(text)
  );
}

function hasRecurringRelationshipRitualSignal(text: string): boolean {
  return (
    /(每年|年度|固定|传统|惯例|仪式|老规矩|annually|annual|recurring|tradition|ritual)/iu.test(text) &&
    /(仪式|传统|惯例|老规矩|一起|给你|送你|陪你|和你|我们|greyfield|小灰|ritual|tradition)/iu.test(text)
  );
}

function extractRelationshipRitualAction(text: string): string | undefined {
  if (/(玫瑰|rose)/iu.test(text)) {
    return "送玫瑰";
  }
  if (/桂花茶/u.test(text)) {
    return "一起泡桂花茶";
  }
  if (/(热可可|hot cocoa)/iu.test(text)) {
    return "一起喝热可可";
  }
  if (/(泡茶|喝茶|茶)/u.test(text)) {
    return "一起泡茶";
  }
  if (/(手写信|写信|一封信|letter)/iu.test(text)) {
    return "写手写信";
  }
  if (/(蛋糕|cake)/iu.test(text)) {
    return "准备蛋糕";
  }
  if (/(散步|walk)/iu.test(text)) {
    return "一起散步";
  }
  if (/(看电影|电影|movie)/iu.test(text)) {
    return "一起看电影";
  }
  if (/(送礼|礼物|gift|present)/iu.test(text)) {
    return "送礼物";
  }
  const explicit = text.match(/(?:仪式|传统|惯例|老规矩)\s*(?:是|就是|：|:)\s*([^。！？!?，,]{2,32})/u);
  return explicit ? normalizeText(explicit[1]) : undefined;
}

function classifyRelationshipRitualAction(action: string): string {
  if (/(玫瑰|rose|鲜花|花束)/iu.test(action)) {
    return "rose_ritual";
  }
  if (/(茶|tea)/iu.test(action)) {
    return "tea_ritual";
  }
  if (/(可可|cocoa)/iu.test(action)) {
    return "hot_cocoa_ritual";
  }
  if (/(信|letter)/iu.test(action)) {
    return "letter_ritual";
  }
  if (/(蛋糕|cake)/iu.test(action)) {
    return "cake_ritual";
  }
  if (/(散步|walk)/iu.test(action)) {
    return "walk_ritual";
  }
  if (/(电影|movie)/iu.test(action)) {
    return "movie_ritual";
  }
  if (/(礼物|gift|present)/iu.test(action)) {
    return "gift_ritual";
  }
  return "custom_ritual";
}

function relationshipRitualSemanticLabel(ritualKind: string): string {
  return ritualKind.replace(/_/gu, " ");
}

type PromiseSubject = "user" | "greyfield";

interface PromiseAttributes {
  subject: PromiseSubject;
  object: string;
  action: string;
  actionText: string;
  exact: string[];
  secondary: string[];
  semantic: string[];
}

function extractPromiseAtom(
  text: string
): Omit<MemoryAtom, "id" | "createdAt" | "threadId" | "sourceTurnIds" | "triggerKeys"> | undefined {
  if (!hasPromiseSignal(text) || isPromiseSeparationWarning(text)) {
    return;
  }
  if (hasExternalPromiseTarget(text) && !hasGreyfieldPromiseTarget(text)) {
    return;
  }
  const attributes = extractPromiseAttributes(text);
  if (!attributes) {
    return;
  }

  return {
    type: "promise",
    text: formatPromiseMemoryText(attributes),
    importance: 0.86,
    subject: attributes.subject,
    object: attributes.object,
    triggers: {
      exact: attributes.exact,
      aliases: [
        "承诺",
        "答应过的事",
        "之前答应的事",
        "说好的事",
        "promise",
        "commitment"
      ],
      secondary: attributes.secondary,
      semantic: [
        "promise memory",
        "commitment recall",
        attributes.subject === "greyfield" ? "greyfield commitment" : "user commitment",
        ...attributes.semantic
      ],
      relationship: ["user_and_greyfield", "promise", `${attributes.subject}_commitment`]
    },
    metadata: {
      promiseType: "commitment",
      promiseSubject: attributes.subject,
      promiseAction: attributes.action,
      actionText: attributes.actionText,
      promiseObject: attributes.object,
      beneficiary: attributes.subject === "greyfield" ? "user" : "greyfield"
    }
  };
}

function hasPromiseSignal(text: string): boolean {
  return /(承诺|答应|保证|说好|约定|promise|promised|commitment|said\s+you\s+would|said\s+i\s+would)/iu.test(text);
}

function shouldRejectPromiseMemoryText(text: string): boolean {
  return hasPromiseSignal(text) && (isPromiseSeparationWarning(text) || (hasExternalPromiseTarget(text) && !hasGreyfieldPromiseTarget(text)));
}

function isPromiseSeparationWarning(text: string): boolean {
  return hasExternalPromiseTarget(text) && /(不要|别|不能).{0,24}(混|混在一起|混淆|记错|当成)/u.test(text);
}

function hasExternalPromiseTarget(text: string): boolean {
  return /(项目|工作|公司|客户|团队|同事|会议|工单|仓库|代码|需求|路线图|\bpr\b|pull request|issue|repo|repository|project|work|client|customer|company|team|coworker|meeting|roadmap)/iu.test(text);
}

function hasGreyfieldPromiseTarget(text: string): boolean {
  return /(greyfield|小灰|你答应|你承诺|你保证|你说好|帮我|陪我|提醒我|发给你|给你|和你|和我|我们之间|我们的承诺|user\s+and\s+greyfield)/iu.test(
    text
  );
}

function extractPromiseAttributes(text: string): PromiseAttributes | undefined {
  const subject = extractPromiseSubject(text);
  if (!subject) {
    return;
  }
  if (/整理书桌|收拾书桌|清理书桌|整理桌面|收拾桌面|organize (?:my )?desk|clean (?:my )?desk/iu.test(text)) {
    return {
      subject,
      object: "desk_cleanup",
      action: "organize_desk",
      actionText: "整理书桌",
      exact: ["整理书桌", "收拾书桌", "桌面整理"],
      secondary: ["书桌", "桌面", "整理", "收拾", "帮我整理"],
      semantic: ["help commitment", "organization promise", "desk organization promise", "personal care promise"]
    };
  }
  if (/读书笔记|阅读笔记|reading notes?/iu.test(text)) {
    return {
      subject,
      object: "reading_notes",
      action: subject === "user" ? "send_reading_notes" : "ask_reading_notes",
      actionText: "读书笔记",
      exact: ["读书笔记", "阅读笔记"],
      secondary: ["笔记", "阅读", "发给你"],
      semantic: ["reading notes promise", subject === "user" ? "user follow-through promise" : "help commitment"]
    };
  }
  if (/散步|走路|walk/iu.test(text) && /(提醒|陪|一起)/u.test(text)) {
    return {
      subject,
      object: "walk_reminder",
      action: "remind_walk",
      actionText: "提醒散步",
      exact: ["提醒散步", "散步"],
      secondary: ["走路", "出去走走", "陪我散步"],
      semantic: ["help commitment", "walk reminder promise", "personal care promise"]
    };
  }
  if (!hasGreyfieldPromiseTarget(text)) {
    return;
  }
  return {
    subject,
    object: "personal_commitment",
    action: "follow_up",
    actionText: "承诺事项",
    exact: ["承诺事项"],
    secondary: extractFallbackTriggerKeys(text).filter((key) => !hasExternalPromiseTarget(key)),
    semantic: ["personal promise", "follow up promise"]
  };
}

function extractPromiseSubject(text: string): PromiseSubject | undefined {
  if (/(你|greyfield|小灰).{0,24}(答应|承诺|保证|说好)|(?:答应|承诺|保证|说好).{0,24}(帮我|陪我|提醒我)/iu.test(text)) {
    return "greyfield";
  }
  if (/(我|user).{0,24}(答应|承诺|保证|说好)|(?:我会|我要|我以后|i\s+promise|i\s+will|said\s+i\s+would)/iu.test(text)) {
    return "user";
  }
  if (/(帮我|陪我|提醒我)/u.test(text)) {
    return "greyfield";
  }
  return;
}

function formatPromiseMemoryText(attributes: PromiseAttributes): string {
  if (attributes.subject === "greyfield" && attributes.action === "organize_desk") {
    return "Promise: Greyfield committed to help the user organize their desk.";
  }
  if (attributes.subject === "user" && attributes.action === "send_reading_notes") {
    return "Promise: User committed to send reading notes to Greyfield.";
  }
  const subject = attributes.subject === "greyfield" ? "Greyfield" : "User";
  return `Promise: ${subject} committed to ${attributes.actionText}.`;
}

function extractGameOpinionAtom(
  text: string
): Omit<MemoryAtom, "id" | "createdAt" | "threadId" | "sourceTurnIds" | "triggerKeys"> | undefined {
  const title = extractQuotedTitle(text);
  const reasons = ["付费", "剧情", "节奏", "抽卡"].filter((reason) => text.includes(reason));
  const hasNegativeOpinion = /(讨厌|不喜欢|差评|傻逼|垃圾|不要再)/u.test(text);
  if (!hasNegativeOpinion || (!/游戏/u.test(text) && !title)) {
    return;
  }
  const target = title ?? "这个游戏";
  return {
    type: "opinion",
    text:
      reasons.length > 0
        ? `User has a negative opinion of ${target}, especially ${reasons.join("、")}.`
        : `User has a negative opinion of ${target}.`,
    importance: 0.82,
    subject: "user",
    object: target,
    sentiment: "negative",
    triggers: {
      exact: title ? [title, `《${title}》`] : ["这个游戏"],
      aliases: title
        ? [`${title}游戏`, "那个游戏", "某个游戏", "之前那个游戏", "旧游戏"]
        : ["那个游戏", "某个游戏", "之前那个游戏", "旧游戏"],
      secondary: normalizeTriggerKeys([
        ...reasons,
        "游戏差评",
        "差评",
        "吐槽",
        "傻逼",
        "垃圾",
        "像之前",
        "好像之前",
        "以前那个",
        "不要推荐",
        "游戏付费",
        "游戏剧情"
      ]),
      semantic: ["negative game opinion", "negative game analogy", "game complaint source", "disliked old game"]
    },
    metadata: {
      target,
      reasons,
      opinionType: "game_review"
    }
  };
}

type SceneWeather = "rain" | "snow" | "wind" | "heat";
type ScenePlace = "virtual_home" | "home" | "window";
type SceneWindowState = "open" | "closed";
type SceneActivity = "hotpot" | "tea" | "movie" | "lego" | "shared_meal";
type SceneAction = "close_window";
type SceneRelationshipMeaning = "shared_activity" | "quiet_companionship" | "care_ritual";
type SceneTimeOfDay = "morning" | "afternoon" | "evening" | "night";

interface SceneAttributes {
  weather?: SceneWeather;
  place?: ScenePlace;
  windowState?: SceneWindowState;
  activity?: SceneActivity;
  action?: SceneAction;
  relationshipMeaning?: SceneRelationshipMeaning;
  sharedExperience?: boolean;
  timeOfDay?: SceneTimeOfDay;
  longAbsence?: boolean;
  longAbsenceDays?: number;
}

function extractEpisodicSceneAtom(
  text: string,
  input: MemoryAtomExtractionInput
): Omit<MemoryAtom, "id" | "createdAt" | "threadId" | "sourceTurnIds" | "triggerKeys"> | undefined {
  if (!hasExplicitSaveIntent(text)) {
    return;
  }
  const attributes = extractSceneAttributes(text);
  if (countSceneSignals(attributes) < 2) {
    return;
  }
  if (countConcreteSceneSignals(attributes) < 1) {
    return;
  }
  const triggerParts = buildSceneTriggerParts(text, attributes);
  const eventDate = parseEventDate(text, input.now);
  const dateKey = eventDate ? formatEventDate(eventDate) : "";
  return {
    type: "episodic_scene",
    text: formatSceneMemoryText(attributes),
    importance: attributes.action || attributes.longAbsence ? 0.82 : 0.76,
    subject: "user_and_greyfield",
    object: buildSceneObject(attributes),
    eventDate,
    triggers: {
      exact: triggerParts.exact,
      aliases: triggerParts.aliases,
      secondary: triggerParts.secondary,
      ...(dateKey ? { calendar: [dateKey] } : {}),
      environment: triggerParts.environment,
      semantic: triggerParts.semantic,
      relationship: ["user_and_greyfield"]
    },
    metadata: buildSceneMetadata(attributes)
  };
}

function extractSceneAttributes(text: string): SceneAttributes {
  const weather = extractSceneWeather(text);
  const place = /虚拟家|虚拟的家|房间/u.test(text) ? "virtual_home" : /家里|家中|在家/u.test(text) ? "home" : /窗边|窗户|窗/u.test(text) ? "window" : undefined;
  const windowState = /窗户开着|开着窗|窗开着|window\s*=\s*open/iu.test(text)
    ? "open"
    : /窗户关着|关着窗|窗关着|window\s*=\s*closed/iu.test(text)
      ? "closed"
      : undefined;
  const activity = extractSceneActivity(text);
  const action = /关窗|关上窗|把窗户关/u.test(text) ? "close_window" : undefined;
  const longAbsence = /长期没上线|很久没上线|好久没来|很久不在|long absence/iu.test(text);
  const relationshipMeaning = extractSceneRelationshipMeaning(text, action, longAbsence);
  const sharedExperience = hasSharedSceneSignal(text);
  return {
    weather,
    place,
    windowState,
    activity,
    action,
    relationshipMeaning,
    sharedExperience,
    timeOfDay: extractSceneTimeOfDay(text),
    longAbsence,
    longAbsenceDays: longAbsence ? 30 : undefined
  };
}

function extractSceneWeather(text: string): SceneWeather | undefined {
  if (/(下雨|雨天|雨|raining|rainy)/iu.test(text)) {
    return "rain";
  }
  if (/(下雪|雪天|雪|snowing|snowy)/iu.test(text)) {
    return "snow";
  }
  if (/(大风|刮风|风很大|windy)/iu.test(text)) {
    return "wind";
  }
  if (/(很热|热天|高温|hot weather)/iu.test(text)) {
    return "heat";
  }
  return;
}

function extractSceneActivity(text: string): SceneActivity | undefined {
  if (/火锅/u.test(text)) {
    return "hotpot";
  }
  if (/(泡茶|喝茶|茶)/u.test(text)) {
    return "tea";
  }
  if (/(看电影|电影)/u.test(text)) {
    return "movie";
  }
  if (/(拼乐高|乐高|积木)/u.test(text)) {
    return "lego";
  }
  if (/(吃饭|晚饭|一起吃)/u.test(text)) {
    return "shared_meal";
  }
  return;
}

function extractSceneRelationshipMeaning(
  text: string,
  action?: SceneAction,
  longAbsence?: boolean
): SceneRelationshipMeaning | undefined {
  if (action || longAbsence || /(提醒|照顾|别让我忘)/u.test(text)) {
    return "care_ritual";
  }
  if (/(陪伴|安心|安静|舒服|一起待着)/u.test(text)) {
    return "quiet_companionship";
  }
  if (/(我们|一起|共同)/u.test(text)) {
    return "shared_activity";
  }
  return;
}

function extractSceneTimeOfDay(text: string): SceneTimeOfDay | undefined {
  if (/早上|清晨|上午/u.test(text)) {
    return "morning";
  }
  if (/下午/u.test(text)) {
    return "afternoon";
  }
  if (/傍晚|晚上|晚饭/u.test(text)) {
    return "evening";
  }
  if (/深夜|夜里|半夜/u.test(text)) {
    return "night";
  }
  return;
}

function countSceneSignals(attributes: SceneAttributes): number {
  return [
    attributes.weather,
    attributes.place,
    attributes.windowState,
    attributes.activity,
    attributes.action,
    attributes.relationshipMeaning,
    attributes.sharedExperience ? "shared_experience" : undefined,
    attributes.timeOfDay,
    attributes.longAbsence ? "long_absence" : undefined
  ].filter(Boolean).length;
}

function countConcreteSceneSignals(attributes: SceneAttributes): number {
  return [
    attributes.weather,
    attributes.place,
    attributes.windowState,
    attributes.activity,
    attributes.action,
    attributes.timeOfDay,
    attributes.longAbsence ? "long_absence" : undefined
  ].filter(Boolean).length;
}

function buildSceneTriggerParts(
  text: string,
  attributes: SceneAttributes
): {
  exact: string[];
  aliases: string[];
  secondary: string[];
  environment: string[];
  semantic: string[];
} {
  const exact = [
    ...sceneActivityTriggerKeys(attributes.activity),
    ...(attributes.weather === "rain" && attributes.activity === "hotpot" ? ["下雨天吃火锅"] : []),
    ...(attributes.windowState === "open" ? ["虚拟家的窗户开着"] : []),
    ...(attributes.longAbsence ? ["长期没上线"] : []),
    ...(attributes.action === "close_window" ? ["关窗"] : [])
  ];
  const aliases = [
    ...sceneWeatherAliasKeys(attributes.weather),
    ...(attributes.timeOfDay ? [sceneTimeLabel(attributes.timeOfDay)] : []),
    ...(attributes.place === "virtual_home" ? ["虚拟家"] : []),
    ...(attributes.relationshipMeaning ? [sceneRelationshipLabel(attributes.relationshipMeaning)] : [])
  ];
  const secondary = [
    ...(attributes.activity === "hotpot" ? ["一起吃饭", "热乎乎"] : []),
    ...(attributes.activity === "tea" ? ["一起喝茶", "安静陪伴"] : []),
    ...(attributes.activity === "lego" ? ["一起拼乐高", "窗边陪伴"] : []),
    ...(attributes.action === "close_window" ? ["提醒关窗"] : []),
    ...(attributes.longAbsence ? ["长期未上线", "久别提醒"] : []),
    ...(attributes.windowState === "open" ? ["窗户开着"] : [])
  ];
  const environment = [
    ...sceneWeatherEnvironmentKeys(attributes.weather),
    ...(attributes.place === "virtual_home" ? ["virtual_home", "虚拟家"] : []),
    ...(attributes.windowState === "open" ? ["virtual_home.window=open", "窗户开着", "虚拟家的窗户开着"] : []),
    ...(attributes.windowState === "closed" ? ["virtual_home.window=closed", "窗户关着"] : []),
    ...(attributes.longAbsence ? ["last_seen_days>=30", "长期没上线"] : []),
    ...(attributes.timeOfDay ? [attributes.timeOfDay] : [])
  ];
  const semantic = [
    ...(attributes.weather && attributes.activity ? [`${attributes.weather} ${attributes.activity} memory`] : []),
    ...(attributes.relationshipMeaning ? [attributes.relationshipMeaning.replace(/_/g, " ")] : []),
    ...(attributes.action === "close_window" ? ["low disturbance care reminder"] : []),
    ...(attributes.sharedExperience ? ["shared scene memory"] : [])
  ];
  return { exact, aliases, secondary, environment, semantic };
}

function sceneWeatherAliasKeys(weather: SceneWeather | undefined): string[] {
  if (weather === "rain") {
    return ["雨天", "下雨天", "那个下雨的晚上"];
  }
  if (weather === "snow") {
    return ["雪天", "下雪天", "那个下雪的下午"];
  }
  if (weather === "wind") {
    return ["大风天", "刮风的时候"];
  }
  if (weather === "heat") {
    return ["很热的时候", "高温天"];
  }
  return [];
}

function sceneWeatherEnvironmentKeys(weather: SceneWeather | undefined): string[] {
  if (weather === "rain") {
    return ["rain", "raining", "下雨", "雨天"];
  }
  if (weather === "snow") {
    return ["snow", "snowing", "下雪", "雪天"];
  }
  if (weather === "wind") {
    return ["wind", "windy", "大风", "刮风"];
  }
  if (weather === "heat") {
    return ["heat", "hot", "高温", "很热"];
  }
  return [];
}

function sceneActivityTriggerKeys(activity: SceneActivity | undefined): string[] {
  if (activity === "hotpot") {
    return ["火锅"];
  }
  if (activity === "tea") {
    return ["泡茶", "喝茶"];
  }
  if (activity === "movie") {
    return ["看电影", "电影"];
  }
  if (activity === "lego") {
    return ["拼乐高", "乐高"];
  }
  if (activity === "shared_meal") {
    return ["一起吃饭"];
  }
  return [];
}

function formatSceneMemoryText(attributes: SceneAttributes): string {
  const descriptors = [
    attributes.weather ? `${sceneWeatherEnglishAdjective(attributes.weather)}` : "",
    attributes.place === "virtual_home" ? "virtual-home" : attributes.place === "home" ? "home" : "",
    attributes.timeOfDay ?? "",
    "scene"
  ].filter(Boolean);
  const details = [
    attributes.windowState === "open" ? "with an open window" : "",
    attributes.longAbsence ? "after a long absence" : "",
    attributes.action === "close_window" ? "where the user wanted Greyfield to remind them to 关窗" : "",
    attributes.activity
      ? attributes.sharedExperience
        ? `and share ${sceneActivityEnglishLabel(attributes.activity)} together`
        : `with ${sceneActivityEnglishLabel(attributes.activity)}`
      : "",
    attributes.relationshipMeaning ? `as ${sceneRelationshipEnglishLabel(attributes.relationshipMeaning)}` : ""
  ].filter(Boolean);
  return `Episodic scene: a ${descriptors.join(" ")} ${details.join(" ")}.`;
}

function buildSceneObject(attributes: SceneAttributes): string {
  if (attributes.weather === "rain" && attributes.activity === "hotpot") {
    return "rainy_hotpot_scene";
  }
  return [
    attributes.weather,
    attributes.place,
    attributes.activity,
    attributes.action ? "care" : undefined,
    "scene"
  ]
    .filter(Boolean)
    .join("_");
}

function buildSceneMetadata(attributes: SceneAttributes): Record<string, string | number | boolean | null> {
  return {
    sceneType: attributes.activity === "hotpot" || attributes.activity === "shared_meal" ? "shared_meal" : "episodic_scene",
    ...(attributes.weather ? { weather: attributes.weather } : {}),
    ...(attributes.place ? { place: attributes.place } : {}),
    ...(attributes.windowState ? { windowState: attributes.windowState } : {}),
    ...(attributes.activity ? { activity: attributes.activity } : {}),
    ...(attributes.action ? { action: attributes.action, actionText: sceneActionText(attributes.action) } : {}),
    ...(attributes.relationshipMeaning ? { relationshipMeaning: attributes.relationshipMeaning } : {}),
    ...(attributes.sharedExperience !== undefined ? { sharedExperience: attributes.sharedExperience } : {}),
    ...(attributes.timeOfDay ? { timeOfDay: attributes.timeOfDay } : {}),
    ...(attributes.longAbsence ? { longAbsence: true, longAbsenceDays: attributes.longAbsenceDays ?? 30 } : {})
  };
}

function hasSharedSceneSignal(text: string): boolean {
  return /(我们|一起|共同|陪伴|和你|和我|shared|together)/iu.test(text);
}

function sceneWeatherEnglishAdjective(weather: SceneWeather): string {
  return weather === "rain" ? "rainy" : weather === "snow" ? "snowy" : weather === "wind" ? "windy" : "hot-weather";
}

function sceneActivityEnglishLabel(activity: SceneActivity): string {
  if (activity === "hotpot") {
    return "hotpot";
  }
  if (activity === "tea") {
    return "tea";
  }
  if (activity === "movie") {
    return "a movie";
  }
  if (activity === "lego") {
    return "lego";
  }
  return "a meal";
}

function sceneActionText(action: SceneAction): string {
  return action === "close_window" ? "关窗" : action;
}

function sceneRelationshipLabel(meaning: SceneRelationshipMeaning): string {
  if (meaning === "care_ritual") {
    return "照顾提醒";
  }
  if (meaning === "quiet_companionship") {
    return "安静陪伴";
  }
  return "共同经历";
}

function sceneRelationshipEnglishLabel(meaning: SceneRelationshipMeaning): string {
  if (meaning === "care_ritual") {
    return "a care ritual";
  }
  if (meaning === "quiet_companionship") {
    return "quiet companionship";
  }
  return "a shared activity";
}

function sceneTimeLabel(timeOfDay: SceneTimeOfDay): string {
  return timeOfDay === "morning" ? "早上" : timeOfDay === "afternoon" ? "下午" : timeOfDay === "evening" ? "晚上" : "夜里";
}

function hasExplicitSaveIntent(text: string): boolean {
  return /(记住|记得|别忘|以后|每年|不要再)/u.test(text);
}

function stripExplicitSavePrefix(text: string): string {
  return normalizeText(text.replace(/^(请)?\s*(记住|记得|别忘了?|以后)\s*/u, ""));
}

function extractFallbackTriggerKeys(text: string): string[] {
  return normalizeTriggerKeys(text.match(/[\p{L}\p{N}_-]{2,}/gu) ?? []).slice(0, 6);
}

function parseEventDate(text: string, now?: string | Date): MemoryAtomEventDate | undefined {
  const iso = text.match(/\b(\d{4})-(\d{1,2})-(\d{1,2})\b/u);
  if (iso) {
    const year = Number(iso[1]);
    const month = Number(iso[2]);
    const day = Number(iso[3]);
    const isoDate = toIsoDateFromParts(year, month, day);
    if (isoDate) {
      return {
        kind: "absolute",
        sourceText: iso[0],
        precision: "day",
        isoDate
      };
    }
  }
  const chineseFullDate = text.match(/(\d{4})\s*年\s*(\d{1,2})\s*月\s*(\d{1,2})\s*(?:日|号)?/u);
  if (chineseFullDate) {
    const year = Number(chineseFullDate[1]);
    const month = Number(chineseFullDate[2]);
    const day = Number(chineseFullDate[3]);
    const isoDate = toIsoDateFromParts(year, month, day);
    if (isoDate) {
      return {
        kind: "absolute",
        sourceText: chineseFullDate[0],
        precision: "day",
        isoDate
      };
    }
  }
  const monthDay = text.match(/(\d{1,2})\s*月\s*(\d{1,2})\s*(?:日|号)?/u);
  if (monthDay) {
    const month = Number(monthDay[1]);
    const day = Number(monthDay[2]);
    if (isValidMonthDay(month, day)) {
      return {
        kind: "month_day",
        sourceText: monthDay[0],
        precision: "month_day",
        month,
        day
      };
    }
  }
  const relativeDate = parseRelativeDateReference(text, now ?? new Date());
  if (relativeDate) {
    return {
      kind: "absolute",
      sourceText: relativeDate.sourceText,
      precision: "day",
      isoDate: relativeDate.isoDate
    };
  }
  return;
}

function extractQuotedTitle(text: string): string | undefined {
  const match = text.match(/《([^》]+)》/u);
  return match?.[1]?.trim();
}

function matchCalendarLane(
  input: string,
  atom: MemoryAtom,
  options: BuildMemoryAtomRecallContextOptions
): MemoryAtomRecallMatch[] {
  if (!atom.eventDate) {
    return [];
  }
  const query = parseCalendarQuery(input, options.now ?? new Date());
  if (!query.hasCalendarIntent) {
    return [];
  }
  const windowDays = Math.max(0, options.calendarWindowDays ?? defaultCalendarWindowDays);
  const occurrences = buildCalendarOccurrences(atom, query.referenceYear);
  const matches: MemoryAtomRecallMatch[] = [];
  for (const target of query.targetDates) {
    for (const occurrence of occurrences) {
      const diff = Math.abs(daysBetweenIsoDates(target.isoDate, occurrence.isoDate));
      if (diff > windowDays) {
        continue;
      }
      const eventLabel = formatEventDate(atom.eventDate);
      const key = diff === 0 ? `${target.sourceText}->${eventLabel}` : `near:${target.sourceText}->${eventLabel}`;
      matches.push({
        lane: "calendar",
        key,
        score: calendarLaneScore + (diff === 0 ? 12 : Math.max(1, 8 - diff)) + (occurrence.recurring ? 3 : 0)
      });
    }
  }
  return matches;
}

function matchSemanticLane(input: string, atom: MemoryAtom): MemoryAtomRecallMatch[] {
  const atomConcepts = new Set((atom.triggers.semantic ?? []).map(normalizeSemanticConcept).filter(Boolean));
  if (atomConcepts.size === 0) {
    return [];
  }
  const queryConcepts = extractSemanticRecallConcepts(input);
  return [...queryConcepts]
    .filter((concept) => atomConcepts.has(concept))
    .map((concept) => ({ lane: "semantic", key: concept, score: semanticLaneScore + Math.min(8, concept.length / 3) }));
}

function matchRelationshipLane(input: string, atom: MemoryAtom): MemoryAtomRecallMatch[] {
  if (!isCompanionRelationshipAtom(atom)) {
    return [];
  }
  const atomConcepts = extractRelationshipAtomConcepts(atom);
  if (atomConcepts.size === 0) {
    return [];
  }
  const query = extractRelationshipRecallConcepts(input);
  if (!query.hasIntent) {
    return [];
  }
  const matched = [...query.concepts].filter((concept) => atomConcepts.has(concept));
  const hasSpecificMatch = matched.some((concept) => concept !== "user_and_greyfield" && concept !== "relationship_event");
  if (!hasSpecificMatch) {
    return [];
  }
  return matched.map((concept) => ({ lane: "relationship", key: concept, score: relationshipLaneScore + Math.min(10, concept.length / 2) }));
}

function extractRelationshipRecallConcepts(input: string): { hasIntent: boolean; concepts: Set<string> } {
  const concepts = new Set<string>();
  const text = normalizeText(input).toLowerCase();
  if (hasExternalRelationshipTarget(text)) {
    return { hasIntent: false, concepts };
  }

  const hasVagueMemoryReference =
    /(那个|那件|那次|那天|当时|之前|以前|旧|记得|想起|回忆|重要日子|什么日子|固定|传统|老规矩|每年|年度|remember|recall|before|old|important day|special day|tradition|annual|recurring)/iu.test(text);
  const hasRelationshipSignal =
    /(我们|你和我|共同|关系|初遇|相遇|第一次|纪念|纪念日|周年|仪式|礼物仪式|传统|老规矩|anniversary|ritual|tradition|greyfield)/iu.test(text);
  if (!hasVagueMemoryReference || !hasRelationshipSignal) {
    return { hasIntent: false, concepts };
  }

  if (/(重要日子|什么日子|那个日子|那天|纪念|纪念日|anniversary|important day|special day)/iu.test(text)) {
    concepts.add("relationship_event");
    concepts.add("important_day");
    concepts.add("anniversary");
  }
  if (/(第一次|初遇|相遇|first meeting|first met)/iu.test(text)) {
    concepts.add("first_meeting_anniversary");
  }
  if (/(礼物|送礼|送|仪式|gift|ritual)/iu.test(text)) {
    concepts.add("relationship_ritual");
    concepts.add("gift_ritual");
  }
  if (/(每年|年度|固定|传统|老规矩|annual|annually|recurring|tradition)/iu.test(text)) {
    concepts.add("relationship_ritual");
    concepts.add("recurring_relationship_ritual");
    concepts.add("annual_ritual");
  }
  if (/(玫瑰|花|rose|flower)/iu.test(text)) {
    concepts.add("gift_ritual");
    concepts.add("rose_ritual");
  }
  if (/(我们|你和我|共同|greyfield|你)/iu.test(text)) {
    concepts.add("user_and_greyfield");
  }

  return { hasIntent: concepts.size > 0, concepts };
}

function extractRelationshipAtomConcepts(atom: MemoryAtom): Set<string> {
  const concepts = new Set<string>();
  const add = (value: string | undefined) => {
    if (!value) {
      return;
    }
    const concept = normalizeSemanticConcept(value.replace(/\s+/g, "_"));
    if (concept.length > 0) {
      concepts.add(concept);
    }
  };

  for (const key of atom.triggers.relationship ?? []) {
    add(key);
  }
  if (atom.type === "relationship_event") {
    add("relationship_event");
  }
  if (atom.subject === "user_and_greyfield") {
    add("user_and_greyfield");
  }
  if (atom.eventDate) {
    add("important_day");
  }
  if (atom.recurrence?.frequency === "annual") {
    add("annual_ritual");
    add("recurring_relationship_ritual");
    add("relationship_ritual");
  }
  add(atom.object);

  const eventType = metadataString(atom.metadata, "eventType");
  if (eventType === "first_meeting_anniversary" || atom.object === "first_meeting_anniversary") {
    add("first_meeting_anniversary");
    add("anniversary");
    add("important_day");
  }
  if (eventType === "recurring_relationship_ritual" || atom.object === "recurring_relationship_ritual") {
    add("recurring_relationship_ritual");
    add("annual_ritual");
    add("relationship_ritual");
    add("important_day");
  }
  if (eventType) {
    add(eventType);
  }
  add(metadataString(atom.metadata, "ritualKind"));

  const ritualAction = normalizeText(atom.ritualAction ?? "");
  if (ritualAction.length > 0) {
    add("relationship_ritual");
  }
  if (/(礼物|送|gift)/iu.test(ritualAction)) {
    add("gift_ritual");
  }
  if (/(玫瑰|rose|鲜花|花束)/iu.test(ritualAction)) {
    add("gift_ritual");
    add("rose_ritual");
  }

  const gift = metadataString(atom.metadata, "gift");
  if (gift && gift !== "null") {
    add("gift_ritual");
    if (/(rose|玫瑰|花)/iu.test(gift)) {
      add("rose_ritual");
    }
  }

  return concepts;
}

function isCompanionRelationshipAtom(atom: MemoryAtom): boolean {
  return atom.subject === "user_and_greyfield" || (atom.triggers.relationship ?? []).some((key) => normalizeSemanticConcept(key) === "user_and_greyfield");
}

function shouldSuppressCompanionRelationshipRecall(input: string, atom: MemoryAtom): boolean {
  if (!isCompanionRelationshipAtom(atom)) {
    return false;
  }
  if (hasExternalRelationshipTarget(input)) {
    return true;
  }
  if (!isGenericHolidayOrGiftPlanningQuery(input)) {
    return false;
  }
  if (extractRelationshipRecallConcepts(input).hasIntent) {
    return false;
  }
  return true;
}

function shouldSuppressPromiseRecall(input: string, atom: MemoryAtom): boolean {
  if (atom.type !== "promise") {
    return false;
  }
  return hasExternalPromiseTarget(input) && !hasGreyfieldPromiseTarget(input);
}

function hasExternalRelationshipTarget(text: string): boolean {
  return /(同事|客户|公司|团队|项目|会议|婚礼|朋友|别人的|colleague|client|company|meeting|wedding|friend)/iu.test(text);
}

function isGenericHolidayOrGiftPlanningQuery(input: string): boolean {
  const text = normalizeText(input);
  const hasHolidayOrGift =
    /(礼物|礼品|送礼|节日|假日|春节|中秋|端午|圣诞|七夕|情人节|holiday|gift|present)/iu.test(text);
  const hasPlanningCue = /(怎么|如何|安排|计划|清单|推荐|建议|准备|买|选|idea|plan|shopping|recommend)/iu.test(text);
  return hasHolidayOrGift && hasPlanningCue;
}

function metadataString(metadata: MemoryAtom["metadata"], key: string): string | undefined {
  const value = metadata?.[key];
  return typeof value === "string" ? normalizeText(value) : undefined;
}

function extractSemanticRecallConcepts(input: string): Set<string> {
  const concepts = new Set<string>();
  const text = input.toLowerCase();
  const asksAboutGame = /游戏|game/u.test(text);
  const negativeCue = /(傻逼|垃圾|差评|吐槽|讨厌|不喜欢|烂|坏|烦|难受|dislike|complaint|bad|awful)/iu.test(text);
  const analogyCue = /(之前|以前|旧|某个|那个|好像|像|记得|想起|回忆|为什么|原因|source|why|before|old)/iu.test(text);
  if (asksAboutGame && negativeCue && analogyCue) {
    concepts.add("negative game analogy");
    concepts.add("game complaint source");
    concepts.add("disliked old game");
  }
  const relationshipQuery = extractRelationshipRecallConcepts(input);
  if (relationshipQuery.hasIntent) {
    for (const concept of relationshipQuery.concepts) {
      const semanticConcept = relationshipConceptToSemanticConcept(concept);
      if (semanticConcept) {
        concepts.add(semanticConcept);
      }
    }
  }
  const promiseQuery = extractPromiseRecallConcepts(input);
  if (promiseQuery.hasIntent) {
    for (const concept of promiseQuery.concepts) {
      concepts.add(concept);
    }
  }
  return concepts;
}

function extractPromiseRecallConcepts(input: string): { hasIntent: boolean; concepts: Set<string> } {
  const concepts = new Set<string>();
  const text = normalizeText(input).toLowerCase();
  if (hasExternalPromiseTarget(text) && !hasGreyfieldPromiseTarget(text)) {
    return { hasIntent: false, concepts };
  }

  const hasPromiseCue = /(承诺|答应|保证|说好|约定|promise|promised|commitment|said\s+you\s+would|said\s+i\s+would)/iu.test(text);
  const hasVagueRecallCue = /(之前|上次|以前|那个|那件|说过|记得|想起|回忆|what|which|remember|recall|before)/iu.test(text);
  const hasActionCue = /(帮我|提醒我|陪我|整理|收拾|书桌|桌面|读书笔记|阅读笔记|散步|organize|desk|reading notes?|walk)/iu.test(text);
  if (!hasPromiseCue && !(hasVagueRecallCue && hasActionCue)) {
    return { hasIntent: false, concepts };
  }

  concepts.add("promise memory");
  concepts.add("commitment recall");
  if (/(你|greyfield|小灰|帮我|提醒我|陪我|said\s+you\s+would)/iu.test(text)) {
    concepts.add("greyfield commitment");
  }
  if (/(我|发给你|给你|said\s+i\s+would|i\s+promise)/iu.test(text)) {
    concepts.add("user commitment");
  }
  if (/(帮我|提醒我|陪我|help|remind|accompany)/iu.test(text)) {
    concepts.add("help commitment");
  }
  if (/(整理|收拾|organize|clean)/iu.test(text)) {
    concepts.add("organization promise");
  }
  if (/(书桌|桌面|desk)/iu.test(text)) {
    concepts.add("desk organization promise");
  }
  if (/(读书笔记|阅读笔记|reading notes?)/iu.test(text)) {
    concepts.add("reading notes promise");
  }
  if (/(散步|走路|walk)/iu.test(text)) {
    concepts.add("walk reminder promise");
  }
  return { hasIntent: concepts.size > 0, concepts };
}

function normalizeSemanticConcept(value: string): string {
  return value.trim().replace(/\s+/g, " ").toLowerCase();
}

function relationshipConceptToSemanticConcept(concept: string): string | undefined {
  switch (concept) {
    case "important_day":
      return "important day";
    case "first_meeting_anniversary":
    case "anniversary":
      return "relationship milestone";
    case "relationship_ritual":
      return "anniversary ritual";
    case "recurring_relationship_ritual":
      return "recurring ritual";
    case "annual_ritual":
      return "annual ritual";
    case "gift_ritual":
      return "gift ritual";
    case "rose_ritual":
      return "rose ritual";
    case "tea_ritual":
      return "tea ritual";
    case "hot_cocoa_ritual":
      return "hot cocoa ritual";
    case "letter_ritual":
      return "letter ritual";
    case "cake_ritual":
      return "cake ritual";
    case "walk_ritual":
      return "walk ritual";
    case "movie_ritual":
      return "movie ritual";
    case "custom_ritual":
      return "custom ritual";
    default:
      return;
  }
}

interface CalendarQuery {
  hasCalendarIntent: boolean;
  referenceYear: number;
  targetDates: CalendarTargetDate[];
}

interface CalendarTargetDate {
  isoDate: string;
  sourceText: string;
}

interface CalendarOccurrence {
  isoDate: string;
  recurring: boolean;
}

function parseCalendarQuery(input: string, now: string | Date): CalendarQuery {
  const referenceDate = toValidDate(now);
  const referenceYear = referenceDate.getUTCFullYear();
  const targets: CalendarTargetDate[] = [];
  const pushTarget = (target: CalendarTargetDate | undefined) => {
    if (!target || targets.some((existing) => existing.isoDate === target.isoDate)) {
      return;
    }
    targets.push(target);
  };

  for (const match of input.matchAll(/\b(\d{4})-(\d{1,2})-(\d{1,2})\b/gu)) {
    const isoDate = toIsoDateFromParts(Number(match[1]), Number(match[2]), Number(match[3]));
    pushTarget(isoDate ? { isoDate, sourceText: match[0] } : undefined);
  }

  for (const match of input.matchAll(/(\d{4})\s*年\s*(\d{1,2})\s*月\s*(\d{1,2})\s*(?:日|号)?/gu)) {
    const isoDate = toIsoDateFromParts(Number(match[1]), Number(match[2]), Number(match[3]));
    pushTarget(isoDate ? { isoDate, sourceText: match[0] } : undefined);
  }

  for (const match of input.matchAll(/(\d{1,2})\s*月\s*(\d{1,2})\s*(?:日|号)?/gu)) {
    const isoDate = toIsoDateFromParts(referenceYear, Number(match[1]), Number(match[2]));
    pushTarget(isoDate ? { isoDate, sourceText: match[0] } : undefined);
  }

  for (const relative of parseRelativeCalendarTargets(input, referenceDate)) {
    pushTarget(relative);
  }

  return {
    hasCalendarIntent: targets.length > 0 && hasCalendarRecallIntent(input),
    referenceYear,
    targetDates: targets
  };
}

function hasCalendarRecallIntent(input: string): boolean {
  if (/(天气|下雨|降雨|气温|温度|台风|空气质量|会不会下雨|冷不冷|热不热|开会|会议|日程|行程|航班|火车|课表|考试|排班|上班|放假)/u.test(input)) {
    return false;
  }
  return /(准备|纪念日|生日|初遇|相遇|第一次见面|第一次遇见|重要日子|什么日子|这些日子|这两个日子|这个日子|那天|当天|日期|提醒|庆祝|礼物|送|记得|记住|想起|回忆|要做什么|要不要做什么)/u.test(input);
}

function parseRelativeCalendarTargets(input: string, referenceDate: Date): CalendarTargetDate[] {
  const relativePatterns: Array<{ pattern: RegExp; sourceText: string; offsetDays: number }> = [
    { pattern: /今天|今日|today/iu, sourceText: "今天", offsetDays: 0 },
    { pattern: /明天|tomorrow/iu, sourceText: "明天", offsetDays: 1 },
    { pattern: /后天/u, sourceText: "后天", offsetDays: 2 },
    { pattern: /昨天|yesterday/iu, sourceText: "昨天", offsetDays: -1 }
  ];
  return relativePatterns.flatMap((relative) => {
    if (!relative.pattern.test(input)) {
      return [];
    }
    return [
      {
        isoDate: addDays(referenceDate, relative.offsetDays).toISOString().slice(0, 10),
        sourceText: relative.sourceText
      }
    ];
  });
}

function buildCalendarOccurrences(atom: MemoryAtom, referenceYear: number): CalendarOccurrence[] {
  const eventDate = atom.eventDate;
  if (!eventDate) {
    return [];
  }
  const monthDay = getEventMonthDay(eventDate);
  if (atom.recurrence?.frequency === "annual" && monthDay) {
    return [referenceYear - 1, referenceYear, referenceYear + 1].flatMap((year) => {
      const isoDate = toIsoDateFromParts(year, monthDay.month, monthDay.day);
      return isoDate ? [{ isoDate, recurring: true }] : [];
    });
  }
  if (eventDate.kind === "absolute" && eventDate.isoDate) {
    return [{ isoDate: eventDate.isoDate, recurring: false }];
  }
  if (eventDate.kind === "month_day" && monthDay) {
    return [referenceYear - 1, referenceYear, referenceYear + 1].flatMap((year) => {
      const isoDate = toIsoDateFromParts(year, monthDay.month, monthDay.day);
      return isoDate ? [{ isoDate, recurring: true }] : [];
    });
  }
  return [];
}

function getEventMonthDay(eventDate: MemoryAtomEventDate): { month: number; day: number } | undefined {
  if (eventDate.kind === "month_day" && eventDate.month !== undefined && eventDate.day !== undefined) {
    return { month: eventDate.month, day: eventDate.day };
  }
  if (eventDate.kind === "absolute" && eventDate.isoDate) {
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(eventDate.isoDate);
    if (match) {
      return { month: Number(match[2]), day: Number(match[3]) };
    }
  }
  return;
}

function attachSourcePassagesToRecallItem(
  item: MemoryAtomRecallContextItem,
  options: BuildMemoryAtomRecallContextOptions,
  availableCharacters: number,
  availableSourcePassageCharacters: number
): MemoryAtomRecallContextItem {
  if (
    options.sourcePassageMode === "never" ||
    !shouldIncludeSourcePassages(options.input, item, options.sourcePassageMode ?? "auto") ||
    options.sourceTurns === undefined
  ) {
    return item;
  }

  const baseLength = formatMemoryAtomRecallContextForPrompt({ items: [item], skipped: [] }).length;
  const sourceBudget = Math.min(
    options.sourcePassageMaxCharacters ?? defaultSourcePassageMaxCharacters,
    availableCharacters - baseLength,
    availableSourcePassageCharacters
  );
  if (sourceBudget <= 0) {
    return item;
  }

  const turnsById = new Map(options.sourceTurns.map((turn) => [turn.id, turn]));
  const maxTurns = options.sourcePassageMaxTurnsPerAtom ?? defaultSourcePassageMaxTurnsPerAtom;
  const maxPerTurn = options.sourcePassageMaxCharactersPerTurn ?? defaultSourcePassageMaxCharactersPerTurn;
  const passages: MemoryAtomSourcePassage[] = [];
  const missingSourceTurnIds: string[] = [];
  let usedTextCharacters = 0;

  for (const turnId of item.sourceTurnIds) {
    const turn = turnsById.get(turnId);
    if (!turn) {
      missingSourceTurnIds.push(turnId);
      continue;
    }
    if (turn.role !== "user" && turn.role !== "assistant") {
      continue;
    }
    if (passages.length >= maxTurns) {
      continue;
    }
    const remainingTextBudget = Math.min(maxPerTurn, sourceBudget - usedTextCharacters);
    if (remainingTextBudget <= 8) {
      continue;
    }
    const normalized = normalizeText(turn.content);
    const clipped = enforceCharacterLimit(truncateAtBoundary(normalized, remainingTextBudget), remainingTextBudget);
    usedTextCharacters += clipped.length;
    passages.push({
      turnId: turn.id,
      role: turn.role,
      text: clipped,
      omittedCharacters: Math.max(0, normalized.length - clipped.length)
    });
  }

  return fitSourcePassageContext(item, passages, missingSourceTurnIds, availableCharacters);
}

function enforceCharacterLimit(text: string, maxCharacters: number): string {
  return text.length <= maxCharacters ? text : text.slice(0, maxCharacters).trimEnd();
}

function countRequestedSourcePassages(
  item: MemoryAtomRecallContextItem,
  options: BuildMemoryAtomRecallContextOptions
): number {
  if (
    options.sourcePassageMode === "never" ||
    !shouldIncludeSourcePassages(options.input, item, options.sourcePassageMode ?? "auto") ||
    options.sourceTurns === undefined
  ) {
    return 0;
  }

  const turnsById = new Map(options.sourceTurns.map((turn) => [turn.id, turn]));
  const maxTurns = options.sourcePassageMaxTurnsPerAtom ?? defaultSourcePassageMaxTurnsPerAtom;
  let count = 0;
  for (const turnId of item.sourceTurnIds) {
    const turn = turnsById.get(turnId);
    if (!turn || (turn.role !== "user" && turn.role !== "assistant")) {
      continue;
    }
    count += 1;
    if (count >= maxTurns) {
      return count;
    }
  }
  return count;
}

function getSourcePassageStats(item: MemoryAtomRecallContextItem): { count: number; characters: number } {
  const passages = item.sourcePassages ?? [];
  return {
    count: passages.length,
    characters: passages.reduce((total, passage) => total + passage.text.length, 0)
  };
}

function fitSourcePassageContext(
  item: MemoryAtomRecallContextItem,
  passages: MemoryAtomSourcePassage[],
  missingSourceTurnIds: string[],
  availableCharacters: number
): MemoryAtomRecallContextItem {
  let fittedPassages = passages;
  let fittedMissing = missingSourceTurnIds;
  while (fittedPassages.length > 0 || fittedMissing.length > 0) {
    const candidate: MemoryAtomRecallContextItem = {
      ...item,
      ...(fittedPassages.length > 0 ? { sourcePassages: fittedPassages } : {}),
      ...(fittedMissing.length > 0 ? { missingSourceTurnIds: fittedMissing } : {})
    };
    if (formatMemoryAtomRecallContextForPrompt({ items: [candidate], skipped: [] }).length <= availableCharacters) {
      return candidate;
    }
    if (fittedPassages.length > 0) {
      fittedPassages = fittedPassages.slice(0, -1);
      continue;
    }
    fittedMissing = [];
  }
  return item;
}

function shouldIncludeSourcePassages(
  input: string,
  item: MemoryAtomRecallContextItem,
  mode: "auto" | "always" | "never"
): boolean {
  if (mode === "always") {
    return true;
  }
  if (mode === "never") {
    return false;
  }
  if (/(原文|原话|来源|证据|细节|为什么|原因|怎么|怎样|别只总结|source|quote|exact|verbatim|why|how|detail)/iu.test(input)) {
    return true;
  }
  return item.type === "opinion" && /(评价|差评|吐槽|complaint|review)/iu.test(input);
}

function matchTriggerLane(
  input: string,
  keys: string[] | undefined,
  lane: MemoryAtomTriggerLane,
  baseScore: number
): MemoryAtomRecallMatch[] {
  return (keys ?? [])
    .filter((key) => key.length > 0 && containsTriggerKey(input, key))
    .map((key) => ({ lane, key, score: baseScore + Math.min(10, key.length) }));
}

function containsTriggerKey(input: string, key: string): boolean {
  return input.toLowerCase().includes(key.toLowerCase());
}

function dedupeMatches(matches: MemoryAtomRecallMatch[]): MemoryAtomRecallMatch[] {
  const seen = new Set<string>();
  const result: MemoryAtomRecallMatch[] = [];
  for (const match of matches.sort((a, b) => b.score - a.score)) {
    const id = `${match.lane}:${normalizeTriggerKey(match.key)}`;
    if (seen.has(id)) {
      continue;
    }
    seen.add(id);
    result.push(match);
  }
  return result;
}

function formatAtomRecallReason(matches: MemoryAtomRecallMatch[]): string {
  const byLane = new Map<MemoryAtomTriggerLane, string[]>();
  for (const match of matches) {
    byLane.set(match.lane, [...(byLane.get(match.lane) ?? []), match.key]);
  }
  return [...byLane.entries()].map(([lane, keys]) => `${lane}:${keys.join(",")}`).join(";");
}

function normalizeTriggersInputKeys(keys: string[] | undefined): string[] {
  return normalizeTriggerKeys(keys ?? []);
}

function normalizeTriggerKeys(keys: string[]): string[] {
  return [...new Set(keys.map(normalizeTriggerKey).filter(Boolean))];
}

function normalizeTriggerKey(key: string): string {
  return key.trim().replace(/\s+/g, " ").toLowerCase();
}

function flattenTriggerKeys(triggers: MemoryAtomTriggers): string[] {
  return normalizeTriggerKeys([
    ...normalizeTriggersInputKeys(triggers.exact),
    ...normalizeTriggersInputKeys(triggers.aliases),
    ...normalizeTriggersInputKeys(triggers.secondary)
  ]);
}

function dedupeAtomsByWriteKey(atoms: MemoryAtom[]): MemoryAtom[] {
  const seen = new Set<string>();
  const result: MemoryAtom[] = [];
  for (const atom of atoms) {
    const keys = buildMemoryAtomWriteKeys(atom);
    if (keys.some((key) => seen.has(key))) {
      continue;
    }
    for (const key of keys) {
      seen.add(key);
    }
    result.push(atom);
  }
  return result;
}

function buildMemoryAtomWriteKeys(atom: MemoryAtom): string[] {
  const keys = new Set<string>([`id:${atom.id}`]);
  const text = comparableMemoryText(atom.text);
  if (text.length > 0) {
    keys.add(`${atom.threadId}:${atom.type}:text:${text}`);
  }
  const object = atom.object ? comparableMemoryText(atom.object) : "";
  const subject = atom.subject ? comparableMemoryText(atom.subject) : "";
  const date = atom.eventDate ? formatEventDate(atom.eventDate) : "";
  const category = getMemoryAtomCategory(atom);
  if (object.length > 0 || date.length > 0 || category.length > 0) {
    keys.add(`${atom.threadId}:${atom.type}:slot:${category}:${object}:${date}:${atom.sentiment ?? ""}`);
    if (subject.length > 0) {
      keys.add(`${atom.threadId}:${atom.type}:slot:${category}:${subject}:${object}:${date}:${atom.sentiment ?? ""}`);
    }
  }
  return [...keys];
}

function getMemoryAtomCategory(atom: MemoryAtom): string {
  const metadata = atom.metadata ?? {};
  for (const key of ["factType", "preferenceType", "opinionType", "eventType", "sceneType", "promiseType"] as const) {
    const value = metadata[key];
    if (typeof value === "string" && value.length > 0) {
      return comparableMemoryText(value);
    }
  }
  return "";
}

function comparableMemoryText(text: string): string {
  return normalizeText(text).toLowerCase();
}

function mergeMemoryAtomTriggers(base: MemoryAtomTriggers, candidate: MemoryAtomTriggers): MemoryAtomTriggers {
  return normalizeTriggers({
    exact: [...base.exact, ...candidate.exact],
    aliases: [...base.aliases, ...candidate.aliases],
    secondary: [...base.secondary, ...candidate.secondary],
    ...(base.calendar || candidate.calendar ? { calendar: [...(base.calendar ?? []), ...(candidate.calendar ?? [])] } : {}),
    ...(base.environment || candidate.environment ? { environment: [...(base.environment ?? []), ...(candidate.environment ?? [])] } : {}),
    ...(base.semantic || candidate.semantic ? { semantic: [...(base.semantic ?? []), ...(candidate.semantic ?? [])] } : {}),
    ...(base.relationship || candidate.relationship ? { relationship: [...(base.relationship ?? []), ...(candidate.relationship ?? [])] } : {})
  });
}

function mergeMemoryAtomMetadata(
  base: MemoryAtom["metadata"] | undefined,
  candidate: MemoryAtom["metadata"] | undefined
): MemoryAtom["metadata"] | undefined {
  if (!base && !candidate) {
    return;
  }
  const merged: Record<string, string | string[] | number | boolean | null> = { ...(base ?? {}) };
  for (const [key, value] of Object.entries(candidate ?? {})) {
    const existing = merged[key];
    if (Array.isArray(existing) && Array.isArray(value)) {
      merged[key] = [...new Set([...existing, ...value])];
      continue;
    }
    if (existing === undefined || existing === null || existing === "") {
      merged[key] = value;
    }
  }
  return merged;
}

function dedupeAtoms(atoms: MemoryAtom[]): MemoryAtom[] {
  const seen = new Set<string>();
  const result: MemoryAtom[] = [];
  for (const atom of atoms) {
    const key = `${atom.type}:${atom.text}:${atom.sourceTurnIds.join(",")}`;
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    result.push(atom);
  }
  return result;
}

function buildMemoryAtomId(atom: MemoryAtom): string {
  return `atom-${atom.type}-${stableHash([atom.threadId, atom.type, atom.text, ...atom.sourceTurnIds].join("|"))}`;
}

function stableHash(value: string): string {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
}

function roundScore(value: number): number {
  return Math.round(value * 1000) / 1000;
}

function normalizeText(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

function toIsoDateTime(value: string | Date): string {
  if (value instanceof Date) {
    return value.toISOString();
  }
  const parsed = new Date(value);
  if (!Number.isNaN(parsed.getTime())) {
    return parsed.toISOString();
  }
  return new Date().toISOString();
}

function toIsoDate(value: string | Date): string {
  return toIsoDateTime(value).slice(0, 10);
}

function toValidDate(value: string | Date): Date {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value;
  }
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? new Date() : parsed;
}

function parseRelativeDateReference(text: string, now: string | Date): { sourceText: string; isoDate: string } | undefined {
  const referenceDate = toValidDate(now);
  if (/今天|今日/u.test(text)) {
    return { sourceText: "今天", isoDate: referenceDate.toISOString().slice(0, 10) };
  }
  if (/明天/u.test(text)) {
    return { sourceText: "明天", isoDate: addDays(referenceDate, 1).toISOString().slice(0, 10) };
  }
  if (/后天/u.test(text)) {
    return { sourceText: "后天", isoDate: addDays(referenceDate, 2).toISOString().slice(0, 10) };
  }
  return;
}

function addDays(date: Date, days: number): Date {
  const next = new Date(date.getTime());
  next.setUTCDate(next.getUTCDate() + days);
  return next;
}

function toIsoDateFromParts(year: number, month: number, day: number): string | undefined {
  if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)) {
    return;
  }
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) {
    return;
  }
  return date.toISOString().slice(0, 10);
}

function daysBetweenIsoDates(a: string, b: string): number {
  const aTime = Date.parse(`${a}T00:00:00.000Z`);
  const bTime = Date.parse(`${b}T00:00:00.000Z`);
  if (Number.isNaN(aTime) || Number.isNaN(bTime)) {
    return Number.POSITIVE_INFINITY;
  }
  return Math.round((aTime - bTime) / 86_400_000);
}

function isValidMonthDay(month: number, day: number): boolean {
  return month >= 1 && month <= 12 && day >= 1 && day <= 31;
}

function truncateAtBoundary(text: string, maxCharacters: number): string {
  if (text.length <= maxCharacters) {
    return text;
  }
  const clipped = text.slice(0, maxCharacters);
  const lastPunctuation = Math.max(
    clipped.lastIndexOf("。"),
    clipped.lastIndexOf("！"),
    clipped.lastIndexOf("？"),
    clipped.lastIndexOf("."),
    clipped.lastIndexOf("!"),
    clipped.lastIndexOf("?")
  );
  if (lastPunctuation > Math.floor(maxCharacters * 0.45)) {
    return `${clipped.slice(0, lastPunctuation + 1).trimEnd()}...`;
  }
  return `${clipped.trimEnd()}...`;
}

function formatEventDate(eventDate: MemoryAtomEventDate): string {
  if (eventDate.kind === "absolute" && eventDate.isoDate) {
    return eventDate.isoDate;
  }
  if (eventDate.kind === "month_day" && eventDate.month !== undefined && eventDate.day !== undefined) {
    return `${eventDate.month.toString().padStart(2, "0")}-${eventDate.day.toString().padStart(2, "0")}`;
  }
  return eventDate.sourceText;
}

function recencyScore(createdAt: string): number {
  const time = Date.parse(createdAt);
  if (Number.isNaN(time)) {
    return 0;
  }
  return Math.min(1, Math.max(0, time / 10_000_000_000_000));
}
