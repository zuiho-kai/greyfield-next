import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const electronPackageJson = require.resolve("electron/package.json");
const electronPackageDir = dirname(electronPackageJson);
const installScript = join(electronPackageDir, "install.js");
const pathFile = join(electronPackageDir, "path.txt");

await ensureElectronInstalled();

async function ensureElectronInstalled() {
  if (!(await hasElectronExecutable())) {
    await runInstall(false);
  }
  if (!(await hasElectronExecutable())) {
    await runInstall(true);
  }
  if (!(await hasElectronExecutable())) {
    throw new Error(`Electron binary is still missing after install; packageDir=${electronPackageDir}`);
  }
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
  await new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [installScript], {
      cwd: electronPackageDir,
      env: {
        ...process.env,
        ...(forceNoCache ? { force_no_cache: "true" } : {})
      },
      stdio: "inherit"
    });
    child.on("error", reject);
    child.on("exit", (code, signal) => {
      if (code === 0) {
        resolve();
        return;
      }
      reject(new Error(`Electron install failed with code=${code} signal=${signal ?? ""}`));
    });
  });
}
