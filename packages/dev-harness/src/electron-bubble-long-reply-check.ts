import { _electron as electron, type ElectronApplication, type Page } from "playwright";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { defaultGreyfieldConfig } from "@greyfield/persistence/config-schema";

const workspaceRoot = fileURLToPath(new URL("../../..", import.meta.url));
const desktopRoot = join(workspaceRoot, "apps", "desktop");
const chatLongReplyArtifactDir = join(workspaceRoot, ".cache", "greyfield-chat-long-reply", "latest");
const tempDir = await mkdtemp(join(tmpdir(), "greyfield-bubble-long-reply-"));
const configPath = join(tempDir, "greyfield.config.json");
const firstChunk = "首句进入气泡。";
const finalTail = "这是 Chat 窗口必须保留而宠物气泡不应该完整展示的末尾标记。";
const longChunks = [
  firstChunk,
  "这是一段用于测试桌宠气泡和 Chat 长回复的长回复，内容会持续追加，气泡应该保持在稳定的短提示位置。".repeat(3),
  "它不能跟随模型动画来回移动，也不能因为文字变长就撑爆宠物窗口；Chat 里也不能把输入区顶出可用范围。".repeat(4),
  "完整回复仍然应该留在 Chat 历史里，方便用户回看、选择和复制；默认视图需要像常见聊天产品一样先折叠长内容。".repeat(4),
  "展开以后，滚动应该只发生在消息列表内，底部 composer 必须继续留在窗口里，用户可以马上继续输入下一条消息。".repeat(4),
  finalTail
];

interface BubbleState {
  text: string;
  x: number;
  y: number;
  width: number;
  height: number;
  viewportWidth: number;
  viewportHeight: number;
}

interface ChatLongReplyState {
  bubbleTexts: string[];
  bubbleHeights: number[];
  toggleCount: number;
  listClientHeight: number;
  listScrollHeight: number;
  listCanScroll: boolean;
  listAboveComposer: boolean;
  composerInViewport: boolean;
  inputReachable: boolean;
  noHorizontalOverflow: boolean;
  bubbleFitsListWidth: boolean;
}

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

await rm(chatLongReplyArtifactDir, { recursive: true, force: true });
await mkdir(chatLongReplyArtifactDir, { recursive: true });

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
    const chatLongReply = await assertChatReplySegmentation(chatWindow);
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
          chatKeptFullReply: true,
          chatReplySegmentedIntoShortBubbles: chatLongReply.bubbleTexts.length,
          chatComposerReachableAfterLongReply: true,
          chatMessageListScrollsAfterLongReply: chatLongReply.listCanScroll,
          chatLongReplyArtifacts: [
            join(chatLongReplyArtifactDir, "chat-long-reply-segmented.png")
          ]
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
  await page.getByTestId("chat-message-input").fill(text);
  await page.getByTestId("chat-send-button").click();
}

async function waitForBubbleState(
  page: Page,
  textCondition: { expectedText?: string; capped?: boolean }
): Promise<BubbleState> {
  const handle = await page.waitForFunction(
    (condition) => {
      const element = document.querySelector<HTMLElement>(".speech-bubble");
      if (!element) {
        return false;
      }
      const text = element.textContent?.trim() ?? "";
      if (condition.expectedText && !text.includes(condition.expectedText)) {
        return false;
      }
      if (condition.capped && !text.endsWith("...")) {
        return false;
      }
      const rect = element.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) {
        return false;
      }
      const animations =
        typeof element.getAnimations === "function" ? element.getAnimations() : [];
      if (animations.some((animation) => animation.playState === "running")) {
        return false;
      }
      return {
        text,
        x: Math.round(rect.x),
        y: Math.round(rect.y),
        width: Math.round(rect.width),
        height: Math.round(rect.height),
        viewportWidth: window.innerWidth,
        viewportHeight: window.innerHeight
      };
    },
    textCondition,
    { timeout: 10_000 }
  );
  return (await handle.jsonValue()) as BubbleState;
}

async function waitForLaidOutBubbleState(
  page: Page,
  expectedText = ""
): Promise<BubbleState> {
  return waitForBubbleState(page, expectedText ? { expectedText } : {});
}

async function waitForCappedBubbleState(page: Page): Promise<BubbleState> {
  return waitForBubbleState(page, { capped: true });
}

function assertBubbleInViewport(bubble: BubbleState): void {
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

async function assertChatReplySegmentation(page: Page): Promise<ChatLongReplyState> {
  const assistantMessage = page.locator(".message-list .assistant").last();
  await assistantMessage.locator(".message-bubble").nth(1).waitFor({ timeout: 5_000 });
  const segmented = await readChatLongReplyState(page);
  if (segmented.bubbleTexts.length < 2) {
    throw new Error(`Long Chat reply did not render as multiple readable bubbles: ${JSON.stringify(segmented)}`);
  }
  const joinedText = segmented.bubbleTexts.join("");
  if (!joinedText.includes(firstChunk) || !joinedText.includes(finalTail)) {
    throw new Error(`Segmented Chat reply lost text: ${JSON.stringify(segmented)}`);
  }
  if (segmented.bubbleTexts.some((text) => text.length > 240)) {
    throw new Error(`Segmented Chat reply still contains an oversized readable bubble: ${JSON.stringify(segmented)}`);
  }
  if (segmented.bubbleHeights.some((height) => height > 180)) {
    throw new Error(`Segmented Chat reply bubble is too tall: ${JSON.stringify(segmented)}`);
  }
  if (segmented.toggleCount !== 0) {
    throw new Error(`Normal long reply used See more instead of natural segmentation: ${JSON.stringify(segmented)}`);
  }
  if (!segmented.listCanScroll) {
    throw new Error(`Segmented long Chat reply did not make the message list scrollable: ${JSON.stringify(segmented)}`);
  }
  assertComposerUsable(segmented, "segmented");
  await page.waitForTimeout(100);
  await page.screenshot({ path: join(chatLongReplyArtifactDir, "chat-long-reply-segmented.png") });

  return segmented;
}

async function readChatLongReplyState(page: Page): Promise<ChatLongReplyState> {
  return page.evaluate(() => {
    const list = document.querySelector<HTMLElement>(".message-list");
    const composer = document.querySelector<HTMLElement>(".message-composer");
    const input = document.querySelector<HTMLInputElement>('[data-testid="chat-message-input"]');
    const assistantMessage = Array.from(document.querySelectorAll<HTMLElement>(".message-list .assistant")).at(-1);
    const bubbles = assistantMessage ? Array.from(assistantMessage.querySelectorAll<HTMLElement>(".message-bubble")) : [];
    if (!list || !composer || !input || !assistantMessage || bubbles.length === 0) {
      throw new Error("Chat long reply DOM is incomplete.");
    }

    const listRect = list.getBoundingClientRect();
    const composerRect = composer.getBoundingClientRect();
    const inputRect = input.getBoundingClientRect();
    const bubbleRects = bubbles.map((bubble) => bubble.getBoundingClientRect());
    const inputTarget = document.elementFromPoint(inputRect.left + inputRect.width / 2, inputRect.top + inputRect.height / 2);

    return {
      bubbleTexts: bubbles.map((bubble) => bubble.textContent?.trim() ?? ""),
      bubbleHeights: bubbleRects.map((rect) => Math.round(rect.height)),
      toggleCount: assistantMessage.querySelectorAll('[data-testid="chat-message-toggle"]').length,
      listClientHeight: Math.round(list.clientHeight),
      listScrollHeight: Math.round(list.scrollHeight),
      listCanScroll: list.scrollHeight > list.clientHeight + 1,
      listAboveComposer: listRect.bottom <= composerRect.top + 1,
      composerInViewport: composerRect.top >= 0 && composerRect.bottom <= window.innerHeight + 1,
      inputReachable: !input.disabled && (inputTarget === input || input.contains(inputTarget)),
      noHorizontalOverflow:
        document.documentElement.scrollWidth <= window.innerWidth + 1 &&
        document.body.scrollWidth <= window.innerWidth + 1,
      bubbleFitsListWidth: bubbleRects.every((rect) => rect.left >= listRect.left - 1 && rect.right <= listRect.right + 1)
    };
  });
}

function assertComposerUsable(state: ChatLongReplyState, phase: string): void {
  if (
    !state.listAboveComposer ||
    !state.composerInViewport ||
    !state.inputReachable ||
    !state.noHorizontalOverflow ||
    !state.bubbleFitsListWidth
  ) {
    throw new Error(`Chat composer or layout is not usable after ${phase}: ${JSON.stringify(state)}`);
  }
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
