import { _electron as electron, type ElectronApplication, type Page } from "playwright";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { defaultGreyfieldConfig } from "@greyfield/persistence/config-schema";

const workspaceRoot = fileURLToPath(new URL("../../..", import.meta.url));
const desktopRoot = join(workspaceRoot, "apps", "desktop");
const tempDir = await mkdtemp(join(tmpdir(), "greyfield-bubble-long-reply-"));
const configPath = join(tempDir, "greyfield.config.json");
const firstChunk = "首句进入气泡。";
const finalTail = "这是 Chat 窗口必须保留而宠物气泡不应该完整展示的末尾标记。";
const longChunks = [
  firstChunk,
  "这是一段用于测试桌宠气泡的长回复，内容会持续追加，气泡应该保持在稳定的短提示位置。",
  "它不能跟随模型动画来回移动，也不能因为文字变长就撑爆宠物窗口。",
  "完整回复仍然应该留在 Chat 历史里，方便用户回看，而桌面上的宠物气泡只承担短提示职责。",
  finalTail
];

let requestCount = 0;
const server = createServer(async (_request: IncomingMessage, response: ServerResponse) => {
  requestCount += 1;
  response.writeHead(200, {
    "content-type": "text/event-stream",
    "cache-control": "no-cache"
  });
  for (const chunk of longChunks) {
    response.write(`data: ${JSON.stringify({ choices: [{ delta: { content: chunk } }] })}\n\n`);
    await delay(120);
  }
  response.write("data: [DONE]\n\n");
  response.end();
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
        apiKey: "local-bubble-key",
        model: "bubble-harness-model"
      },
      ui: {
        ...defaultGreyfieldConfig.ui,
        speechBubbleEnabled: true
      }
    },
    null,
    2
  )}\n`,
  "utf8"
);

try {
  const app = await launchApp();
  try {
    const petWindow = await waitForRoleWindow(app, "pet");
    const chatWindow = await waitForRoleWindow(app, "chat");
    await sendMessage(chatWindow, "请输出一段长回复，用于检查宠物气泡。");

    const firstBubble = await waitForLaidOutBubbleState(petWindow, firstChunk);
    if (!firstBubble.text.includes(firstChunk)) {
      throw new Error(`First token did not reach speech bubble: ${JSON.stringify(firstBubble)}`);
    }
    assertBubbleInViewport(firstBubble);
    const stableBubble = await waitForCappedBubbleState(petWindow);
    assertBubbleInViewport(stableBubble);

    await chatWindow.locator(".message-list .assistant", { hasText: finalTail }).waitFor({ timeout: 10_000 });
    const finalBubble = await waitForCappedBubbleState(petWindow);
    assertBubbleInViewport(finalBubble);
    if (finalBubble.text.length > 120 || !finalBubble.text.endsWith("...")) {
      throw new Error(`Speech bubble did not cap long reply text: ${JSON.stringify(finalBubble)}`);
    }
    if (finalBubble.text.includes(finalTail)) {
      throw new Error(`Speech bubble showed the full long reply tail: ${JSON.stringify(finalBubble)}`);
    }
    if (stableBubble.x !== finalBubble.x || stableBubble.y !== finalBubble.y) {
      throw new Error(`Speech bubble moved while streaming: first=${JSON.stringify(stableBubble)} final=${JSON.stringify(finalBubble)}`);
    }

    const chatText = await chatWindow.locator(".message-list .assistant").last().textContent();
    if (!chatText?.includes(firstChunk) || !chatText.includes(finalTail)) {
      throw new Error(`Chat did not keep full assistant reply: ${JSON.stringify(chatText)}`);
    }
    await petWindow.locator(".speech-bubble").waitFor({ state: "detached", timeout: 10_000 });

    console.log(
      JSON.stringify(
        {
          ok: true,
          requestCount,
          firstTokenReachedBubble: true,
          bubbleTextLength: finalBubble.text.length,
          bubbleStable: true,
          bubbleInsideViewport: true,
          bubbleFadedAfterReply: true,
          chatKeptFullReply: true
        },
        null,
        2
      )
    );
  } finally {
    await app.close();
  }
} finally {
  server.closeAllConnections?.();
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

async function waitForRoleWindow(app: ElectronApplication, roleName: "pet" | "chat"): Promise<Page> {
  const started = Date.now();
  while (Date.now() - started < 5_000) {
    for (const page of app.windows()) {
      const role = await page.evaluate(() => new URLSearchParams(window.location.search).get("window")).catch(() => null);
      if (role === roleName) {
        await page.waitForSelector(roleName === "pet" ? ".pet-shell" : ".chat-shell");
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

async function readBubbleState(page: Page): Promise<{
  text: string;
  x: number;
  y: number;
  width: number;
  height: number;
  viewportWidth: number;
  viewportHeight: number;
}> {
  return page.locator(".speech-bubble").evaluate((element) => {
    const rect = element.getBoundingClientRect();
    return {
      text: element.textContent?.trim() ?? "",
      x: Math.round(rect.x),
      y: Math.round(rect.y),
      width: Math.round(rect.width),
      height: Math.round(rect.height),
      viewportWidth: window.innerWidth,
      viewportHeight: window.innerHeight
    };
  });
}

async function waitForLaidOutBubbleState(
  page: Page,
  expectedText = ""
): Promise<{
  text: string;
  x: number;
  y: number;
  width: number;
  height: number;
  viewportWidth: number;
  viewportHeight: number;
}> {
  await page.waitForFunction(
    (text) => {
      const element = document.querySelector<HTMLElement>(".speech-bubble");
      if (!element) {
        return false;
      }
      const rect = element.getBoundingClientRect();
      return rect.width > 0 && rect.height > 0 && (text.length === 0 || element.textContent?.includes(text));
    },
    expectedText,
    { timeout: 10_000 }
  );
  return readBubbleState(page);
}

async function waitForCappedBubbleState(
  page: Page
): Promise<{
  text: string;
  x: number;
  y: number;
  width: number;
  height: number;
  viewportWidth: number;
  viewportHeight: number;
}> {
  await page.waitForFunction(
    () => {
      const element = document.querySelector<HTMLElement>(".speech-bubble");
      if (!element) {
        return false;
      }
      const rect = element.getBoundingClientRect();
      const text = element.textContent?.trim() ?? "";
      return rect.width > 0 && rect.height > 0 && text.endsWith("...");
    },
    undefined,
    { timeout: 10_000 }
  );
  return readBubbleState(page);
}

function assertBubbleInViewport(bubble: {
  x: number;
  y: number;
  width: number;
  height: number;
  viewportWidth: number;
  viewportHeight: number;
}): void {
  if (
    bubble.width <= 0 ||
    bubble.height <= 0 ||
    bubble.x < 0 ||
    bubble.y < 0 ||
    bubble.x + bubble.width > bubble.viewportWidth ||
    bubble.y + bubble.height > bubble.viewportHeight
  ) {
    throw new Error(`Speech bubble escaped viewport: ${JSON.stringify(bubble)}`);
  }
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
