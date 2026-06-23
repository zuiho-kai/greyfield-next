import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

type Check = {
  name: string;
  command: string;
  args: string[];
};

const workspaceRoot = fileURLToPath(new URL("../../..", import.meta.url));
const pnpmCommand = "pnpm";

const checks: Check[] = [
  { name: "frontend unit tests", command: pnpmCommand, args: ["test:frontend"] },
  { name: "desktop production build", command: pnpmCommand, args: ["build:desktop"] },
  { name: "real Live2D browser harness", command: pnpmCommand, args: ["exec", "tsx", "packages/dev-harness/src/live2d-check.ts"] },
  { name: "V1 visual acceptance", command: pnpmCommand, args: ["exec", "tsx", "packages/dev-harness/src/v1-visual-acceptance-check.ts"] },
  { name: "full Electron Settings/Chat/Pet harness", command: pnpmCommand, args: ["exec", "tsx", "packages/dev-harness/src/electron-check.ts"] },
  { name: "speech bubble long reply harness", command: pnpmCommand, args: ["exec", "tsx", "packages/dev-harness/src/electron-bubble-long-reply-check.ts"] },
  { name: "speech bubble edge click-through harness", command: pnpmCommand, args: ["exec", "tsx", "packages/dev-harness/src/electron-bubble-edge-clickthrough-check.ts"] },
  { name: "Settings provider test harness", command: pnpmCommand, args: ["exec", "tsx", "packages/dev-harness/src/electron-settings-provider-test-check.ts"] },
  { name: "Settings active-chat rejection harness", command: pnpmCommand, args: ["exec", "tsx", "packages/dev-harness/src/electron-settings-active-chat-test-check.ts"] },
  { name: "Chat provider failure harness", command: pnpmCommand, args: ["exec", "tsx", "packages/dev-harness/src/electron-provider-failure-check.ts"] },
  { name: "Chat provider abort harness", command: pnpmCommand, args: ["exec", "tsx", "packages/dev-harness/src/electron-provider-abort-check.ts"] },
  { name: "Stop audio harness", command: pnpmCommand, args: ["exec", "tsx", "packages/dev-harness/src/electron-stop-audio-check.ts"] },
  { name: "restart context harness", command: pnpmCommand, args: ["exec", "tsx", "packages/dev-harness/src/electron-restart-context-check.ts"] }
];

const startedAt = Date.now();

for (const check of checks) {
  const checkStartedAt = Date.now();
  console.log(`\n[frontend-full] START ${check.name}`);
  await run(check);
  console.log(`[frontend-full] PASS ${check.name} (${formatDuration(Date.now() - checkStartedAt)})`);
}

console.log(`\n[frontend-full] OK ${checks.length} checks passed in ${formatDuration(Date.now() - startedAt)}`);

async function run(check: Check): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const command = process.platform === "win32" ? "cmd.exe" : check.command;
    const args = process.platform === "win32" ? ["/d", "/s", "/c", check.command, ...check.args] : check.args;
    const child = spawn(command, args, {
      cwd: workspaceRoot,
      env: process.env,
      stdio: "inherit"
    });

    child.on("error", reject);
    child.on("exit", (code, signal) => {
      if (code === 0) {
        resolve();
        return;
      }
      reject(new Error(`${check.name} failed with ${signal ? `signal ${signal}` : `exit code ${code}`}`));
    });
  });
}

function formatDuration(ms: number): string {
  const seconds = Math.round(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const remainder = seconds % 60;
  return minutes > 0 ? `${minutes}m ${remainder}s` : `${remainder}s`;
}
