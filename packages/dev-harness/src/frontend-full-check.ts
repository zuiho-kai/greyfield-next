import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

type Check = {
  name: string;
  command: string;
  args: string[];
  optional?: "real-tts";
};

type Profile = "smoke" | "visual" | "user-path" | "heavy" | "full";

const workspaceRoot = fileURLToPath(new URL("../../..", import.meta.url));
const pnpmCommand = "pnpm";

const smokeChecks: Check[] = [
  { name: "frontend unit tests", command: pnpmCommand, args: ["test:frontend"] },
  { name: "Playwright Chromium install", command: pnpmCommand, args: ["exec", "playwright", "install", "chromium"] },
  { name: "real Live2D browser harness", command: pnpmCommand, args: ["exec", "tsx", "packages/dev-harness/src/live2d-check.ts"] }
];

const desktopBuildCheck: Check = { name: "desktop production build", command: pnpmCommand, args: ["build:desktop"] };

const visualChecks: Check[] = [
  desktopBuildCheck,
  { name: "V1 visual acceptance", command: pnpmCommand, args: ["exec", "tsx", "packages/dev-harness/src/v1-visual-acceptance-check.ts"] },
];

const userPathChecks: Check[] = [
  desktopBuildCheck,
  { name: "full Electron Settings/Chat/Pet harness", command: pnpmCommand, args: ["exec", "tsx", "packages/dev-harness/src/electron-check.ts"] }
];

const heavyChecks: Check[] = [
  desktopBuildCheck,
  { name: "speech bubble long reply harness", command: pnpmCommand, args: ["exec", "tsx", "packages/dev-harness/src/electron-bubble-long-reply-check.ts"] },
  { name: "speech bubble edge click-through harness", command: pnpmCommand, args: ["exec", "tsx", "packages/dev-harness/src/electron-bubble-edge-clickthrough-check.ts"] },
  { name: "Settings provider test harness", command: pnpmCommand, args: ["exec", "tsx", "packages/dev-harness/src/electron-settings-provider-test-check.ts"] },
  { name: "Settings active-chat rejection harness", command: pnpmCommand, args: ["exec", "tsx", "packages/dev-harness/src/electron-settings-active-chat-test-check.ts"] },
  { name: "Chat provider failure harness", command: pnpmCommand, args: ["exec", "tsx", "packages/dev-harness/src/electron-provider-failure-check.ts"] },
  { name: "Chat provider abort harness", command: pnpmCommand, args: ["exec", "tsx", "packages/dev-harness/src/electron-provider-abort-check.ts"] },
  { name: "Stop audio harness", command: pnpmCommand, args: ["exec", "tsx", "packages/dev-harness/src/electron-stop-audio-check.ts"] },
  { name: "microphone ASR and waveform mouth harness", command: pnpmCommand, args: ["exec", "tsx", "packages/dev-harness/src/electron-voice-input-check.ts"] },
  { name: "memory summary and control harness", command: pnpmCommand, args: ["run", "harness:electron:memory-control"] },
  { name: "memory atom library harness", command: pnpmCommand, args: ["run", "harness:electron:memory-atom-library"] },
  { name: "proactive desktop message harness", command: pnpmCommand, args: ["run", "harness:electron:proactive-desktop-message"] },
  {
    name: "real OpenAI-compatible TTS Electron harness",
    command: pnpmCommand,
    args: ["exec", "tsx", "packages/dev-harness/src/electron-real-tts-check.ts"],
    optional: "real-tts"
  },
  { name: "restart context harness", command: pnpmCommand, args: ["exec", "tsx", "packages/dev-harness/src/electron-restart-context-check.ts"] }
];

const profile = parseProfile(process.argv);
const checks = checksForProfile(profile);
const startedAt = Date.now();

for (const check of checks) {
  if (check.optional === "real-tts" && !hasRealTTSCredentials(process.env)) {
    console.log(`\n[frontend-${profile}] SKIP ${check.name} (missing GREYFIELD_REAL_TTS_* or GREYFIELD_REAL_LLM_* env)`);
    continue;
  }
  const checkStartedAt = Date.now();
  console.log(`\n[frontend-${profile}] START ${check.name}`);
  await run(check);
  console.log(`[frontend-${profile}] PASS ${check.name} (${formatDuration(Date.now() - checkStartedAt)})`);
}

console.log(`\n[frontend-${profile}] OK ${checks.length} checks passed in ${formatDuration(Date.now() - startedAt)}`);

function checksForProfile(profile: Profile): Check[] {
  if (profile === "smoke") {
    return smokeChecks;
  }
  if (profile === "visual") {
    return visualChecks;
  }
  if (profile === "user-path") {
    return userPathChecks;
  }
  if (profile === "heavy") {
    return heavyChecks;
  }
  return [
    smokeChecks[0],
    smokeChecks[1],
    desktopBuildCheck,
    smokeChecks[2],
    ...visualChecks.slice(1),
    ...userPathChecks.slice(1),
    ...heavyChecks.slice(1)
  ];
}

function parseProfile(argv: string[]): Profile {
  const profileArg = argv.find((arg) => arg.startsWith("--profile="));
  const profileFlagIndex = argv.indexOf("--profile");
  const profile = profileArg?.slice("--profile=".length) ?? (profileFlagIndex >= 0 ? argv[profileFlagIndex + 1] : undefined) ?? "full";
  if (profile === "smoke" || profile === "visual" || profile === "user-path" || profile === "heavy" || profile === "full") {
    return profile;
  }
  throw new Error(`Unknown frontend profile "${profile}". Expected smoke, visual, user-path, heavy, or full.`);
}

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

function hasRealTTSCredentials(env: Record<string, string | undefined>): boolean {
  const baseUrl = env.GREYFIELD_REAL_TTS_BASE_URL || env.GREYFIELD_REAL_LLM_BASE_URL;
  const apiKey = env.GREYFIELD_REAL_TTS_API_KEY || env.GREYFIELD_REAL_LLM_API_KEY;
  return Boolean(baseUrl?.trim() && apiKey?.trim());
}
