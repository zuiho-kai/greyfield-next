import type { DesktopMemorySourcePassage } from "../shared/ipc";

const defaultSourcePassageDisplayLimit = 520;

export function describeMemorySourceCount(input: {
  sourcePassages?: DesktopMemorySourcePassage[];
  sourceIds?: string[];
}): string {
  const passages = input.sourcePassages ?? [];
  const fallbackCount = input.sourceIds?.length ?? 0;
  const total = passages.length > 0 ? passages.length : fallbackCount;
  if (total === 0) {
    return "No saved source";
  }

  if (passages.length === 0) {
    return `${total} saved ${pluralize("source", total)}`;
  }

  const available = passages.filter((passage) => passage.status === "available").length;
  if (available === total) {
    return `${total} source ${pluralize("passage", total)} ready`;
  }
  if (available > 0) {
    return `${available} of ${total} source passages ready`;
  }
  return `${total} saved ${pluralize("source", total)} unavailable here`;
}

export function describeRecallReason(reason: string): string {
  const trimmed = reason.trim();
  if (trimmed.length === 0) {
    return "Matched this memory";
  }
  if (trimmed.startsWith("cue:")) {
    const cue = trimmed.slice("cue:".length).trim();
    return cue.length > 0 ? `Matched recall cue "${cue}"` : "Matched a recall cue";
  }
  return trimmed
    .replace(/[_-]+/gu, " ")
    .replace(/\s+/gu, " ")
    .replace(/^\w/u, (letter) => letter.toUpperCase());
}

export function describeSourcePassageHeading(passage: DesktopMemorySourcePassage): string {
  if (passage.status !== "available") {
    return "Original message unavailable";
  }
  switch (passage.role) {
    case "assistant":
      return "From Greyfield";
    case "user":
      return "From you";
    case "system":
      return "From a local system note";
    case "event":
      return "From an app event";
    default:
      return "From the conversation";
  }
}

export function describeSourcePassageStatus(passage: DesktopMemorySourcePassage): string {
  if (passage.status === "available") {
    return "Saved locally";
  }
  if (passage.status === "missing") {
    return "Original message not found";
  }
  return "Not available in this session";
}

export function describeSourcePassageMeta(passage: DesktopMemorySourcePassage): string {
  const timestamp = passage.createdAt ? formatMemoryTimestamp(passage.createdAt) : "";
  if (passage.status === "available") {
    return timestamp ? `Saved from conversation on ${timestamp}` : "Saved from the local conversation";
  }
  if (passage.status === "missing") {
    return timestamp ? `Greyfield remembers the source from ${timestamp}` : "Greyfield saved a source link for this memory";
  }
  return timestamp
    ? `Greyfield remembers a source from another local session on ${timestamp}`
    : "Greyfield saved a source link from another local session";
}

export function describeSourcePassageBody(
  passage: DesktopMemorySourcePassage,
  limit = defaultSourcePassageDisplayLimit
): string {
  if (passage.status !== "available") {
    return passage.message ?? "The original message is not available in this local session store.";
  }
  const normalized = (passage.text ?? "").trim();
  if (normalized.length === 0) {
    return "No message text is saved for this source.";
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

function pluralize(word: string, count: number): string {
  return count === 1 ? word : `${word}s`;
}
