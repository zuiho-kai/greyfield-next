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
const tempDir = await mkdtemp(join(tmpdir(), "greyfield-electron-restart-"));
const configPath = join(tempDir, "greyfield.config.json");
const requests: Array<{ messages?: Array<{ role: string; content: string }> }> = [];

const server = createServer(async (request: IncomingMessage, response: ServerResponse) => {
  const body = await readRequestBody(request);
  requests.push(JSON.parse(body) as { messages?: Array<{ role: string; content: string }> });
  const reply = requests.length === 1 ? "first persisted reply." : "second restart reply.";
  response.writeHead(200, {
    "content-type": "text/event-stream",
    "cache-control": "no-cache"
  });
  response.end(`data: {"choices":[{"delta":{"content":${JSON.stringify(reply)}}}]}\n\ndata: [DONE]\n\n`);
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
        apiKey: "local-test-key",
        model: "restart-harness-model"
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
    const firstChat = await waitForRoleWindow(firstApp, "chat");
    await sendMessage(firstChat, "第一轮重启上下文");
    await firstChat.locator(".message-list .assistant:not(.draft)", { hasText: "first persisted reply." }).waitFor();
  } finally {
    await firstApp.close();
  }

  const secondApp = await launchApp();
  try {
    const secondChat = await waitForRoleWindow(secondApp, "chat");
    await sendMessage(secondChat, "第二轮读取上下文");
    await secondChat.locator(".message-list .assistant:not(.draft)", { hasText: "second restart reply." }).waitFor();
  } finally {
    await secondApp.close();
  }

  const secondMessages = requests[1]?.messages ?? [];
  if (!secondMessages.some((message) => message.role === "user" && message.content === "第一轮重启上下文")) {
    throw new Error(`Second launch prompt missed persisted user turn: ${JSON.stringify(secondMessages)}`);
  }
  if (!secondMessages.some((message) => message.role === "assistant" && message.content === "first persisted reply.")) {
    throw new Error(`Second launch prompt missed persisted assistant turn: ${JSON.stringify(secondMessages)}`);
  }
  const secondSystem = secondMessages[0]?.content ?? "";
  if (!secondSystem.includes("Character: Greyfield") || !secondSystem.includes("Greyfield Memory")) {
    throw new Error(`Second launch prompt missed persona or memory: ${secondSystem}`);
  }

  const sessionJsonl = await readFile(join(tempDir, "sessions", "desktop-main-session.jsonl"), "utf8");
  console.log(
    JSON.stringify(
      {
        ok: true,
        launchCount: 2,
        requestCount: requests.length,
        restartedContextWorked: true,
        persistedSessionLines: sessionJsonl.trim().split(/\r?\n/).length
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

async function readRequestBody(request: IncomingMessage): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of request) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks).toString("utf8");
}
