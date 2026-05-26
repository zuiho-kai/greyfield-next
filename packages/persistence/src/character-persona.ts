import { readFile } from "node:fs/promises";
import { parse } from "yaml";
import type { CharacterPersona } from "@greyfield/core-runtime";

export async function loadCharacterPersona(path: string): Promise<CharacterPersona> {
  const raw = await readFile(path, "utf8");
  return parseCharacterPersona(parse(raw), path);
}

function parseCharacterPersona(value: unknown, path: string): CharacterPersona {
  if (!isRecord(value)) {
    throw new Error(`Character persona file must contain an object: ${path}`);
  }

  const name = readString(value.name, "name", path);
  const tone = readString(value.tone, "tone", path);
  const boundaries = readStringArray(value.boundaries, "boundaries", path);
  const expressionMap = readStringRecord(value.expressionMap, "expressionMap", path);

  return {
    name,
    tone,
    boundaries,
    expressionMap
  };
}

function readString(value: unknown, field: string, path: string): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`Character persona ${field} must be a non-empty string: ${path}`);
  }
  return value;
}

function readStringArray(value: unknown, field: string, path: string): string[] {
  if (!Array.isArray(value) || !value.every((item) => typeof item === "string")) {
    throw new Error(`Character persona ${field} must be a string array: ${path}`);
  }
  return value;
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
      return [key, item];
    })
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
