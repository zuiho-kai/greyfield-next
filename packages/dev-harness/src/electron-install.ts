import { existsSync } from "node:fs";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { platform as currentPlatform, arch as currentArch } from "node:os";
import { dirname, join } from "node:path";
import { createRequire } from "node:module";

export async function ensureElectronBinary(desktopRoot: string): Promise<void> {
  const desktopRequire = createRequire(join(desktopRoot, "package.json"));
  const electronPackageJson = desktopRequire.resolve("electron/package.json");
  const electronRequire = createRequire(electronPackageJson);
  const { version } = desktopRequire(electronPackageJson) as { version: string };
  const { downloadArtifact } = electronRequire("@electron/get") as {
    downloadArtifact(options: {
      version: string;
      artifactName: string;
      force: boolean;
      cacheRoot: string | undefined;
      checksums: unknown;
      platform: string;
      arch: string;
    }): Promise<string>;
  };
  const extract = electronRequire("extract-zip") as (zipPath: string, options: { dir: string }) => Promise<void>;
  const electronPackageDir = dirname(electronPackageJson);
  const pathFile = join(electronPackageDir, "path.txt");
  const distDir = join(electronPackageDir, "dist");

  const hasElectronExecutable = async () => {
    if (!existsSync(pathFile)) {
      return false;
    }
    const relativeExecutable = (await readFile(pathFile, "utf8")).trim();
    if (!relativeExecutable) {
      return false;
    }
    return existsSync(join(electronPackageDir, "dist", relativeExecutable));
  };

  const installElectron = async (forceNoCache: boolean) => {
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
          : desktopRequire(join(electronPackageDir, "checksums.json")),
      platform: process.env.ELECTRON_INSTALL_PLATFORM || process.env.npm_config_platform || currentPlatform(),
      arch: process.env.ELECTRON_INSTALL_ARCH || process.env.npm_config_arch || currentArch()
    });
    await extract(zipPath, { dir: distDir });
    await writeFile(pathFile, getPlatformPath());
  };

  if (!(await hasElectronExecutable())) {
    await installElectron(false);
  }
  if (!(await hasElectronExecutable())) {
    await installElectron(true);
  }
  if (!(await hasElectronExecutable())) {
    throw new Error(
      `Electron binary is still missing after install; packageDir=${electronPackageDir}; expected=${join(distDir, getPlatformPath())}`
    );
  }
}

function getPlatformPath(): string {
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
