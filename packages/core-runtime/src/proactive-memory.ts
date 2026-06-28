import type { MemoryAtom } from "./memory-atoms";

export interface EnvironmentTriggerState {
  now?: string | Date;
  weather?: string;
  timeOfDay?: string;
  virtualHome?: {
    windowOpen?: boolean;
  };
  lastSeenAt?: string | Date;
  lastSeenDays?: number;
}

export interface RuntimeSceneObjectSignal {
  kind: string;
  state?: string;
  location?: string;
}

export type RuntimeSceneObject = string | RuntimeSceneObjectSignal;

export interface RuntimeSceneContext {
  // Explicit caller-supplied scene signals only; this module never reads weather, screen, or OS state.
  currentTime?: string | Date;
  weather?: string;
  location?: string;
  objects?: RuntimeSceneObject[];
  absenceDays?: number;
  lastSeenAt?: string | Date;
}

export interface ProactiveMemoryPolicy {
  enabled?: boolean;
  minImportance?: number;
  globalCooldownMs?: number;
  perAtomCooldownMs?: number;
  maxCandidates?: number;
  defaultLongAbsenceDays?: number;
  requireSharedScene?: boolean;
}

export interface ProactiveMemoryTriggerState {
  lastTriggeredAt?: string;
  atomLastTriggeredAt?: Record<string, string>;
}

export interface ProactiveMemoryCandidate {
  kind: "environment";
  atomId: string;
  sourceTurnIds: string[];
  text: string;
  score: number;
  importance: number;
  matchedEnvironmentKeys: string[];
  reason: string;
  cooldown: ProactiveMemoryCandidateCooldown;
}

export interface ProactiveMemoryCandidateCooldown {
  triggeredAt: string;
  globalCooldownMs: number;
  perAtomCooldownMs: number;
  nextGlobalAllowedAt?: string;
  nextAtomAllowedAt?: string;
}

export interface ProactiveMemorySkippedItem {
  atomId?: string;
  reason:
    | "policy_disabled"
    | "global_cooldown"
    | "disabled"
    | "importance_below_threshold"
    | "atom_cooldown"
    | "no_environment_trigger"
    | "weather_missing"
    | "weather_mismatch"
    | "virtual_home_missing"
    | "window_closed"
    | "last_seen_missing"
    | "recent_user_activity"
    | "no_shared_scene"
    | "environment_mismatch"
    | "max_candidates";
}

export interface BuildProactiveMemoryCandidatesOptions {
  atoms: MemoryAtom[];
  environment: EnvironmentTriggerState;
  policy?: ProactiveMemoryPolicy;
  triggerState?: ProactiveMemoryTriggerState;
}

export interface BuildProactiveMemorySceneCandidatesOptions {
  atoms: MemoryAtom[];
  sceneContext: RuntimeSceneContext;
  policy?: ProactiveMemoryPolicy;
  triggerState?: ProactiveMemoryTriggerState;
}

export interface ProactiveMemoryCandidateResult {
  candidates: ProactiveMemoryCandidate[];
  skipped: ProactiveMemorySkippedItem[];
  nextTriggerState: ProactiveMemoryTriggerState;
}

export interface ProactiveMemoryDisplayMessage {
  text: string;
  createdAt: string;
}

export interface ProactiveMemoryDisplayResult {
  displayed: boolean;
  message?: ProactiveMemoryDisplayMessage;
  reason?: "cooldown" | "no_candidate";
}

export interface BuildProactiveMemoryDisplayOptions {
  atoms: MemoryAtom[];
  sceneContext: RuntimeSceneContext;
  policy?: ProactiveMemoryPolicy;
  triggerState?: ProactiveMemoryTriggerState;
}

export interface BuildProactiveMemoryDisplayResult {
  response: ProactiveMemoryDisplayResult;
  nextTriggerState: ProactiveMemoryTriggerState;
}

type NormalizedWeather = "rain" | "snow" | "wind" | "heat" | "normal";

const defaultPolicy: Required<ProactiveMemoryPolicy> = {
  enabled: true,
  minImportance: 0.7,
  globalCooldownMs: 6 * 60 * 60 * 1000,
  perAtomCooldownMs: 7 * 24 * 60 * 60 * 1000,
  maxCandidates: 1,
  defaultLongAbsenceDays: 30,
  requireSharedScene: true
};

export function buildProactiveMemoryCandidatesFromSceneContext(
  options: BuildProactiveMemorySceneCandidatesOptions
): ProactiveMemoryCandidateResult {
  return buildProactiveMemoryCandidates({
    atoms: options.atoms,
    environment: sceneContextToEnvironmentTriggerState(options.sceneContext),
    policy: options.policy,
    triggerState: options.triggerState
  });
}

export function buildProactiveMemoryDisplayMessage(
  options: BuildProactiveMemoryDisplayOptions
): BuildProactiveMemoryDisplayResult {
  const triggerState = options.triggerState ?? {};
  const result = buildProactiveMemoryCandidates({
    atoms: options.atoms,
    environment: sceneContextToEnvironmentTriggerState(options.sceneContext),
    policy: {
      enabled: true,
      minImportance: 0.7,
      maxCandidates: 1,
      ...(options.policy ?? {})
    },
    triggerState
  });
  const candidate = result.candidates[0];
  if (!candidate) {
    const cooldownSkipped = result.skipped.some((item) => item.reason === "global_cooldown" || item.reason === "atom_cooldown");
    return {
      response: {
        displayed: false,
        reason: cooldownSkipped ? "cooldown" : "no_candidate"
      },
      nextTriggerState: result.nextTriggerState
    };
  }

  const atom = options.atoms.find((item) => item.id === candidate.atomId);
  return {
    response: {
      displayed: true,
      message: {
        text: formatProactiveDisplayText(atom, options.sceneContext),
        createdAt: result.nextTriggerState.lastTriggeredAt ?? toIsoDateTime(options.sceneContext.currentTime ?? new Date())
      }
    },
    nextTriggerState: result.nextTriggerState
  };
}

export function sceneContextToEnvironmentTriggerState(sceneContext: RuntimeSceneContext): EnvironmentTriggerState {
  const windowOpen = getSceneWindowOpen(sceneContext.objects ?? []);
  const homePresent = isHomeLocation(sceneContext.location) || sceneContext.objects?.some(sceneObjectHasHomeLocation) === true;
  return {
    now: sceneContext.currentTime,
    weather: sceneContext.weather,
    ...(homePresent ? { virtualHome: windowOpen === undefined ? {} : { windowOpen } } : {}),
    lastSeenAt: sceneContext.lastSeenAt,
    lastSeenDays: sceneContext.absenceDays
  };
}

export function buildProactiveMemoryCandidates(
  options: BuildProactiveMemoryCandidatesOptions
): ProactiveMemoryCandidateResult {
  const policy = { ...defaultPolicy, ...(options.policy ?? {}) };
  const triggerState = options.triggerState ?? {};
  const now = toEpochMs(options.environment.now ?? new Date());
  if (!policy.enabled) {
    return {
      candidates: [],
      skipped: [{ reason: "policy_disabled" }],
      nextTriggerState: triggerState
    };
  }
  if (isWithinCooldown(triggerState.lastTriggeredAt, now, policy.globalCooldownMs)) {
    return {
      candidates: [],
      skipped: [{ reason: "global_cooldown" }],
      nextTriggerState: triggerState
    };
  }

  const skipped: ProactiveMemorySkippedItem[] = [];
  const candidates = options.atoms
    .flatMap((atom): ProactiveMemoryCandidate[] => {
      if (atom.disabled) {
        skipped.push({ atomId: atom.id, reason: "disabled" });
        return [];
      }
      if (atom.importance < policy.minImportance) {
        skipped.push({ atomId: atom.id, reason: "importance_below_threshold" });
        return [];
      }
      if (isWithinCooldown(triggerState.atomLastTriggeredAt?.[atom.id], now, policy.perAtomCooldownMs)) {
        skipped.push({ atomId: atom.id, reason: "atom_cooldown" });
        return [];
      }
      const match = matchEnvironmentTrigger(atom, options.environment, policy, now);
      if (!match.matched) {
        skipped.push({ atomId: atom.id, reason: match.reason });
        return [];
      }
      return [
        {
          kind: "environment",
          atomId: atom.id,
          sourceTurnIds: atom.sourceTurnIds,
          text: formatProactiveCandidateText(atom, options.environment, match.matchedKeys),
          score: roundScore(atom.importance * 100 + match.matchedKeys.length * 8 + match.priorityBoost),
          importance: atom.importance,
          matchedEnvironmentKeys: match.matchedKeys,
          reason: `environment:${match.matchedKeys.join(",")}`,
          cooldown: buildCandidateCooldown(policy, options.environment.now ?? new Date())
        }
      ];
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, policy.maxCandidates);

  const candidateIds = new Set(candidates.map((candidate) => candidate.atomId));
  for (const atom of options.atoms) {
    if (!candidateIds.has(atom.id) && candidates.length >= policy.maxCandidates) {
      const alreadySkipped = skipped.some((item) => item.atomId === atom.id);
      if (!alreadySkipped && atom.importance >= policy.minImportance && !atom.disabled) {
        skipped.push({ atomId: atom.id, reason: "max_candidates" });
      }
    }
  }

  return {
    candidates,
    skipped,
    nextTriggerState:
      candidates.length > 0 ? recordProactiveMemoryTriggers(triggerState, candidates, options.environment.now ?? new Date()) : triggerState
  };
}

function getSceneWindowOpen(objects: RuntimeSceneObject[]): boolean | undefined {
  for (const object of objects) {
    const kind = typeof object === "string" ? object : object.kind;
    if (!isWindowObject(kind)) {
      continue;
    }
    const state = typeof object === "string" ? object : object.state;
    if (!state) {
      continue;
    }
    if (isOpenWindowState(state)) {
      return true;
    }
    if (isClosedWindowState(state)) {
      return false;
    }
  }
  return;
}

function isOpenWindowState(value: string): boolean {
  return /\b(open|opened|true)\b/iu.test(value) || /(开着|打开|开启|已开|开窗)/u.test(value);
}

function isClosedWindowState(value: string): boolean {
  return /\b(closed|shut|false)\b/iu.test(value) || /(关着|关闭|关上|已关|关窗)/u.test(value);
}

function isWindowObject(value: string | undefined): boolean {
  if (!value) {
    return false;
  }
  const normalized = normalizeKey(value).replace(/[-_.]+/g, " ");
  return /\bwindow\b/iu.test(normalized) || /(窗户|窗)/u.test(value);
}

function sceneObjectHasHomeLocation(object: RuntimeSceneObject): boolean {
  const values =
    typeof object === "string" ? [object] : [object.location, object.kind].filter((value): value is string => Boolean(value));
  return values.some(isHomeLocation);
}

function isHomeLocation(value: string | undefined): boolean {
  if (!value) {
    return false;
  }
  const normalized = normalizeKey(value).replace(/[-_.\s]+/g, "_");
  return (
    normalized === "home" ||
    normalized === "virtual_home" ||
    normalized.includes("virtual_home") ||
    /(虚拟家|虚拟的家|家里|家中|在家|^家$)/u.test(value)
  );
}

function buildCandidateCooldown(
  policy: Required<ProactiveMemoryPolicy>,
  triggeredAtValue: string | Date
): ProactiveMemoryCandidateCooldown {
  const triggeredAt = toIsoDateTime(triggeredAtValue);
  return {
    triggeredAt,
    globalCooldownMs: policy.globalCooldownMs,
    perAtomCooldownMs: policy.perAtomCooldownMs,
    ...(policy.globalCooldownMs > 0 ? { nextGlobalAllowedAt: addMsToIsoDateTime(triggeredAt, policy.globalCooldownMs) } : {}),
    ...(policy.perAtomCooldownMs > 0 ? { nextAtomAllowedAt: addMsToIsoDateTime(triggeredAt, policy.perAtomCooldownMs) } : {})
  };
}

function addMsToIsoDateTime(value: string, ms: number): string {
  const time = Date.parse(value);
  if (!Number.isFinite(time)) {
    return toIsoDateTime(new Date());
  }
  return new Date(time + ms).toISOString();
}

export function recordProactiveMemoryTriggers(
  state: ProactiveMemoryTriggerState,
  candidates: ProactiveMemoryCandidate[],
  triggeredAt: string | Date
): ProactiveMemoryTriggerState {
  const timestamp = toIsoDateTime(triggeredAt);
  return {
    lastTriggeredAt: timestamp,
    atomLastTriggeredAt: {
      ...(state.atomLastTriggeredAt ?? {}),
      ...Object.fromEntries(candidates.map((candidate) => [candidate.atomId, timestamp]))
    }
  };
}

function matchEnvironmentTrigger(
  atom: MemoryAtom,
  environment: EnvironmentTriggerState,
  policy: Required<ProactiveMemoryPolicy>,
  now: number
):
  | { matched: true; matchedKeys: string[]; priorityBoost: number }
  | { matched: false; reason: ProactiveMemorySkippedItem["reason"] } {
  const environmentTriggers = atom.triggers.environment ?? [];
  const expectedWeather = getAtomWeather(atom) ?? inferWeatherFromKeys(environmentTriggers);
  const windowRequirement = getAtomWindowRequirement(atom, environmentTriggers);
  const virtualHomeRequired = requiresVirtualHome(environmentTriggers, windowRequirement);
  const absenceDays = getLongAbsenceDays(atom, environmentTriggers, policy.defaultLongAbsenceDays);
  if (environmentTriggers.length === 0 && !expectedWeather && !windowRequirement && !absenceDays) {
    return { matched: false, reason: "no_environment_trigger" };
  }
  if (policy.requireSharedScene && atom.type === "episodic_scene" && !isSharedSceneAtom(atom)) {
    return { matched: false, reason: "no_shared_scene" };
  }

  const matchedKeys = new Set<string>();
  const currentWeather = normalizeWeather(environment.weather);
  if (expectedWeather) {
    if (!currentWeather) {
      return { matched: false, reason: "weather_missing" };
    }
    if (currentWeather !== expectedWeather) {
      return { matched: false, reason: "weather_mismatch" };
    }
    matchedKeys.add(expectedWeather);
  }

  if (virtualHomeRequired && !environment.virtualHome) {
    return { matched: false, reason: "virtual_home_missing" };
  }
  if (virtualHomeRequired) {
    matchedKeys.add("virtual_home");
  }

  if (windowRequirement === "open") {
    if (environment.virtualHome?.windowOpen !== true) {
      return { matched: false, reason: "window_closed" };
    }
    matchedKeys.add("virtual_home.window=open");
  }

  if (absenceDays !== undefined) {
    const lastSeenDays = resolveLastSeenDays(environment, now);
    if (lastSeenDays === undefined) {
      return { matched: false, reason: "last_seen_missing" };
    }
    if (lastSeenDays < absenceDays) {
      return { matched: false, reason: "recent_user_activity" };
    }
    matchedKeys.add(`last_seen_days>=${absenceDays}`);
  }

  for (const key of environmentTriggers) {
    if (environmentKeyMatches(key, environment, now, policy.defaultLongAbsenceDays)) {
      matchedKeys.add(normalizeKey(key));
    }
  }

  if (matchedKeys.size === 0) {
    return { matched: false, reason: "environment_mismatch" };
  }
  return {
    matched: true,
    matchedKeys: [...matchedKeys],
    priorityBoost: windowRequirement === "open" || absenceDays !== undefined ? 10 : 0
  };
}

function requiresVirtualHome(environmentTriggers: string[], windowRequirement: "open" | undefined): boolean {
  if (windowRequirement === "open") {
    return true;
  }
  return environmentTriggers.some((key) => normalizeKey(key) === "virtual_home" || /虚拟家/u.test(key));
}

function isSharedSceneAtom(atom: MemoryAtom): boolean {
  if (atom.metadata?.sharedExperience === true) {
    return true;
  }
  if (atom.triggers.semantic?.some((key) => normalizeKey(key) === "shared scene memory")) {
    return true;
  }
  return /(我们|一起|共同|陪伴|together|shared)/iu.test(atom.text);
}

function getAtomWeather(atom: MemoryAtom): NormalizedWeather | undefined {
  return normalizeWeather(readStringMetadata(atom, "weather"));
}

function getAtomWindowRequirement(atom: MemoryAtom, environmentTriggers: string[]): "open" | undefined {
  if (readStringMetadata(atom, "windowState") === "open") {
    return "open";
  }
  return environmentTriggers.some((key) => /window\s*=\s*open|窗户开着|窗开着|开着窗/iu.test(key)) ? "open" : undefined;
}

function getLongAbsenceDays(
  atom: MemoryAtom,
  environmentTriggers: string[],
  defaultLongAbsenceDays: number
): number | undefined {
  const metadataDays = readNumberMetadata(atom, "longAbsenceDays");
  if (metadataDays !== undefined) {
    return metadataDays;
  }
  const thresholdKey = environmentTriggers
    .map((key) => key.match(/last_seen_days\s*>=\s*(\d+)/iu))
    .find((match): match is RegExpMatchArray => Boolean(match));
  if (thresholdKey) {
    return Number(thresholdKey[1]);
  }
  return environmentTriggers.some((key) => /长期没上线|long absence|久别/u.test(key)) ? defaultLongAbsenceDays : undefined;
}

function environmentKeyMatches(
  key: string,
  environment: EnvironmentTriggerState,
  now: number,
  defaultLongAbsenceDays: number
): boolean {
  const normalized = normalizeKey(key);
  const currentWeather = normalizeWeather(environment.weather);
  if (currentWeather && normalizeWeather(normalized) === currentWeather) {
    return true;
  }
  if (normalized === "virtual_home" && environment.virtualHome) {
    return true;
  }
  if (normalized === "virtual_home.window=open" || /窗户开着|窗开着|开着窗/u.test(normalized)) {
    return environment.virtualHome?.windowOpen === true;
  }
  if (normalized === "virtual_home.window=closed" || /窗户关着|窗关着|关着窗/u.test(normalized)) {
    return environment.virtualHome?.windowOpen === false;
  }
  if (environment.timeOfDay && normalized === normalizeKey(environment.timeOfDay)) {
    return true;
  }
  const lastSeenThreshold = normalized.match(/last_seen_days\s*>=\s*(\d+)/u);
  if (lastSeenThreshold) {
    const lastSeenDays = resolveLastSeenDays(environment, now);
    return lastSeenDays !== undefined && lastSeenDays >= Number(lastSeenThreshold[1]);
  }
  if (/长期没上线|long absence|久别/u.test(normalized)) {
    const lastSeenDays = resolveLastSeenDays(environment, now);
    return lastSeenDays !== undefined && lastSeenDays >= defaultLongAbsenceDays;
  }
  return false;
}

function formatProactiveCandidateText(
  atom: MemoryAtom,
  environment: EnvironmentTriggerState,
  matchedKeys: string[]
): string {
  const clauses = [
    formatWeatherClause(normalizeWeather(environment.weather)),
    environment.virtualHome?.windowOpen === true ? "虚拟家的窗户还开着" : "",
    formatLastSeenClause(resolveLastSeenDays(environment, toEpochMs(environment.now ?? new Date())))
  ].filter(Boolean);
  const action = readStringMetadata(atom, "actionText") ?? (readStringMetadata(atom, "action") === "close_window" ? "关窗" : undefined);
  const activity = formatActivity(readStringMetadata(atom, "activity"));
  const remembered =
    action && activity
      ? `提醒你${action}，也可以一起${activity}`
      : action
        ? `提醒你${action}`
        : activity
          ? `一起${activity}`
          : "把这个场景轻轻提一下";
  const prefix = clauses.length > 0 ? `${clauses.join("，")}。` : "现在的环境和你保存过的场景很像。";
  const ending = matchedKeys.length > 1 ? "我先轻轻提醒一次。" : "我轻轻提醒一下。";
  return `${prefix}我想起你说过这种时候要${remembered}，${ending}`;
}

function formatWeatherClause(weather: NormalizedWeather | undefined): string {
  if (weather === "rain") {
    return "外面在下雨";
  }
  if (weather === "snow") {
    return "外面在下雪";
  }
  if (weather === "wind") {
    return "外面风很大";
  }
  if (weather === "heat") {
    return "外面很热";
  }
  return "";
}

function formatLastSeenClause(days: number | undefined): string {
  if (days === undefined || days < 2) {
    return "";
  }
  return `你已经 ${Math.floor(days)} 天没上线`;
}

function formatActivity(activity: string | undefined): string | undefined {
  if (activity === "hotpot") {
    return "吃火锅";
  }
  if (activity === "tea") {
    return "泡茶";
  }
  if (activity === "movie") {
    return "看电影";
  }
  if (activity === "lego") {
    return "拼乐高";
  }
  if (activity === "shared_meal") {
    return "吃饭";
  }
  return;
}

function formatProactiveDisplayText(atom: MemoryAtom | undefined, sceneContext: RuntimeSceneContext): string {
  const weatherClause = formatDisplayWeatherClause(sceneContext.weather);
  const activity = atom ? readStringMetadata(atom, "activity") : undefined;
  const memoryClause = formatDisplayMemoryClause(activity, atom);
  return `${weatherClause || "This moment feels familiar."} I remembered ${memoryClause}.`;
}

function formatDisplayMemoryClause(activity: string | undefined, atom: MemoryAtom | undefined): string {
  const activityClause = formatDisplayActivityClause(activity);
  const shared = atom?.metadata?.sharedExperience === true || /\b(we|us|together|shared)\b/iu.test(atom?.text ?? "");
  if (activityClause) {
    return shared ? activityClause.shared : activityClause.personal;
  }
  return shared ? "a quiet scene we shared" : "something you cared about";
}

function formatDisplayWeatherClause(weather: string | undefined): string {
  if (!weather) {
    return "";
  }
  if (/\brain|raining|rainy\b/iu.test(weather)) {
    return "It's raining again.";
  }
  if (/\bsnow|snowing|snowy\b/iu.test(weather)) {
    return "It's snowing again.";
  }
  if (/\bwind|windy\b/iu.test(weather)) {
    return "The wind picked up again.";
  }
  return "";
}

function formatDisplayActivityClause(activity: string | undefined): { shared: string; personal: string } | undefined {
  if (activity === "hotpot") {
    return { shared: "our hotpot night at home", personal: "your hotpot night at home" };
  }
  if (activity === "tea") {
    return { shared: "us making tea together", personal: "you making tea" };
  }
  if (activity === "movie") {
    return { shared: "us watching a movie together", personal: "your movie night" };
  }
  if (activity === "lego") {
    return { shared: "us building Lego together", personal: "your Lego build" };
  }
  if (activity === "shared_meal") {
    return { shared: "us sharing a meal", personal: "your meal at home" };
  }
  return;
}

function resolveLastSeenDays(environment: EnvironmentTriggerState, now: number): number | undefined {
  if (environment.lastSeenDays !== undefined) {
    return environment.lastSeenDays;
  }
  if (!environment.lastSeenAt) {
    return;
  }
  const lastSeenAt = toEpochMs(environment.lastSeenAt);
  if (!Number.isFinite(lastSeenAt)) {
    return;
  }
  return Math.max(0, Math.floor((now - lastSeenAt) / (24 * 60 * 60 * 1000)));
}

function isWithinCooldown(lastTriggeredAt: string | undefined, now: number, cooldownMs: number): boolean {
  if (!lastTriggeredAt || cooldownMs <= 0) {
    return false;
  }
  const lastTriggeredTime = Date.parse(lastTriggeredAt);
  return Number.isFinite(lastTriggeredTime) && now - lastTriggeredTime < cooldownMs;
}

function readStringMetadata(atom: MemoryAtom, key: string): string | undefined {
  const value = atom.metadata?.[key];
  return typeof value === "string" ? value : undefined;
}

function readNumberMetadata(atom: MemoryAtom, key: string): number | undefined {
  const value = atom.metadata?.[key];
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function inferWeatherFromKeys(keys: string[]): NormalizedWeather | undefined {
  return keys.map((key) => normalizeWeather(key)).find((weather): weather is NormalizedWeather => Boolean(weather));
}

function normalizeWeather(value: string | undefined): NormalizedWeather | undefined {
  if (!value) {
    return;
  }
  if (/(rain|raining|rainy|下雨|雨天|^雨$)/iu.test(value)) {
    return "rain";
  }
  if (/(snow|snowing|snowy|下雪|雪天|^雪$)/iu.test(value)) {
    return "snow";
  }
  if (/(wind|windy|大风|刮风)/iu.test(value)) {
    return "wind";
  }
  if (/(heat|hot|高温|很热)/iu.test(value)) {
    return "heat";
  }
  if (/(normal|ordinary|clear|sunny|晴|普通天气|正常天气)/iu.test(value)) {
    return "normal";
  }
  return;
}

function normalizeKey(key: string): string {
  return key.trim().replace(/\s+/g, " ").toLowerCase();
}

function toEpochMs(value: string | Date): number {
  if (value instanceof Date) {
    return value.getTime();
  }
  return Date.parse(value);
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

function roundScore(value: number): number {
  return Math.round(value * 1_000) / 1_000;
}
