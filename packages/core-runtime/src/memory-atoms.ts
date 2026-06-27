import type { ChatMessage } from "./providers";

export type MemoryAtomType = "fact" | "preference" | "opinion" | "relationship_event" | "episodic_scene";
export type MemoryAtomSentiment = "positive" | "negative" | "neutral";
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
  disabled?: boolean;
  importance?: number;
  triggers?: Partial<MemoryAtomTriggers>;
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
}

export interface MemoryAtomExtractor {
  extract(input: MemoryAtomExtractionInput): Promise<MemoryAtom[]>;
}

export class DeterministicMemoryAtomExtractor implements MemoryAtomExtractor {
  async extract(input: MemoryAtomExtractionInput): Promise<MemoryAtom[]> {
    return extractDeterministicMemoryAtoms(input);
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
}

export interface MemoryAtomRecallContext {
  items: MemoryAtomRecallContextItem[];
  skipped: Array<{
    kind: "memory-atom";
    id: string;
    reason: string;
  }>;
}

export interface BuildMemoryAtomRecallContextOptions {
  input: string;
  atoms: MemoryAtom[];
  maxItems?: number;
  maxCharacters?: number;
  // Future lanes are explicit adapters. The default deterministic path only uses exact, alias, and secondary keys.
  resolvers?: MemoryAtomRecallLaneResolver[];
}

const defaultMaxAtomRecallItems = 4;
const defaultMaxAtomRecallCharacters = 1400;

const exactLaneScore = 100;
const aliasLaneScore = 70;
const secondaryLaneScore = 40;

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

  const gameOpinion = extractGameOpinionAtom(normalizedText);
  if (gameOpinion) {
    push(gameOpinion);
  }

  const episodicScene = extractRainyHotpotSceneAtom(normalizedText);
  if (episodicScene) {
    push(episodicScene);
  }

  if (atoms.length === 0 && hasExplicitSaveIntent(normalizedText)) {
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

export function buildMemoryAtomRecallContext(options: BuildMemoryAtomRecallContextOptions): MemoryAtomRecallContext {
  const maxItems = options.maxItems ?? defaultMaxAtomRecallItems;
  const maxCharacters = options.maxCharacters ?? defaultMaxAtomRecallCharacters;
  const skipped: MemoryAtomRecallContext["skipped"] = options.atoms
    .filter((atom) => atom.disabled)
    .map((atom) => ({ kind: "memory-atom", id: atom.id, reason: "disabled" }));

  const ranked = options.atoms
    .filter((atom) => !atom.disabled)
    .map((atom) => {
      const matches = [
        ...matchTriggerLane(options.input, atom.triggers.exact, "exact", exactLaneScore),
        ...matchTriggerLane(options.input, atom.triggers.aliases, "alias", aliasLaneScore),
        ...matchTriggerLane(options.input, atom.triggers.secondary, "secondary", secondaryLaneScore),
        ...(options.resolvers ?? []).flatMap((resolver) => resolver.match(options.input, atom, options))
      ];
      const uniqueMatches = dedupeMatches(matches);
      const score =
        uniqueMatches.reduce((total, match) => total + match.score, 0) +
        Math.min(1, Math.max(0, atom.importance)) * 10 +
        recencyScore(atom.createdAt);
      return { atom, matches: uniqueMatches, score: uniqueMatches.length > 0 ? score : 0 };
    })
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score || b.atom.createdAt.localeCompare(a.atom.createdAt));

  const items: MemoryAtomRecallContextItem[] = [];
  let usedCharacters = 0;

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
    const nextCharacters = usedCharacters + formatMemoryAtomRecallContextForPrompt({ items: [candidate], skipped: [] }).length;
    if (items.length >= maxItems || nextCharacters > maxCharacters) {
      skipped.push({
        kind: "memory-atom",
        id: item.atom.id,
        reason: items.length >= maxItems ? "max_items" : "max_characters"
      });
      continue;
    }
    items.push(candidate);
    usedCharacters = nextCharacters;
  }

  return { items, skipped };
}

export function formatMemoryAtomRecallContextForPrompt(context: MemoryAtomRecallContext): string {
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
        `- memory-atom ${item.id} (${item.type})`,
        `  Reason: ${item.reason}`,
        `  Source turns: ${item.sourceTurnIds.join(", ")}`,
        item.matchedKeys.length > 0 ? `  Matched keys: ${item.matchedKeys.join(", ")}` : "",
        ...detailLines,
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
    content: `Relevant recalled memory atoms:\n${formatted}`
  };
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

function extractBirthdayAtom(
  text: string,
  input: MemoryAtomExtractionInput
): Omit<MemoryAtom, "id" | "createdAt" | "threadId" | "sourceTurnIds" | "triggerKeys"> | undefined {
  if (!/生日/u.test(text) || !/(记住|以后|别忘|今天|每年|生日是)/u.test(text)) {
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

function extractRelationshipEventAtom(
  text: string,
  input: MemoryAtomExtractionInput
): Omit<MemoryAtom, "id" | "createdAt" | "threadId" | "sourceTurnIds" | "triggerKeys"> | undefined {
  if (!/(第一次遇见|初遇|相遇|纪念日)/u.test(text) || !/(记住|别忘|玫瑰|每年|纪念日)/u.test(text)) {
    return;
  }
  const hasRose = /玫瑰/u.test(text);
  return {
    type: "relationship_event",
    text: hasRose
      ? "Relationship event: the user marked the first meeting anniversary by giving Greyfield a rose."
      : "Relationship event: the user marked the first meeting anniversary.",
    importance: 0.95,
    subject: "user_and_greyfield",
    object: "first_meeting_anniversary",
    eventDate: parseEventDate(text, input.now),
    recurrence: /每年|纪念日/u.test(text) ? { frequency: "annual", sourceText: /每年/u.test(text) ? "每年" : "纪念日" } : undefined,
    ritualAction: hasRose ? "送玫瑰" : undefined,
    triggers: {
      exact: ["第一次遇见", "纪念日"],
      aliases: ["初遇", "相遇纪念日", "第一次见面"],
      secondary: hasRose ? ["玫瑰", "送花", "礼物"] : ["关系事件"],
      calendar: ["first_meeting_anniversary"],
      relationship: ["user_and_greyfield"]
    },
    metadata: {
      eventType: "first_meeting_anniversary",
      gift: hasRose ? "rose" : null
    }
  };
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
      aliases: title ? [`${title}游戏`, "那个游戏", "旧游戏"] : ["那个游戏", "旧游戏"],
      secondary: normalizeTriggerKeys([...reasons, "游戏差评", "不要推荐", "游戏付费", "游戏剧情"])
    },
    metadata: {
      target,
      reasons,
      opinionType: "game_review"
    }
  };
}

function extractRainyHotpotSceneAtom(
  text: string
): Omit<MemoryAtom, "id" | "createdAt" | "threadId" | "sourceTurnIds" | "triggerKeys"> | undefined {
  if (!/(下雨|雨天|雨)/u.test(text) || !/火锅/u.test(text) || !hasExplicitSaveIntent(text)) {
    return;
  }
  return {
    type: "episodic_scene",
    text: "Episodic scene: a rainy evening when the user and Greyfield ate hotpot together.",
    importance: 0.78,
    subject: "user_and_greyfield",
    object: "rainy_hotpot_scene",
    triggers: {
      exact: ["下雨天吃火锅", "火锅"],
      aliases: ["雨天", "下雨天", "那个下雨的晚上"],
      secondary: ["晚上", "一起吃饭", "热乎乎"],
      environment: ["下雨", "雨天"],
      semantic: ["cozy shared meal", "rainy evening memory"],
      relationship: ["user_and_greyfield"]
    },
    metadata: {
      sceneType: "shared_meal",
      weather: "rain",
      activity: "hotpot",
      timeOfDay: text.includes("晚上") ? "evening" : "unknown"
    }
  };
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
  if (/今天/u.test(text)) {
    const isoDate = toIsoDate(now ?? new Date());
    return {
      kind: "absolute",
      sourceText: "今天",
      precision: "day",
      isoDate
    };
  }
  return;
}

function extractQuotedTitle(text: string): string | undefined {
  const match = text.match(/《([^》]+)》/u);
  return match?.[1]?.trim();
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

function isValidMonthDay(month: number, day: number): boolean {
  return month >= 1 && month <= 12 && day >= 1 && day <= 31;
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
