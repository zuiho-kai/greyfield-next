import type { DesktopMemorySourcePassage } from "../shared/ipc";
import { settingsT, type SettingsLocale } from "./settings-i18n";

const defaultSourcePassageDisplayLimit = 520;

export function describeMemorySourceCount(input: {
  sourcePassages?: DesktopMemorySourcePassage[];
  sourceIds?: string[];
}, locale?: SettingsLocale): string {
  const passages = input.sourcePassages ?? [];
  const fallbackCount = input.sourceIds?.length ?? 0;
  const total = passages.length > 0 ? passages.length : fallbackCount;
  if (total === 0) {
    return settingsT(locale, "memory.source.none");
  }

  if (passages.length === 0) {
    return settingsT(locale, total === 1 ? "memory.source.saved.one" : "memory.source.saved.many", {
      count: total
    });
  }

  const available = passages.filter((passage) => passage.status === "available").length;
  if (available === total) {
    return settingsT(locale, total === 1 ? "memory.source.ready.one" : "memory.source.ready.many", {
      count: total
    });
  }
  if (available > 0) {
    return settingsT(locale, "memory.source.someReady", { available, total });
  }
  return settingsT(locale, total === 1 ? "memory.source.unavailable.one" : "memory.source.unavailable.many", {
    count: total
  });
}

export function describeRecallReason(reason: string, locale?: SettingsLocale): string {
  const trimmed = reason.trim();
  if (trimmed.length === 0) {
    return settingsT(locale, "memory.recall.matched");
  }
  if (trimmed.startsWith("cue:")) {
    const cue = trimmed.slice("cue:".length).trim();
    return cue.length > 0
      ? settingsT(locale, "memory.recall.cue", { cue })
      : settingsT(locale, "memory.recall.cueFallback");
  }
  if (trimmed === "semantic_match") {
    return settingsT(locale, "memory.recall.semantic");
  }
  return trimmed
    .replace(/[_-]+/gu, " ")
    .replace(/\s+/gu, " ")
    .replace(/^\w/u, (letter) => letter.toUpperCase());
}

export function describeSourcePassageHeading(passage: DesktopMemorySourcePassage, locale?: SettingsLocale): string {
  if (passage.status !== "available") {
    return settingsT(locale, "memory.source.heading.unavailable");
  }
  switch (passage.role) {
    case "assistant":
      return settingsT(locale, "memory.source.heading.assistant");
    case "user":
      return settingsT(locale, "memory.source.heading.user");
    case "system":
      return settingsT(locale, "memory.source.heading.system");
    case "event":
      return settingsT(locale, "memory.source.heading.event");
    default:
      return settingsT(locale, "memory.source.heading.conversation");
  }
}

export function describeSourcePassageStatus(passage: DesktopMemorySourcePassage, locale?: SettingsLocale): string {
  if (passage.status === "available") {
    return settingsT(locale, "memory.source.status.saved");
  }
  if (passage.status === "missing") {
    return settingsT(locale, "memory.source.status.missing");
  }
  return settingsT(locale, "memory.source.status.unavailable");
}

export function describeSourcePassageMeta(passage: DesktopMemorySourcePassage, locale?: SettingsLocale): string {
  const timestamp = passage.createdAt ? formatMemoryTimestamp(passage.createdAt) : "";
  const suffix = passage.observationSource
    ? locale === "zh-CN"
      ? " · 来源：用户主动截图/观察问答中确认的信息"
      : " · Source: user-confirmed screenshot/observation Q&A"
    : "";
  if (passage.status === "available") {
    const base = timestamp
      ? settingsT(locale, "memory.source.meta.availableWithTime", { timestamp })
      : settingsT(locale, "memory.source.meta.available");
    return `${base}${suffix}`;
  }
  if (passage.status === "missing") {
    return timestamp
      ? settingsT(locale, "memory.source.meta.missingWithTime", { timestamp })
      : settingsT(locale, "memory.source.meta.missing");
  }
  return timestamp
    ? settingsT(locale, "memory.source.meta.unavailableWithTime", { timestamp })
    : settingsT(locale, "memory.source.meta.unavailable");
}

export function describeSourcePassageBody(
  passage: DesktopMemorySourcePassage,
  limit = defaultSourcePassageDisplayLimit,
  locale?: SettingsLocale
): string {
  if (passage.status !== "available") {
    return passage.message ?? settingsT(locale, "memory.source.body.missing");
  }
  const normalized = (passage.text ?? "").trim();
  if (normalized.length === 0) {
    return settingsT(locale, "memory.source.body.empty");
  }
  if (normalized.length <= limit) {
    return normalized;
  }
  return `${normalized.slice(0, limit).trimEnd()}...`;
}

export function isSourcePassageShortened(
  passage: DesktopMemorySourcePassage,
  limit = defaultSourcePassageDisplayLimit
): boolean {
  return passage.status === "available" && (passage.text ?? "").trim().length > limit;
}

export function formatMemoryTimestamp(timestamp: string): string {
  const parsed = Date.parse(timestamp);
  if (Number.isNaN(parsed)) {
    return timestamp;
  }
  return new Date(parsed).toISOString().slice(0, 16).replace("T", " ");
}
