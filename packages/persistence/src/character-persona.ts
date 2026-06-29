import { readFile, writeFile } from "node:fs/promises";
import { parse, stringify } from "yaml";
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
  const content = stringify(
    {
      name: normalized.name,
      userAddress: normalized.userAddress,
      background: normalized.background,
      personality: normalized.personality,
      speakingStyle: normalized.speakingStyle,
      tone: normalized.tone,
      boundaries: normalized.boundaries,
      greeting: normalized.greeting,
      expressionMap: normalized.expressionMap
    },
    { lineWidth: 0 }
  );
  await writeFile(path, content, "utf8");
  return normalized;
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
  const name = readString(persona.name, "name", path);
  const tone = readOptionalString(persona.tone, "tone", path) ?? defaultPersonaTone;
  const userAddress = readOptionalString(persona.userAddress, "userAddress", path) ?? defaultUserAddress;
  const background = readOptionalString(persona.background, "background", path) ?? defaultBackground;
  const personality = readOptionalString(persona.personality, "personality", path) ?? tone;
  const speakingStyle = readOptionalString(persona.speakingStyle, "speakingStyle", path) ?? tone;
  const boundaries = readStringArray(persona.boundaries, "boundaries", path);
  const greeting = readOptionalString(persona.greeting, "greeting", path) ?? defaultGreeting;
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
