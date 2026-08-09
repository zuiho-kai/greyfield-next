import { builtinModules } from "node:module";
import { cp, mkdir, readFile, readdir, rm, stat, writeFile } from "node:fs/promises";
import { dirname, extname, join, relative, resolve } from "node:path";
import { pathToFileURL } from "node:url";

const portableVersion = "0.1.0-preview.1";
const allowedBareImports = new Set([
  "electron",
  ...builtinModules,
  ...builtinModules.map((name) => `node:${name}`)
]);
const textExtensions = new Set([".cjs", ".css", ".html", ".js", ".json", ".md", ".mjs", ".txt", ".yaml", ".yml"]);
const forbiddenContent = /better-sqlite3|sqlite-vss|(?:^|[^A-Za-z])playwright(?:[^A-Za-z]|$)/iu;
const nativeAddonLiteral = /(?:^|[\\/"'`])[^\\/"'`\s]+\.node(?:["'`\s,;)]|$)/imu;
const importSpecifierPatterns = [
  /^\s*import\s+(?:[^"'\n]+?\s+from\s+)?["']([^"']+)["']/gmu,
  /\bexport\s+(?:\*|\{[^}]*\})\s*(?:as\s+[^\s]+\s*)?from\s*["']([^"']+)["']/gmu,
  /\brequire\s*\(\s*["']([^"']+)["']\s*\)/gu,
  /\bimport\s*\(\s*["']([^"']+)["']\s*\)/gu
];

export async function assertProductionBundleSafe({ mainPath, preloadPath, workspaceRoot }) {
  for (const path of [mainPath, preloadPath]) {
    const contents = await readFile(path, "utf8");
    const relativePath = relative(workspaceRoot, path).replaceAll("\\", "/");
    assertNoWorkspacePath(contents, workspaceRoot, relativePath);
    if (forbiddenContent.test(contents) || nativeAddonLiteral.test(contents)) {
      throw new Error(`Portable bundle gate rejected forbidden runtime content in ${relativePath}.`);
    }
    for (const pattern of importSpecifierPatterns) {
      pattern.lastIndex = 0;
      for (const match of contents.matchAll(pattern)) {
        const specifier = match[1];
        if (isBareSpecifier(specifier) && !allowedBareImports.has(specifier)) {
          throw new Error(`Portable bundle gate rejected bare import ${JSON.stringify(specifier)} in ${relativePath}.`);
        }
      }
    }
  }
}

export async function prepareWindowsPortableStage(options = {}) {
  const workspaceRoot = resolve(options.workspaceRoot ?? process.cwd());
  const desktopRoot = join(workspaceRoot, "apps", "desktop");
  const mainPath = join(desktopRoot, "dist-main", "index.mjs");
  const preloadPath = join(desktopRoot, "dist-preload", "index.cjs");
  const rendererRoot = join(desktopRoot, "dist-renderer");
  const stageRoot = join(workspaceRoot, ".cache", "greyfield-windows-portable", "app");

  await assertProductionBundleSafe({ mainPath, preloadPath, workspaceRoot });
  await rm(stageRoot, { recursive: true, force: true });
  await mkdir(stageRoot, { recursive: true });

  await copyFile(mainPath, join(stageRoot, "dist-main", "index.mjs"));
  await copyFile(preloadPath, join(stageRoot, "dist-preload", "index.cjs"));
  await copyTree(rendererRoot, join(stageRoot, "dist-renderer"), (source) => extname(source).toLowerCase() !== ".map");
  await copyFile(
    join(workspaceRoot, "characters", "greyfield.yaml"),
    join(stageRoot, "bootstrap", "characters", "greyfield.yaml")
  );
  await copyFile(join(workspaceRoot, "data", "memory.md"), join(stageRoot, "bootstrap", "data", "memory.md"));
  await writeFile(
    join(stageRoot, "package.json"),
    `${JSON.stringify(
      {
        name: "greyfield-next",
        productName: "Greyfield",
        version: portableVersion,
        main: "dist-main/index.mjs",
        dependencies: {}
      },
      null,
      2
    )}\n`,
    "utf8"
  );

  const files = await listFiles(stageRoot);
  await assertStageAllowlist({ stageRoot, files, workspaceRoot });
  return { stageRoot, files };
}

export async function findWindowsPortableArtifact(options = {}) {
  const workspaceRoot = resolve(options.workspaceRoot ?? process.cwd());
  const artifactsDir = resolve(
    options.artifactsDir ?? join(workspaceRoot, ".cache", "greyfield-windows-portable", "artifacts")
  );
  const expectedFileName = `Greyfield-${portableVersion}-win-x64-portable.exe`;
  const entries = await readdir(artifactsDir, { withFileTypes: true });
  const artifacts = entries.filter((entry) => entry.isFile() && entry.name.toLowerCase().endsWith(".exe"));
  if (artifacts.length !== 1 || artifacts[0].name !== expectedFileName) {
    throw new Error(
      `Expected exactly ${expectedFileName}; found ${artifacts.map((entry) => entry.name).join(", ") || "none"}.`
    );
  }
  return join(artifactsDir, expectedFileName);
}

async function assertStageAllowlist({ stageRoot, files, workspaceRoot }) {
  const required = [
    "package.json",
    "dist-main/index.mjs",
    "dist-preload/index.cjs",
    "dist-renderer/index.html",
    "bootstrap/characters/greyfield.yaml",
    "bootstrap/data/memory.md"
  ];
  for (const path of required) {
    if (!files.includes(path)) {
      throw new Error(`Portable stage is missing ${path}.`);
    }
  }
  for (const path of files) {
    if (
      path.endsWith(".map") ||
      path.includes("node_modules/") ||
      path.includes("/.cache/") ||
      /(?:^|\/)(?:src|test|tests|__tests__)(?:\/|$)/u.test(path) ||
      /(?:^|\/)playwright(?:\/|$)/iu.test(path) ||
      path.endsWith(".node")
    ) {
      throw new Error(`Portable stage rejected unexpected file ${path}.`);
    }
    const absolutePath = join(stageRoot, path);
    if (textExtensions.has(extname(path).toLowerCase())) {
      const contents = await readFile(absolutePath, "utf8");
      assertNoWorkspacePath(contents, workspaceRoot, path);
      if (forbiddenContent.test(contents) || nativeAddonLiteral.test(contents)) {
        throw new Error(`Portable stage rejected forbidden content in ${path}.`);
      }
    }
  }
}

async function copyTree(sourceRoot, targetRoot, filter) {
  const sourceStats = await stat(sourceRoot);
  if (!sourceStats.isDirectory()) {
    throw new Error("Portable stage renderer source is not a directory.");
  }
  await cp(sourceRoot, targetRoot, { recursive: true, filter });
}

async function copyFile(source, target) {
  await mkdir(dirname(target), { recursive: true });
  await cp(source, target);
}

async function listFiles(root, current = root) {
  const entries = await readdir(current, { withFileTypes: true });
  const files = [];
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

function assertNoWorkspacePath(contents, workspaceRoot, relativePath) {
  const variants = new Set([
    workspaceRoot,
    JSON.stringify(workspaceRoot).slice(1, -1),
    workspaceRoot.replaceAll("\\", "/"),
    pathToFileURL(workspaceRoot).href.replace(/\/$/u, "")
  ]);
  for (const variant of variants) {
    if (variant && contents.includes(variant)) {
      throw new Error(`Portable stage rejected an absolute workspace path in ${relativePath}.`);
    }
  }
}

function isBareSpecifier(specifier) {
  return !specifier.startsWith(".") && !specifier.startsWith("/") && !specifier.startsWith("file:");
}

const executedPath = process.argv[1] ? pathToFileURL(resolve(process.argv[1])).href : undefined;
if (executedPath === import.meta.url) {
  const result = await prepareWindowsPortableStage();
  process.stdout.write(`Prepared Windows portable stage with ${result.files.length} files.\n`);
}
