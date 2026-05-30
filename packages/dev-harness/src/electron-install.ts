import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { createRequire } from "node:module";

export async function ensureElectronBinary(desktopRoot: string): Promise<void> {
  const desktopRequire = createRequire(join(desktopRoot, "package.json"));
  const electronPackageJson = desktopRequire.resolve("electron/package.json");
  const electronPackageDir = dirname(electronPackageJson);
  const pathFile = join(electronPackageDir, "path.txt");
  const installScript = join(desktopRoot, "scripts", "ensure-electron-binary.mjs");

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

  if (!(await hasElectronExecutable())) {
    await runInstallScript(installScript, desktopRoot);
  }
  if (!(await hasElectronExecutable())) {
    throw new Error(`Electron binary is still missing after install; packageDir=${electronPackageDir}`);
  }
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
