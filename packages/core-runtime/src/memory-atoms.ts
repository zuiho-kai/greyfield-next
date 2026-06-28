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

  const episodicScene = extractEpisodicSceneAtom(normalizedText);
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
  timeOfDay?: SceneTimeOfDay;
  longAbsence?: boolean;
  longAbsenceDays?: number;
}

function extractEpisodicSceneAtom(
  text: string
): Omit<MemoryAtom, "id" | "createdAt" | "threadId" | "sourceTurnIds" | "triggerKeys"> | undefined {
  if (!hasExplicitSaveIntent(text)) {
    return;
  }
  const attributes = extractSceneAttributes(text);
  if (countSceneSignals(attributes) < 2) {
    return;
  }
  const triggerParts = buildSceneTriggerParts(text, attributes);
  return {
    type: "episodic_scene",
    text: formatSceneMemoryText(attributes),
    importance: attributes.action || attributes.longAbsence ? 0.82 : 0.76,
    subject: "user_and_greyfield",
    object: buildSceneObject(attributes),
    triggers: {
      exact: triggerParts.exact,
      aliases: triggerParts.aliases,
      secondary: triggerParts.secondary,
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
  return {
    weather,
    place,
    windowState,
    activity,
    action,
    relationshipMeaning,
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
    ...(attributes.relationshipMeaning || text.includes("一起") ? ["shared scene memory"] : [])
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
    attributes.activity ? `and share ${sceneActivityEnglishLabel(attributes.activity)} together` : "",
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
    ...(attributes.timeOfDay ? { timeOfDay: attributes.timeOfDay } : {}),
    ...(attributes.longAbsence ? { longAbsence: true, longAbsenceDays: attributes.longAbsenceDays ?? 30 } : {})
  };
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
