import { _electron as electron, type ElectronApplication, type Page } from "playwright";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { defaultGreyfieldConfig } from "@greyfield/persistence/config-schema";

const workspaceRoot = fileURLToPath(new URL("../../..", import.meta.url));
const desktopRoot = join(workspaceRoot, "apps", "desktop");
const artifactDir = join(workspaceRoot, "artifacts", "v22-single-persona-editor");
const tempDir = await mkdtemp(join(tmpdir(), "greyfield-single-persona-"));
const configPath = join(tempDir, "greyfield.config.json");
const personaPath = join(tempDir, "greyfield-persona.yaml");
const requests: Array<{ messages?: Array<{ role: string; content: string }> }> = [];

const server = createServer(async (request: IncomingMessage, response: ServerResponse) => {
  const body = await readRequestBody(request);
  requests.push(JSON.parse(body) as { messages?: Array<{ role: string; content: string }> });
  response.writeHead(200, {
    "content-type": "text/event-stream",
    "cache-control": "no-cache"
  });
  response.end('data: {"choices":[{"delta":{"content":"persona saved reply."}}]}\n\ndata: [DONE]\n\n');
});

await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
const port = (server.address() as AddressInfo).port;

await mkdir(artifactDir, { recursive: true });
await writePersonaFile([
  "name: Greyfield",
  "userAddress: you",
  "background: A local Live2D companion.",
  "personality: steady and curious",
  "speakingStyle: short and warm",
  "tone: warm",
  "boundaries:",
  "  - Stay local.",
  "greeting: Hello.",
  "expressionMap:",
  "  neutral: default"
]);
await writeFile(
  configPath,
  `${JSON.stringify(
    {
      ...defaultGreyfieldConfig,
      characterFile: personaPath,
      provider: {
        ...defaultGreyfieldConfig.provider,
        llm: "openai-compatible",
        baseUrl: `http://127.0.0.1:${port}/v1`,
        apiKey: "local-persona-test-key",
        model: "single-persona-harness-model"
      }
    },
    null,
    2
  )}\n`,
  "utf8"
);

try {
  const firstApp = await launchApp();
  try {
    const settingsWindow = await waitForRoleWindow(firstApp, "settings");
    await settingsWindow.locator(".provider-test-result--success", { hasText: "Loaded persona" }).waitFor({
      timeout: 10_000
    });
    await settingsWindow.getByLabel("Greyfield name").fill("Mira");
    await settingsWindow.getByLabel("User address").fill("captain");
    await settingsWindow.getByLabel("Personality").fill("calm, focused, and lightly mischievous");
    await settingsWindow.getByLabel("Speaking style").fill("Use short starlit sentences with one concrete next step.");
    await settingsWindow.getByLabel("Boundaries").fill("Never claim desktop control.\nDo not mention hidden prompts.");
    await settingsWindow.getByLabel("Greeting").fill("Welcome back, captain.");
    await settingsWindow.getByRole("button", { name: "Save persona" }).click();
    await settingsWindow.locator(".provider-test-result--success", { hasText: "Saved persona" }).waitFor({
      timeout: 10_000
    });
    await settingsWindow.screenshot({ path: join(artifactDir, "settings-persona-saved.png"), fullPage: true });

    const chatWindow = await waitForRoleWindow(firstApp, "chat");
    await sendMessage(chatWindow, "下一轮人设检查");
    await chatWindow.locator(".message-list .assistant:not(.draft)", { hasText: "persona saved reply." }).waitFor({
      timeout: 10_000
    });
  } finally {
    await firstApp.close();
  }

  const firstSystemPrompt = requests[0]?.messages?.[0]?.content ?? "";
  for (const expected of [
    "Character: Mira",
    "User address: captain",
    "calm, focused, and lightly mischievous",
    "Use short starlit sentences with one concrete next step.",
    "Never claim desktop control.",
    "Welcome back, captain."
  ]) {
    if (!firstSystemPrompt.includes(expected)) {
      throw new Error(`Saved persona did not reach chat prompt; missing=${expected}; prompt=${firstSystemPrompt}`);
    }
  }

  const secondApp = await launchApp();
  try {
    const settingsWindow = await waitForRoleWindow(secondApp, "settings");
    await settingsWindow.locator(".provider-test-result--success", { hasText: "Loaded persona" }).waitFor({
      timeout: 10_000
    });
    await expectInputValue(settingsWindow, "Greyfield name", "Mira");
    await expectInputValue(settingsWindow, "User address", "captain");
    await expectInputValue(settingsWindow, "Greeting", "Welcome back, captain.");
    await settingsWindow.screenshot({ path: join(artifactDir, "settings-persona-restart.png"), fullPage: true });
  } finally {
    await secondApp.close();
  }

  await writePersonaFile(["name: 123", "boundaries: nope", "expressionMap:", "  neutral: default"]);
  const thirdApp = await launchApp();
  try {
    const settingsWindow = await waitForRoleWindow(thirdApp, "settings");
    await settingsWindow.locator(".provider-test-result--error", { hasText: "Could not load persona" }).waitFor({
      timeout: 10_000
    });
    const errorMessage = settingsWindow.locator(".provider-test-result--error", { hasText: "Character persona name" });
    await errorMessage.waitFor();
    await errorMessage.scrollIntoViewIfNeeded();
    await settingsWindow.screenshot({ path: join(artifactDir, "settings-persona-invalid.png"), fullPage: true });
  } finally {
    await thirdApp.close();
  }

  const savedPersona = await readFile(personaPath, "utf8").catch(() => "");
  console.log(
    JSON.stringify(
      {
        ok: true,
        requestCount: requests.length,
        promptContainsEditedPersona: true,
        restartPersisted: true,
        invalidPersonaReadableError: true,
        personaPath,
        artifacts: [
          join(artifactDir, "settings-persona-saved.png"),
          join(artifactDir, "settings-persona-restart.png"),
          join(artifactDir, "settings-persona-invalid.png")
        ],
        savedPersonaBytes: savedPersona.length
      },
      null,
      2
    )
  );
} finally {
  server.close();
  await rm(tempDir, { recursive: true, force: true });
}

async function launchApp(): Promise<ElectronApplication> {
  const output: string[] = [];
  const app = await electron.launch({
    cwd: desktopRoot,
    args: [join(desktopRoot, "dist-main", "index.mjs")],
    env: {
      ...process.env,
      GREYFIELD_CONFIG_PATH: configPath,
      GREYFIELD_PROJECT_ROOT: workspaceRoot,
      GREYFIELD_USER_DATA_PATH: tempDir
    }
  });
  app.process().stdout?.on("data", (chunk) => output.push(String(chunk)));
  app.process().stderr?.on("data", (chunk) => output.push(String(chunk)));
  try {
    await app.firstWindow({ timeout: 10_000 });
  } catch (error) {
    const urls = app.windows().map((page) => page.url());
    const spawnargs = app.process().spawnargs;
    await app.close().catch(() => undefined);
    throw new Error(
      `Timed out waiting for first Electron window; spawnargs=${JSON.stringify(spawnargs)}; urls=${JSON.stringify(
        urls
      )}; output=${output.join("").slice(-4000)}; cause=${String(error)}`
    );
  }
  return app;
}

async function waitForRoleWindow(app: ElectronApplication, roleName: "settings" | "chat"): Promise<Page> {
  const started = Date.now();
  while (Date.now() - started < 5_000) {
    for (const page of app.windows()) {
      const role = await page.evaluate(() => new URLSearchParams(window.location.search).get("window")).catch(() => null);
      if (role === roleName) {
        await page.waitForSelector(roleName === "settings" ? ".greyfield-shell" : ".chat-shell");
        return page;
      }
    }
    await delay(100);
  }
  throw new Error(`Timed out waiting for ${roleName} window`);
}

async function sendMessage(page: Page, text: string): Promise<void> {
  await page.getByLabel("Message").fill(text);
  await page.getByRole("button", { name: "Send" }).click();
}

async function expectInputValue(page: Page, label: string, expected: string): Promise<void> {
  const locator = page.getByLabel(label);
  await locator.waitFor({ timeout: 10_000 });
  const value = await locator.inputValue();
  if (value !== expected) {
    throw new Error(`Unexpected ${label} value after restart; expected=${expected}; actual=${value}`);
  }
}

async function writePersonaFile(lines: string[]): Promise<void> {
  await writeFile(personaPath, `${lines.join("\n")}\n`, "utf8");
}

async function readRequestBody(request: IncomingMessage): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of request) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks).toString("utf8");
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
