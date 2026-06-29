import { readFile, rename, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { isMap, parse, parseDocument } from "yaml";
import type { CharacterPersona } from "@greyfield/core-runtime";

export async function loadCharacterPersona(path: string): Promise<CharacterPersona> {
  const raw = await readFile(path, "utf8");
  try {
    return parseCharacterPersona(parse(raw), path);
  } catch (error) {
    if (error instanceof Error && error.message.startsWith("Character persona")) {
      throw error;
    }
    throw new Error(`Character persona file is invalid YAML: ${path}: ${error instanceof Error ? error.message : String(error)}`);
  }
}

export async function saveCharacterPersona(path: string, persona: CharacterPersona): Promise<CharacterPersona> {
  const normalized = normalizeCharacterPersona(persona, path);
  const document = await readPersonaDocumentForSave(path);
  for (const [field, value] of managedPersonaFields(normalized)) {
    document.set(field, value);
  }
  const tempPath = join(dirname(path), `.persona-${process.pid}-${Date.now()}.tmp`);
  await writeFile(tempPath, document.toString({ lineWidth: 0 }), "utf8");
  await rename(tempPath, path);
  return normalized;
}

async function readPersonaDocumentForSave(path: string) {
  let raw = "";
  try {
    raw = await readFile(path, "utf8");
  } catch (error) {
    if (!isFileNotFound(error)) {
      throw error;
    }
  }

  const document = parseDocument(raw);
  if (document.errors.length > 0) {
    throw new Error(`Character persona file is invalid YAML: ${path}: ${document.errors[0]?.message ?? "unknown parse error"}`);
  }
  if (raw.trim().length > 0 && !isMap(document.contents)) {
    throw new Error(`Character persona file must contain an object: ${path}`);
  }
  return document;
}

function managedPersonaFields(persona: CharacterPersona): Array<[string, unknown]> {
  return [
    ["name", persona.name],
    ["userAddress", persona.userAddress],
    ["background", persona.background],
    ["personality", persona.personality],
    ["speakingStyle", persona.speakingStyle],
    ["tone", persona.tone],
    ["boundaries", persona.boundaries],
    ["greeting", persona.greeting],
    ["expressionMap", persona.expressionMap]
  ];
}

function isFileNotFound(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && error.code === "ENOENT";
}

function parseCharacterPersona(value: unknown, path: string): CharacterPersona {
  if (!isRecord(value)) {
    throw new Error(`Character persona file must contain an object: ${path}`);
  }

  const name = readString(value.name, "name", path);
  const legacyPrompt = isRecord(value.prompt) ? value.prompt : {};
  const tone = readOptionalString(value.tone, "tone", path) ?? defaultPersonaTone;
  const promptStyle = readOptionalStringArray(legacyPrompt.style, "prompt.style", path);
  const userAddress = readOptionalString(value.userAddress, "userAddress", path) ?? defaultUserAddress;
  const background =
    readOptionalString(value.background, "background", path) ??
    readOptionalString(legacyPrompt.identity, "prompt.identity", path) ??
    defaultBackground;
  const personality = readOptionalString(value.personality, "personality", path) ?? tone;
  const speakingStyle =
    readOptionalString(value.speakingStyle, "speakingStyle", path) ??
    (promptStyle.length > 0 ? promptStyle.join(" ") : tone);
  const boundaries = readStringArray(value.boundaries, "boundaries", path);
  const greeting = readOptionalString(value.greeting, "greeting", path) ?? defaultGreeting;
  const expressionMap = readStringRecord(value.expressionMap, "expressionMap", path);

  return {
    name,
    userAddress,
    background,
    personality,
    speakingStyle,
    greeting,
    tone,
    boundaries,
    expressionMap
  };
}

function normalizeCharacterPersona(persona: CharacterPersona, path: string): CharacterPersona {
  const optional = (value: string | undefined): string | undefined => {
    const normalized = value?.trim();
    return normalized && normalized.length > 0 ? normalized : undefined;
  };
  const name = readString(persona.name, "name", path);
  const tone = readOptionalString(persona.tone, "tone", path) ?? defaultPersonaTone;
  const userAddress = readOptionalString(optional(persona.userAddress), "userAddress", path) ?? defaultUserAddress;
  const background = readOptionalString(optional(persona.background), "background", path) ?? defaultBackground;
  const personality = readOptionalString(optional(persona.personality), "personality", path) ?? tone;
  const speakingStyle = readOptionalString(optional(persona.speakingStyle), "speakingStyle", path) ?? tone;
  const boundaries = readStringArray(persona.boundaries, "boundaries", path);
  const greeting = readOptionalString(optional(persona.greeting), "greeting", path) ?? defaultGreeting;
  const expressionMap = readStringRecord(persona.expressionMap, "expressionMap", path);
  return { name, userAddress, background, personality, speakingStyle, greeting, tone, boundaries, expressionMap };
}

function readString(value: unknown, field: string, path: string): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`Character persona ${field} must be a non-empty string: ${path}`);
  }
  return value.trim();
}

function readOptionalString(value: unknown, field: string, path: string): string | undefined {
  if (value === undefined || value === null) {
    return undefined;
  }
  return readString(value, field, path);
}

function readStringArray(value: unknown, field: string, path: string): string[] {
  if (!Array.isArray(value) || !value.every((item) => typeof item === "string")) {
    throw new Error(`Character persona ${field} must be a string array: ${path}`);
  }
  return value.map((item) => {
    const normalized = item.trim();
    if (normalized.length === 0) {
      throw new Error(`Character persona ${field} must not contain empty items: ${path}`);
    }
    return normalized;
  });
}

function readOptionalStringArray(value: unknown, field: string, path: string): string[] {
  if (value === undefined || value === null) {
    return [];
  }
  return readStringArray(value, field, path);
}

function readStringRecord(value: unknown, field: string, path: string): Record<string, string> {
  if (!isRecord(value)) {
    throw new Error(`Character persona ${field} must be a string map: ${path}`);
  }
  return Object.fromEntries(
    Object.entries(value).map(([key, item]) => {
      if (typeof item !== "string") {
        throw new Error(`Character persona ${field}.${key} must be a string: ${path}`);
      }
      return [key, item.trim()];
    })
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

const defaultUserAddress = "you";
const defaultPersonaTone = "warm, concise, slightly playful";
const defaultBackground = "A Live2D desktop companion focused on presence, conversation, and continuity.";
const defaultGreeting = "你好，我在。";
