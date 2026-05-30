import { existsSync, realpathSync } from "node:fs";
import { mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { platform as currentPlatform, arch as currentArch } from "node:os";
import { dirname, join } from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const electronPackageJson = realpathSync(require.resolve("electron/package.json"));
const electronRequire = createRequire(electronPackageJson);
const { version } = require(electronPackageJson);
const { downloadArtifact } = electronRequire("@electron/get");
const extract = electronRequire("extract-zip");
const electronPackageDir = dirname(electronPackageJson);
const pathFile = join(electronPackageDir, "path.txt");
const distDir = join(electronPackageDir, "dist");

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });

async function main() {
  await ensureElectronInstalled();
}

async function ensureElectronInstalled() {
  console.log(`[ensure-electron] packageDir=${electronPackageDir}`);
  console.log(`[ensure-electron] expected=${join(distDir, getPlatformPath())}`);
  if (!(await hasElectronExecutable())) {
    await runInstall(false);
  }
  if (!(await hasElectronExecutable())) {
    await runInstall(true);
  }
  if (!(await hasElectronExecutable())) {
    throw new Error(
      `Electron binary is still missing after install; packageDir=${electronPackageDir}; expected=${join(distDir, getPlatformPath())}`
    );
  }
  console.log(`[ensure-electron] ready=${join(distDir, getPlatformPath())}`);
}

async function hasElectronExecutable() {
  if (!existsSync(pathFile)) {
    return false;
  }
  const relativeExecutable = (await readFile(pathFile, "utf8")).trim();
  if (!relativeExecutable) {
    return false;
  }
  return existsSync(join(electronPackageDir, "dist", relativeExecutable));
}

async function runInstall(forceNoCache) {
  if (forceNoCache) {
    await rm(distDir, { recursive: true, force: true });
  }
  await mkdir(distDir, { recursive: true });
  const zipPath = await downloadArtifact({
    version,
    artifactName: "electron",
    force: forceNoCache,
    cacheRoot: process.env.electron_config_cache,
    checksums:
      process.env.electron_use_remote_checksums || process.env.npm_config_electron_use_remote_checksums
        ? undefined
        : require(join(electronPackageDir, "checksums.json")),
    platform: process.env.ELECTRON_INSTALL_PLATFORM || process.env.npm_config_platform || currentPlatform(),
    arch: process.env.ELECTRON_INSTALL_ARCH || process.env.npm_config_arch || currentArch()
  });
  console.log(`[ensure-electron] zip=${zipPath}`);
  await extract(zipPath, { dir: distDir });
  await writeFile(pathFile, getPlatformPath());
  const entries = await readdir(distDir).catch(() => []);
  console.log(`[ensure-electron] dist=${entries.slice(0, 8).join(",")}`);
}

function getPlatformPath() {
  const targetPlatform = process.env.ELECTRON_INSTALL_PLATFORM || process.env.npm_config_platform || currentPlatform();

  switch (targetPlatform) {
    case "mas":
    case "darwin":
      return "Electron.app/Contents/MacOS/Electron";
    case "freebsd":
    case "openbsd":
    case "linux":
      return "electron";
    case "win32":
      return "electron.exe";
    default:
      throw new Error(`Electron builds are not available on platform: ${targetPlatform}`);
  }
}
