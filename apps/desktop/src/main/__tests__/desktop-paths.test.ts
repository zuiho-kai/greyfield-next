import { mkdtemp, mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ensurePackagedBootstrap, resolveDesktopPaths } from "../desktop-paths";

const fsMockState = vi.hoisted(() => ({
  beforeRead: undefined as ((path: string) => Promise<void>) | undefined
}));

vi.mock("node:fs/promises", async () => {
  const actual = await vi.importActual<typeof import("node:fs/promises")>("node:fs/promises");
  return {
    ...actual,
    readFile: async (...args: unknown[]) => {
      await fsMockState.beforeRead?.(String(args[0]));
      return Reflect.apply(actual.readFile, actual, args);
    }
  };
});

const temporaryRoots: string[] = [];

async function createTemporaryRoot(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "greyfield-desktop-paths-"));
  temporaryRoots.push(root);
  return root;
}

async function writeFixture(path: string, contents: string): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, contents, "utf8");
}

describe("desktop paths", () => {
  afterEach(async () => {
    fsMockState.beforeRead = undefined;
    await Promise.all(temporaryRoots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
  });

  it("keeps the development project root explicit and derives writable files from userData", () => {
    const paths = resolveDesktopPaths({
      isPackaged: false,
      currentDir: "C:\\work\\Greyfield-next\\apps\\desktop\\dist-main",
      resourcesPath: "C:\\electron\\resources",
      userDataPath: "C:\\Users\\tester\\AppData\\Roaming\\Greyfield",
      env: {
        GREYFIELD_PROJECT_ROOT: "D:\\greyfield-source",
        GREYFIELD_CONFIG_PATH: "D:\\greyfield-config\\config.json"
      }
    });

    expect(paths.projectRoot).toBe("D:\\greyfield-source");
    expect(paths.configPath).toBe("D:\\greyfield-config\\config.json");
    expect(paths.sessionPath).toBe(
      "C:\\Users\\tester\\AppData\\Roaming\\Greyfield\\sessions\\desktop-main-session.jsonl"
    );
    expect(paths.bootstrapRoot).toBeUndefined();
  });

  it("uses resources only for packaged bootstrap and userData for every writable path", () => {
    const paths = resolveDesktopPaths({
      isPackaged: true,
      currentDir: "C:\\bundle\\resources\\app.asar\\dist-main",
      resourcesPath: "C:\\bundle\\resources",
      userDataPath: "C:\\Users\\tester\\AppData\\Roaming\\Greyfield",
      env: {
        GREYFIELD_PROJECT_ROOT: "D:\\must-not-be-used",
        GREYFIELD_CONFIG_PATH: "D:\\must-not-be-used\\config.json"
      }
    });

    expect(paths.bootstrapRoot).toBe("C:\\bundle\\resources\\bootstrap");
    expect(paths.projectRoot).toBe("C:\\Users\\tester\\AppData\\Roaming\\Greyfield");
    expect(paths.configPath).toBe(
      "C:\\Users\\tester\\AppData\\Roaming\\Greyfield\\greyfield.config.json"
    );
    expect(paths.sessionPath).toContain("\\sessions\\desktop-main-session.jsonl");
    expect(paths.characterPath).toContain("\\characters\\greyfield.yaml");
    expect(paths.memorySeedPath).toContain("\\data\\memory.md");
    for (const writablePath of [
      paths.configPath,
      paths.sessionPath,
      paths.characterPath,
      paths.memorySeedPath
    ]) {
      expect(writablePath.startsWith(paths.userDataPath)).toBe(true);
      expect(writablePath).not.toContain("app.asar");
      expect(writablePath).not.toContain("\\resources\\");
    }
  });

  it("treats GREYFIELD_USER_DATA_PATH as the only packaged writable root", () => {
    const paths = resolveDesktopPaths({
      isPackaged: true,
      currentDir: "C:\\bundle\\resources\\app.asar\\dist-main",
      resourcesPath: "C:\\bundle\\resources",
      userDataPath: "C:\\default-user-data",
      env: { GREYFIELD_USER_DATA_PATH: "D:\\portable-user-data" }
    });

    expect(paths.userDataPath).toBe("D:\\portable-user-data");
    expect(paths.projectRoot).toBe("D:\\portable-user-data");
    expect(paths.configPath).toBe("D:\\portable-user-data\\greyfield.config.json");
    expect(paths.sessionPath.startsWith("D:\\portable-user-data\\")).toBe(true);
    expect(paths.characterPath.startsWith("D:\\portable-user-data\\")).toBe(true);
    expect(paths.memorySeedPath.startsWith("D:\\portable-user-data\\")).toBe(true);
  });

  it("copies packaged bootstrap files once and preserves existing bytes", async () => {
    const root = await createTemporaryRoot();
    const resourcesPath = join(root, "resources");
    const userDataPath = join(root, "user-data");
    await writeFixture(join(resourcesPath, "bootstrap", "characters", "greyfield.yaml"), "persona-v1\n");
    await writeFixture(join(resourcesPath, "bootstrap", "data", "memory.md"), "memory-v1\n");
    const paths = resolveDesktopPaths({
      isPackaged: true,
      currentDir: join(resourcesPath, "app.asar", "dist-main"),
      resourcesPath,
      userDataPath,
      env: {}
    });

    await ensurePackagedBootstrap(paths);
    expect(await readFile(paths.characterPath, "utf8")).toBe("persona-v1\n");
    expect(await readFile(paths.memorySeedPath, "utf8")).toBe("memory-v1\n");

    await writeFile(paths.characterPath, "persona-user-edited\n", "utf8");
    await writeFile(paths.memorySeedPath, "memory-user-edited\n", "utf8");
    await writeFile(join(resourcesPath, "bootstrap", "characters", "greyfield.yaml"), "persona-v2\n", "utf8");
    await writeFile(join(resourcesPath, "bootstrap", "data", "memory.md"), "memory-v2\n", "utf8");
    await ensurePackagedBootstrap(paths);

    expect(await readFile(paths.characterPath, "utf8")).toBe("persona-user-edited\n");
    expect(await readFile(paths.memorySeedPath, "utf8")).toBe("memory-user-edited\n");
  });

  it("keeps a working file created while concurrent packaged bootstraps are in flight", async () => {
    const root = await createTemporaryRoot();
    const resourcesPath = join(root, "resources");
    const userDataPath = join(root, "user-data");
    const characterSource = join(resourcesPath, "bootstrap", "characters", "greyfield.yaml");
    await writeFixture(characterSource, "persona-bootstrap\n");
    await writeFixture(join(resourcesPath, "bootstrap", "data", "memory.md"), "memory-bootstrap\n");
    const paths = resolveDesktopPaths({
      isPackaged: true,
      currentDir: join(resourcesPath, "app.asar", "dist-main"),
      resourcesPath,
      userDataPath,
      env: {}
    });

    let characterReads = 0;
    let releaseReads!: () => void;
    let confirmConcurrentReads!: () => void;
    const readGate = new Promise<void>((resolveGate) => {
      releaseReads = resolveGate;
    });
    const concurrentReads = new Promise<void>((resolveReads) => {
      confirmConcurrentReads = resolveReads;
    });
    fsMockState.beforeRead = async (path) => {
      if (path !== characterSource) {
        return;
      }
      characterReads += 1;
      if (characterReads === 2) {
        confirmConcurrentReads();
      }
      await readGate;
    };

    const firstBootstrap = ensurePackagedBootstrap(paths);
    const secondBootstrap = ensurePackagedBootstrap(paths);
    await concurrentReads;
    await writeFixture(paths.characterPath, "persona-created-concurrently\n");
    releaseReads();
    await Promise.all([firstBootstrap, secondBootstrap]);
    fsMockState.beforeRead = undefined;

    expect(await readFile(paths.characterPath, "utf8")).toBe("persona-created-concurrently\n");
    expect(await readFile(paths.memorySeedPath, "utf8")).toBe("memory-bootstrap\n");
    expect((await readdir(dirname(paths.characterPath))).some((name) => name.includes(".bootstrap-"))).toBe(false);
  });

  it("does not leave a half bootstrap and redacts broad paths when a source is missing", async () => {
    const root = await createTemporaryRoot();
    const resourcesPath = join(root, "private", "install", "resources");
    const userDataPath = join(root, "private", "profile", "user-data");
    await writeFixture(join(resourcesPath, "bootstrap", "characters", "greyfield.yaml"), "persona\n");
    const paths = resolveDesktopPaths({
      isPackaged: true,
      currentDir: join(resourcesPath, "app.asar", "dist-main"),
      resourcesPath,
      userDataPath,
      env: {}
    });

    let errorMessage = "";
    try {
      await ensurePackagedBootstrap(paths);
    } catch (error) {
      errorMessage = error instanceof Error ? error.message : String(error);
    }

    expect(errorMessage).toContain("data/memory.md");
    expect(errorMessage).not.toContain(root);
    await expect(readFile(paths.characterPath, "utf8")).rejects.toMatchObject({ code: "ENOENT" });
    await expect(readFile(paths.memorySeedPath, "utf8")).rejects.toMatchObject({ code: "ENOENT" });
  });
});
