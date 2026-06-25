import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir, readdir, stat, writeFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { setTimeout as sleep } from "node:timers/promises";
import { fileURLToPath } from "node:url";

const workspaceRoot = fileURLToPath(new URL("../../..", import.meta.url));
const desktopRoot = fileURLToPath(new URL("..", import.meta.url));
const node = process.execPath;
const pidFile = join(workspaceRoot, ".cache", "greyfield-live2d-dev-pids.json");
const skipBuild = process.argv.includes("--skip-build");
const forceBuild = process.argv.includes("--force-build");

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

async function shouldBuild(outputFile, sourceDirs) {
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

function resolveConfiguredLive2DFixturePath() {
  const configured = process.env.GREYFIELD_LIVE2D_FIXTURE;
  if (configured && existsSync(configured)) {
    return configured;
  }
  if (configured) {
    throw new Error(`GREYFIELD_LIVE2D_FIXTURE does not exist: ${configured}`);
  }
  return undefined;
}

function toViteFsModelUrl(modelPath) {
  return `/@fs/${modelPath.replace(/\\/g, "/")}`;
}

function createRendererUrl(baseUrl) {
  const url = new URL(baseUrl);
  const configuredFixture = resolveConfiguredLive2DFixturePath();
  if (configuredFixture) {
    url.searchParams.set("live2dModel", toViteFsModelUrl(configuredFixture));
  }
  return url.toString();
}

await mkdir(join(workspaceRoot, ".cache"), { recursive: true });

if (await shouldBuild(join(desktopRoot, "dist-preload", "index.cjs"), [join(desktopRoot, "src", "preload")])) {
  await waitForExit(run(node, ["scripts/build-preload.mjs"], { cwd: desktopRoot }));
}
if (await shouldBuild(join(desktopRoot, "dist-main", "index.mjs"), [join(desktopRoot, "src", "main")])) {
  await waitForExit(run(node, ["scripts/build-main.mjs"], { cwd: desktopRoot }));
}

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
    env: { GREYFIELD_DESKTOP_URL: url }
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

async function writePidFile(pids) {
  await writeFile(pidFile, `${JSON.stringify({ ...pids, updatedAt: new Date().toISOString() }, null, 2)}\n`, "utf8");
}
