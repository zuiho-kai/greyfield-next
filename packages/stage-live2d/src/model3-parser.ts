export interface ParsedModel3Manifest {
  version: number;
  moc: string;
  textures: string[];
  expressions: Array<{
    name: string;
    file: string;
  }>;
  motions: Record<string, string[]>;
}

interface Model3Json {
  Version?: unknown;
  FileReferences?: {
    Moc?: unknown;
    Textures?: unknown;
    Expressions?: unknown;
    Motions?: unknown;
  };
}

export function parseModel3Manifest(raw: unknown): ParsedModel3Manifest {
  if (!isObject(raw)) {
    throw new Error("Live2D model3 manifest must be a JSON object");
  }

  const model3 = raw as Model3Json;
  if (!isObject(model3.FileReferences)) {
    throw new Error("Live2D model3 manifest is missing FileReferences");
  }

  return {
    version: typeof model3.Version === "number" ? model3.Version : 3,
    moc: readString(model3.FileReferences.Moc, "FileReferences.Moc"),
    textures: readStringArray(model3.FileReferences.Textures),
    expressions: readExpressions(model3.FileReferences.Expressions),
    motions: readMotions(model3.FileReferences.Motions)
  };
}

function readExpressions(value: unknown): ParsedModel3Manifest["expressions"] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.map((entry, index) => {
    if (!isObject(entry)) {
      throw new Error(`Expression entry ${index} must be an object`);
    }
    return {
      name: readString(entry.Name, `Expressions[${index}].Name`),
      file: readString(entry.File, `Expressions[${index}].File`)
    };
  });
}

function readMotions(value: unknown): Record<string, string[]> {
  if (!isObject(value)) {
    return {};
  }

  const motions: Record<string, string[]> = {};
  for (const [group, entries] of Object.entries(value)) {
    if (!Array.isArray(entries)) {
      motions[group] = [];
      continue;
    }
    motions[group] = entries.map((entry, index) => {
      if (!isObject(entry)) {
        throw new Error(`Motion entry ${group}[${index}] must be an object`);
      }
      return readString(entry.File, `Motions.${group}[${index}].File`);
    });
  }
  return motions;
}

function readStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.map((entry, index) => readString(entry, `Textures[${index}]`));
}

function readString(value: unknown, path: string): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`Live2D model3 manifest ${path} must be a non-empty string`);
  }
  return value;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
