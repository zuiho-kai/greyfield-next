import { spawn } from "node:child_process";
import { existsSync, realpathSync } from "node:fs";
import { dirname, join } from "node:path";
import { createRequire } from "node:module";
import { platform as currentPlatform } from "node:os";

export async function getElectronExecutablePath(desktopRoot: string): Promise<string> {
  const desktopRequire = createRequire(join(desktopRoot, "package.json"));
  const electronPackageJson = realpathSync(desktopRequire.resolve("electron/package.json"));
  const electronPackageDir = dirname(electronPackageJson);
  const executablePath = join(electronPackageDir, "dist", getPlatformExecutableName());
  const installScript = join(desktopRoot, "scripts", "ensure-electron-binary.mjs");

  if (!existsSync(executablePath)) {
    await runInstallScript(installScript, desktopRoot);
  }
  if (!existsSync(executablePath)) {
    throw new Error(`Electron binary is still missing after install; executablePath=${executablePath}`);
  }
  return executablePath;
}

async function runInstallScript(installScript: string, desktopRoot: string): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const child = spawn(process.execPath, [installScript], {
      cwd: desktopRoot,
      env: process.env,
      stdio: "inherit"
    });
    child.on("error", reject);
    child.on("exit", (code, signal) => {
      if (code === 0) {
        resolve();
        return;
      }
      reject(new Error(`Electron install helper failed with code=${code} signal=${signal ?? ""}`));
    });
  });
}

function getPlatformExecutableName(): string {
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
