import { mkdtemp, mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, relative } from "node:path";
import { pathToFileURL } from "node:url";
import { afterEach, describe, expect, it } from "vitest";

interface PortableStageModule {
  assertProductionBundleSafe(options: {
    mainPath: string;
    preloadPath: string;
    workspaceRoot: string;
  }): Promise<void>;
  prepareWindowsPortableStage(options?: { workspaceRoot?: string }): Promise<{
    stageRoot: string;
    files: string[];
  }>;
}

const temporaryRoots: string[] = [];

async function createTemporaryRoot(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "greyfield-portable-stage-"));
  temporaryRoots.push(root);
  return root;
}

async function writeFixture(root: string, relativePath: string, contents: string | Uint8Array): Promise<void> {
  const path = join(root, relativePath);
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, contents);
}

async function loadStageModule(): Promise<PortableStageModule> {
  const modulePath = join(process.cwd(), "scripts", "prepare-windows-portable-stage.mjs");
  return import(pathToFileURL(modulePath).href) as Promise<PortableStageModule>;
}

async function listFiles(root: string, current = root): Promise<string[]> {
  const entries = await readdir(current, { withFileTypes: true });
  const files: string[] = [];
  for (const entry of entries) {
    const path = join(current, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await listFiles(root, path)));
    } else {
      files.push(relative(root, path).replaceAll("\\", "/"));
    }
  }
  return files.sort();
}

describe("Windows portable stage", () => {
  afterEach(async () => {
    await Promise.all(temporaryRoots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
  });

  it("keeps production main free of native and third-party runtime imports", async () => {
    const buildMain = await readFile(join(process.cwd(), "apps", "desktop", "scripts", "build-main.mjs"), "utf8");
    const runtimeService = await readFile(join(process.cwd(), "apps", "desktop", "src", "main", "runtime-service.ts"), "utf8");

    expect(buildMain).toMatch(/external:\s*\[\s*["']electron["']\s*\]/u);
    expect(buildMain).not.toMatch(/better-sqlite3|sqlite-vss/u);
    expect(runtimeService).toContain("initializeMemoryStoresV2?:");
    expect(runtimeService).not.toMatch(/import\s*\{[^}]*initializeMemoryStoresV2[^}]*\}\s*from\s*["']\.\/memory-v2-init["']/su);
  });

  it("rejects third-party, native, and workspace references in production bundles", async () => {
    const root = await createTemporaryRoot();
    const mainPath = join(root, "dist-main", "index.mjs");
    const preloadPath = join(root, "dist-preload", "index.cjs");
    await writeFixture(root, "dist-preload/index.cjs", 'require("electron"); require("node:path");\n');
    const { assertProductionBundleSafe } = await loadStageModule();

    for (const forbidden of [
      'import "better-sqlite3";',
      'require("sqlite-vss");',
      'import "left-pad";',
      'export * from "left-pad";',
      'export { default as pad } from "left-pad";',
      'const native = "addon.node";',
      `const source = ${JSON.stringify(root)};`
    ]) {
      await writeFixture(root, "dist-main/index.mjs", forbidden);
      await expect(assertProductionBundleSafe({ mainPath, preloadPath, workspaceRoot: root })).rejects.toThrow();
    }
  });

  it("rebuilds an allowlisted dependency-free stage and proves builder resources exist", async () => {
    const root = await createTemporaryRoot();
    await writeFixture(root, "apps/desktop/dist-main/index.mjs", 'import "electron"; import "node:path";\n');
    await writeFixture(root, "apps/desktop/dist-preload/index.cjs", 'require("electron");\n');
    await writeFixture(root, "apps/desktop/dist-renderer/index.html", "<main>Greyfield</main>");
    await writeFixture(root, "apps/desktop/dist-renderer/assets/app.js", "console.log('greyfield')");
    await writeFixture(root, "apps/desktop/dist-renderer/assets/app.js.map", "source map");
    await writeFixture(root, "apps/desktop/dist-renderer/assets/live2d/model/runtime.model3.json", "{}");
    await writeFixture(root, "characters/greyfield.yaml", "name: Greyfield\n");
    await writeFixture(root, "data/memory.md", "# Memory\n");
    await writeFixture(root, ".cache/greyfield-windows-portable/app/stale.txt", "stale");
    const { prepareWindowsPortableStage } = await loadStageModule();

    const result = await prepareWindowsPortableStage({ workspaceRoot: root });
    const files = await listFiles(result.stageRoot);
    expect(files).toEqual([
      "bootstrap/characters/greyfield.yaml",
      "bootstrap/data/memory.md",
      "dist-main/index.mjs",
      "dist-preload/index.cjs",
      "dist-renderer/assets/app.js",
      "dist-renderer/assets/live2d/model/runtime.model3.json",
      "dist-renderer/index.html",
      "package.json"
    ]);
    expect(files).not.toContain("stale.txt");
    expect(files.some((file) => file.endsWith(".map"))).toBe(false);
    const packageJson = JSON.parse(await readFile(join(result.stageRoot, "package.json"), "utf8"));
    expect(packageJson).toEqual({
      name: "greyfield-next",
      productName: "Greyfield",
      version: "0.1.0-preview.1",
      main: "dist-main/index.mjs",
      dependencies: {}
    });

    const builderYaml = await readFile(join(process.cwd(), "electron-builder.yml"), "utf8");
    expect(builderYaml).toContain("electronVersion: 42.2.0");
    const resourceSources = [...builderYaml.matchAll(/^\s*- from:\s*(.+)$/gmu)].map((match) => match[1]!.trim());
    expect(resourceSources).toEqual([
      ".cache/greyfield-windows-portable/app/bootstrap/characters",
      ".cache/greyfield-windows-portable/app/bootstrap/data"
    ]);
    for (const source of resourceSources) {
      await expect(readdir(join(root, source))).resolves.not.toHaveLength(0);
    }
  });

  it("exposes the exact package, harness, and verification commands", async () => {
    const packageJson = JSON.parse(await readFile(join(process.cwd(), "package.json"), "utf8"));
    expect(packageJson.version).toBe("0.1.0-preview.1");
    expect(packageJson.scripts["package:windows:portable"]).toBe(
      "pnpm build:desktop && node scripts/prepare-windows-portable-stage.mjs && electron-builder --config electron-builder.yml --win portable --x64"
    );
    expect(packageJson.scripts["harness:windows:portable"]).toBe(
      "tsx packages/dev-harness/src/windows-portable-smoke.ts"
    );
    expect(packageJson.scripts["verify:windows:portable"]).toBe(
      "pnpm test -- apps/desktop/src/main/__tests__/desktop-paths.test.ts packages/dev-harness/src/__tests__/windows-portable-stage.test.ts && pnpm typecheck && pnpm package:windows:portable && pnpm harness:windows:portable"
    );
  });
});
