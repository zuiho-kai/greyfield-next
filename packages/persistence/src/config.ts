import { readFile, writeFile } from "node:fs/promises";
import { defaultGreyfieldConfig, mergeConfig, type GreyfieldConfig, type GreyfieldConfigPatch } from "./config-schema";

export { defaultGreyfieldConfig, mergeConfig, type GreyfieldConfig, type GreyfieldConfigPatch };

export async function loadGreyfieldConfig(path: string): Promise<GreyfieldConfig> {
  try {
    const raw = await readFile(path, "utf8");
    return mergeConfig(JSON.parse(stripUtf8Bom(raw)) as GreyfieldConfigPatch);
  } catch (error) {
    if (isNotFoundError(error)) {
      return defaultGreyfieldConfig;
    }
    throw error;
  }
}

export async function saveGreyfieldConfig(path: string, config: GreyfieldConfig): Promise<void> {
  await writeFile(path, `${JSON.stringify(config, null, 2)}\n`, "utf8");
}

function stripUtf8Bom(raw: string): string {
  return raw.charCodeAt(0) === 0xfeff ? raw.slice(1) : raw;
}

function isNotFoundError(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && error.code === "ENOENT";
}
