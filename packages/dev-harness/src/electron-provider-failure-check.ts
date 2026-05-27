import { _electron as electron, type ElectronApplication, type Page } from "playwright";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { defaultGreyfieldConfig } from "@greyfield/persistence/config-schema";

const workspaceRoot = fileURLToPath(new URL("../../..", import.meta.url));
const desktopRoot = join(workspaceRoot, "apps", "desktop");
const scenarios = [
  {
    name: "unauthorized",
    userText: "错误 key 重试",
    expectedError: "OpenAI-compatible LLM request failed: 401 Unauthorized",
    respond(_request: IncomingMessage, response: ServerResponse) {
      response.writeHead(401, { "content-type": "application/json", "statusText": "Unauthorized" });
      response.end(JSON.stringify({ error: "bad key" }));
    }
  },
  {
    name: "malformed-sse",
    userText: "坏流重试",
    expectedError: "OpenAI-compatible LLM stream returned malformed SSE data",
    respond(_request: IncomingMessage, response: ServerResponse) {
      response.writeHead(200, {
        "content-type": "text/event-stream",
        "cache-control": "no-cache"
      });
      response.end("data: {not-json}\n\n");
    }
  },
  {
    name: "not-found",
    userText: "错误地址重试",
    expectedError: "OpenAI-compatible LLM request failed: 404 Not Found",
    respond(_request: IncomingMessage, response: ServerResponse) {
      response.writeHead(404, { "content-type": "application/json" });
      response.end(JSON.stringify({ error: "wrong path" }));
    }
  }
];

const results: Array<{ name: string; requestCount: number; draftRestored: boolean; sessionClean: boolean }> = [];

for (const scenario of scenarios) {
  const tempDir = await mkdtemp(join(tmpdir(), `greyfield-provider-failure-${scenario.name}-`));
  const configPath = join(tempDir, "greyfield.config.json");
  let requestCount = 0;
  const server = createServer((request, response) => {
    requestCount += 1;
    scenario.respond(request, response);
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const port = (server.address() as AddressInfo).port;

  await writeFile(
    configPath,
    `${JSON.stringify(
      {
        ...defaultGreyfieldConfig,
        provider: {
          ...defaultGreyfieldConfig.provider,
          llm: "openai-compatible",
          baseUrl: `http://127.0.0.1:${port}/v1`,
          apiKey: "local-failure-key",
          model: `provider-failure-${scenario.name}`
        }
      },
      null,
      2
    )}\n`,
    "utf8"
  );

  try {
    const app = await launchApp(configPath, tempDir);
    try {
      const chatWindow = await waitForRoleWindow(app, "chat");
      await sendMessage(chatWindow, scenario.userText);
      await chatWindow.locator(".chat-error", { hasText: scenario.expectedError }).waitFor({ timeout: 10_000 });
      const draft = await chatWindow.getByLabel("Message").inputValue();
      const sessionJsonl = await readFile(join(tempDir, "sessions", "desktop-main-session.jsonl"), "utf8").catch(() => "");
      if (draft !== scenario.userText) {
        throw new Error(`${scenario.name} did not restore failed input draft; draft=${JSON.stringify(draft)}`);
      }
      if (sessionJsonl.trim().length > 0) {
        throw new Error(`${scenario.name} polluted session JSONL: ${sessionJsonl}`);
      }
      results.push({ name: scenario.name, requestCount, draftRestored: true, sessionClean: true });
    } finally {
      await app.close();
    }
  } finally {
    server.close();
    await rm(tempDir, { recursive: true, force: true });
  }
}

console.log(JSON.stringify({ ok: true, scenarios: results }, null, 2));

async function launchApp(configPath: string, userDataPath: string): Promise<ElectronApplication> {
  const output: string[] = [];
  const app = await electron.launch({
    cwd: desktopRoot,
    args: [join(desktopRoot, "dist-main", "index.mjs")],
    env: {
      ...process.env,
      GREYFIELD_CONFIG_PATH: configPath,
      GREYFIELD_PROJECT_ROOT: workspaceRoot,
      GREYFIELD_USER_DATA_PATH: userDataPath
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
      `Timed out waiting for first Electron window; spawnargs=${JSON.stringify(spawnargs)}; urls=${JSON.stringify(urls)}; output=${output.join("").slice(-4000)}; cause=${String(error)}`
    );
  }
  return app;
}

async function waitForRoleWindow(app: ElectronApplication, roleName: "chat"): Promise<Page> {
  const started = Date.now();
  while (Date.now() - started < 5_000) {
    for (const page of app.windows()) {
      const role = await page.evaluate(() => new URLSearchParams(window.location.search).get("window")).catch(() => null);
      if (role === roleName) {
        await page.waitForSelector(".chat-shell");
        return page;
      }
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`Timed out waiting for ${roleName} window`);
}

async function sendMessage(page: Page, text: string): Promise<void> {
  await page.getByLabel("Message").fill(text);
  await page.getByRole("button", { name: "Send" }).click();
}
