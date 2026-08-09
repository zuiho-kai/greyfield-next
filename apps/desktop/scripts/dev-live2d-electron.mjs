import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir, readdir, stat, writeFile, rm } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { setTimeout as sleep } from "node:timers/promises";
import { fileURLToPath } from "node:url";

const workspaceRoot = fileURLToPath(new URL("../../..", import.meta.url));
const desktopRoot = fileURLToPath(new URL("..", import.meta.url));
const node = process.execPath;
const pidFile = join(workspaceRoot, ".cache", "greyfield-live2d-dev-pids.json");
const devCacheRoot = join(workspaceRoot, ".cache", "greyfield-live2d-dev");
const bundledHiyoriModelPath = join(
  workspaceRoot,
  "apps",
  "desktop",
  "public",
  "assets",
  "live2d",
  "momose-hiyori",
  "runtime",
  "hiyori_free_t08.model3.json"
);
const skipBuild = process.argv.includes("--skip-build");
const forceBuild = process.argv.includes("--force-build");

export const safeDevConfigPatch = Object.freeze({
  window: {
    alwaysOnTop: true,
    clickThrough: false,
    modelPassThrough: false,
    layerMode: "follow-click",
    width: 420,
    height: 620,
    x: 80,
    y: 80
  },
  live2d: {
    modelPath: "assets/live2d/momose-hiyori/runtime/hiyori_free_t08.model3.json",
    scale: 1,
    x: 0,
    y: 0
  }
});

function run(command, args, options = {}) {
  return spawn(command, args, {
    cwd: options.cwd,
    env: { ...process.env, ...options.env },
    stdio: options.stdio ?? "inherit"
  });
}

function waitForExit(child) {
  return new Promise((resolve, reject) => {
    child.once("exit", (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`Command exited with ${code}`));
      }
    });
    child.once("error", reject);
  });
}

async function waitForServer(url) {
  const started = Date.now();
  while (Date.now() - started < 20_000) {
    try {
      const response = await fetch(url);
      if (response.ok) {
        return;
      }
    } catch {
      // Wait for Vite.
    }
    await sleep(250);
  }
  throw new Error(`Timed out waiting for ${url}`);
}

export async function shouldBuild(outputFile, sourceDirs) {
  if (forceBuild) {
    return true;
  }
  if (skipBuild) {
    return false;
  }
  if (!existsSync(outputFile)) {
    return true;
  }
  const output = await stat(outputFile);
  const newestSource = await newestMtimeMs(sourceDirs);
  return newestSource > output.mtimeMs;
}

async function newestMtimeMs(paths) {
  let newest = 0;
  for (const path of paths) {
    if (!existsSync(path)) {
      continue;
    }
    const entry = await stat(path);
    if (entry.isDirectory()) {
      const children = await readdir(path);
      newest = Math.max(
        newest,
        await newestMtimeMs(children.map((child) => join(path, child)))
      );
    } else {
      newest = Math.max(newest, entry.mtimeMs);
    }
  }
  return newest;
}

export function resolveLive2DFixturePath(options = {}) {
  const env = options.env ?? process.env;
  const exists = options.exists ?? existsSync;
  const packageFixture = options.packageFixture ?? bundledHiyoriModelPath;
  const configured = env.GREYFIELD_LIVE2D_FIXTURE;
  if (configured && exists(configured)) {
    return configured;
  }
  if (configured) {
    throw new Error(`GREYFIELD_LIVE2D_FIXTURE does not exist: ${configured}`);
  }
  if (exists(packageFixture)) {
    return packageFixture;
  }
  throw new Error(
    "No Live2D fixture found. Set GREYFIELD_LIVE2D_FIXTURE to a .model3.json file or install the bundled Hiyori assets."
  );
}

export function toViteFsModelUrl(modelPath) {
  return `/@fs/${modelPath.replace(/\\/g, "/")}`;
}

export function createRendererUrl(baseUrl, options = {}) {
  const url = new URL(baseUrl);
  url.searchParams.set("live2dModel", toViteFsModelUrl(resolveLive2DFixturePath(options)));
  return url.toString();
}

export function resolveDevLaunchPaths(options = {}) {
  const env = options.env ?? process.env;
  const cacheRoot = options.cacheRoot ?? devCacheRoot;
  const configPath = env.GREYFIELD_CONFIG_PATH ?? join(cacheRoot, "greyfield.config.json");
  const resetRequested = env.GREYFIELD_RESET_DEV_CONFIG === "1";
  return {
    cacheRoot,
    configPath,
    userDataPath: env.GREYFIELD_USER_DATA_PATH ?? join(cacheRoot, "user-data"),
    shouldWriteSafeConfig: !env.GREYFIELD_CONFIG_PATH && (resetRequested || !existsSync(configPath))
  };
}

export async function prepareDevLaunchEnvironment(options = {}) {
  const env = options.env ?? process.env;
  const paths = resolveDevLaunchPaths(options);
  await mkdir(paths.cacheRoot, { recursive: true });
  await mkdir(paths.userDataPath, { recursive: true });
  if (paths.shouldWriteSafeConfig) {
    await mkdir(dirname(paths.configPath), { recursive: true });
    await writeFile(paths.configPath, `${JSON.stringify(safeDevConfigPatch, null, 2)}\n`, "utf8");
  }
  return {
    GREYFIELD_CONFIG_PATH: paths.configPath,
    GREYFIELD_USER_DATA_PATH: paths.userDataPath,
    GREYFIELD_PROJECT_ROOT: env.GREYFIELD_PROJECT_ROOT ?? workspaceRoot
  };
}

async function main() {
  await mkdir(join(workspaceRoot, ".cache"), { recursive: true });

  if (await shouldBuild(join(desktopRoot, "dist-preload", "index.cjs"), [join(desktopRoot, "src", "preload")])) {
    await waitForExit(run(node, ["scripts/build-preload.mjs"], { cwd: desktopRoot }));
  }
  if (await shouldBuild(join(desktopRoot, "dist-main", "index.mjs"), [join(desktopRoot, "src", "main")])) {
    await waitForExit(run(node, ["scripts/build-main.mjs"], { cwd: desktopRoot }));
  }

  const launchEnv = await prepareDevLaunchEnvironment();
  const port = process.env.GREYFIELD_DEV_PORT ?? "5173";
  const baseUrl = `http://127.0.0.1:${port}/`;
  const vite = run(node, ["node_modules/vite/bin/vite.js", "--host", "127.0.0.1", "--port", port], {
    cwd: desktopRoot
  });
  await writePidFile({ parent: process.pid, vite: vite.pid });

  let electron;
  try {
    await waitForServer(baseUrl);
    const url = createRendererUrl(baseUrl);

    electron = run(node, ["node_modules/electron/cli.js", "dist-main/index.mjs"], {
      cwd: desktopRoot,
      env: { GREYFIELD_DESKTOP_URL: url, ...launchEnv }
    });
    await writePidFile({ parent: process.pid, vite: vite.pid, electron: electron.pid });
    await waitForExit(electron);
  } finally {
    if (electron && !electron.killed) {
      electron.kill();
    }
    if (!vite.killed) {
      vite.kill();
    }
    await rm(pidFile, { force: true });
  }
}

async function writePidFile(pids) {
  await writeFile(pidFile, `${JSON.stringify({ ...pids, updatedAt: new Date().toISOString() }, null, 2)}\n`, "utf8");
}

if (resolve(process.argv[1] ?? "") === resolve(fileURLToPath(import.meta.url))) {
  await main();
}
