import { isAbsolute, join } from "node:path";
import type { GreyfieldConfig } from "@greyfield/persistence/config-schema";
import { JsonlSessionStore, JsonlSummarySegmentStore, loadCharacterPersona, MarkdownMemoryStore } from "@greyfield/persistence";
import type { RuntimeServiceOptions } from "./runtime-service";

export interface DesktopRuntimeStoreOptions {
  userDataPath: string;
  projectRoot: string;
}

export function createDesktopRuntimeStoreOptions(options: DesktopRuntimeStoreOptions): Pick<
  RuntimeServiceOptions,
  "loadPersona" | "memoryStore" | "sessionStore" | "summarySegmentStore"
> {
  return {
    loadPersona: (config) => loadCharacterPersona(resolveCharacterPath(config, options.projectRoot)),
    memoryStore: new MarkdownMemoryStore(join(options.projectRoot, "data", "memory.md")),
    sessionStore: new JsonlSessionStore("desktop-main-session", join(options.userDataPath, "sessions", "desktop-main-session.jsonl")),
    summarySegmentStore: new JsonlSummarySegmentStore(join(options.userDataPath, "memory", "summary-segments.jsonl"))
  };
}

function resolveCharacterPath(config: GreyfieldConfig, projectRoot: string): string {
  return isAbsolute(config.characterFile) ? config.characterFile : join(projectRoot, config.characterFile);
}
