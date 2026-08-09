import { randomUUID } from "node:crypto";
import { access, link, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { basename, dirname, join, resolve } from "node:path";

export interface ResolveDesktopPathsOptions {
  isPackaged: boolean;
  currentDir: string;
  resourcesPath: string;
  userDataPath: string;
  env: Readonly<Record<string, string | undefined>>;
}

export interface DesktopPaths {
  isPackaged: boolean;
  userDataPath: string;
  projectRoot: string;
  bootstrapRoot?: string;
  configPath: string;
  sessionPath: string;
  characterPath: string;
  memorySeedPath: string;
}

interface BootstrapEntry {
  label: string;
  source: string;
  target: string;
}

export function resolveDesktopPaths(options: ResolveDesktopPathsOptions): DesktopPaths {
  const configuredUserData = options.env.GREYFIELD_USER_DATA_PATH?.trim();
  const userDataPath = resolve(configuredUserData || options.userDataPath);
  const projectRoot = options.isPackaged
    ? userDataPath
    : resolve(options.env.GREYFIELD_PROJECT_ROOT?.trim() || join(options.currentDir, "..", "..", ".."));
  const configPath = options.isPackaged
    ? join(userDataPath, "greyfield.config.json")
    : resolve(options.env.GREYFIELD_CONFIG_PATH?.trim() || join(userDataPath, "greyfield.config.json"));

  return {
    isPackaged: options.isPackaged,
    userDataPath,
    projectRoot,
    ...(options.isPackaged ? { bootstrapRoot: join(resolve(options.resourcesPath), "bootstrap") } : {}),
    configPath,
    sessionPath: join(userDataPath, "sessions", "desktop-main-session.jsonl"),
    characterPath: join(projectRoot, "characters", "greyfield.yaml"),
    memorySeedPath: join(projectRoot, "data", "memory.md")
  };
}

export async function ensurePackagedBootstrap(paths: DesktopPaths): Promise<void> {
  if (!paths.isPackaged || !paths.bootstrapRoot) {
    return;
  }

  const entries: BootstrapEntry[] = [
    {
      label: "characters/greyfield.yaml",
      source: join(paths.bootstrapRoot, "characters", "greyfield.yaml"),
      target: paths.characterPath
    },
    {
      label: "data/memory.md",
      source: join(paths.bootstrapRoot, "data", "memory.md"),
      target: paths.memorySeedPath
    }
  ];
  const missing: Array<BootstrapEntry & { contents: Buffer }> = [];

  for (const entry of entries) {
    if (await pathExists(entry.target)) {
      continue;
    }
    try {
      missing.push({ ...entry, contents: await readFile(entry.source) });
    } catch (error) {
      throw createBootstrapError(entry.label, error);
    }
  }

  const staged: Array<BootstrapEntry & { temporary: string }> = [];
  const createdTargets: string[] = [];
  let activeEntry: BootstrapEntry | undefined;
  try {
    for (const entry of missing) {
      activeEntry = entry;
      await mkdir(dirname(entry.target), { recursive: true });
      const temporary = join(dirname(entry.target), `.${basename(entry.target)}.bootstrap-${randomUUID()}`);
      await writeFile(temporary, entry.contents, { flag: "wx" });
      staged.push({ ...entry, temporary });
    }
    for (const entry of staged) {
      activeEntry = entry;
      try {
        await link(entry.temporary, entry.target);
        createdTargets.push(entry.target);
      } catch (error) {
        if (!isNodeError(error) || error.code !== "EEXIST") {
          throw error;
        }
      }
    }
    await Promise.all(staged.map((entry) => rm(entry.temporary, { force: true })));
  } catch (error) {
    await Promise.allSettled([
      ...staged.map((entry) => rm(entry.temporary, { force: true })),
      ...createdTargets.map((target) => rm(target, { force: true }))
    ]);
    throw createBootstrapError(activeEntry?.label ?? "bootstrap", error);
  }
}

async function pathExists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch (error) {
    if (isNodeError(error) && error.code === "ENOENT") {
      return false;
    }
    throw createBootstrapError("writable target", error);
  }
}

function createBootstrapError(label: string, error: unknown): Error {
  const code = isNodeError(error) && error.code ? ` (${error.code})` : "";
  return new Error(`Packaged bootstrap failed for ${label}${code}.`);
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error;
}
