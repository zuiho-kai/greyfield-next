import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import { readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";

const execFileAsync = promisify(execFile);
const workspaceRoot = fileURLToPath(new URL("../../..", import.meta.url));
const pidFile = join(workspaceRoot, ".cache", "greyfield-live2d-dev-pids.json");

if (!existsSync(pidFile)) {
  process.exit(0);
}

const pids = JSON.parse(await readFile(pidFile, "utf8"));
const candidates = [pids.electron, pids.vite, pids.parent].filter(
  (pid) => Number.isInteger(pid) && pid > 0 && pid !== process.pid
);

for (const pid of candidates) {
  await killProcessTree(pid);
}

await rm(pidFile, { force: true });

async function killProcessTree(pid) {
  try {
    if (process.platform === "win32") {
      await execFileAsync("taskkill.exe", ["/PID", String(pid), "/T", "/F"]);
      return;
    }
    process.kill(pid, "SIGTERM");
  } catch {
    // Already gone.
  }
}
