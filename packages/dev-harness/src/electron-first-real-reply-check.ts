import { _electron as electron, type ElectronApplication, type Page } from "playwright";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";
import { fileURLToPath, pathToFileURL } from "node:url";
import { join, resolve } from "node:path";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { defaultGreyfieldConfig, type GreyfieldConfig } from "@greyfield/persistence/config-schema";
import type { SessionTurn } from "@greyfield/core-runtime";
import { resolveLive2DFixturePath } from "./live2d-fixture";

const workspaceRoot = fileURLToPath(new URL("../../..", import.meta.url));
const desktopRoot = join(workspaceRoot, "apps", "desktop");
const artifactDir = resolve(workspaceRoot, ".cache", "greyfield-first-real-reply", "latest");
const tempDir = await mkdtemp(join(tmpdir(), "greyfield-first-real-reply-"));
const configPath = join(tempDir, "greyfield.config.json");
const sessionPath = join(tempDir, "sessions", "desktop-main-session.jsonl");
const apiKey = "first-real-reply-local-key";
const chatModel = "first-real-reply-model";
const nonce = `first-real-${Date.now()}`;
const expectedReply = `真实回复:${nonce}`;
const fakeReply = "你好，我醒着。现在可以继续做桌宠了。";
const requests: Array<{
  authorized: boolean;
  messages: Array<{ role: string; content: string }>;
}> = [];

await rm(artifactDir, { recursive: true, force: true });
await mkdir(artifactDir, { recursive: true });

const server = createServer(async (request: IncomingMessage, response: ServerResponse) => {
  const raw = await readRequestBody(request);
  const payload = JSON.parse(raw) as { messages?: Array<{ role?: unknown; content?: unknown }> };
  const messages = (payload.messages ?? []).flatMap((message) =>
    typeof message.role === "string" && typeof message.content === "string"
      ? [{ role: message.role, content: message.content }]
      : []
  );
  requests.push({
    authorized: request.headers.authorization === `Bearer ${apiKey}`,
    messages
  });
  const realMessage = [...messages].reverse().find((message) => message.role === "user" && message.content === nonce);
  const reply = realMessage ? expectedReply : "pong";
  response.writeHead(200, {
    "content-type": "text/event-stream",
    "cache-control": "no-cache"
  });
  response.write(`data: {"choices":[{"delta":{"content":${JSON.stringify(reply)}}}]}\n\n`);
  response.end("data: [DONE]\n\n");
});

await new Promise<void>((resolveListen) => server.listen(0, "127.0.0.1", resolveListen));
const port = (server.address() as AddressInfo).port;

await writeFile(
  configPath,
  `${JSON.stringify(
    {
      ...defaultGreyfieldConfig,
      live2d: {
        ...defaultGreyfieldConfig.live2d,
        modelPath: pathToFileURL(resolveLive2DFixturePath()).href
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
    const controlsWindow = await waitForRoleWindow(app, "controls");
    const petWindow = await waitForRoleWindow(app, "pet");
    const entryAction = controlsWindow.getByTestId("provider-experience-action");
    await entryAction.waitFor({ state: "visible" });
    const entryVisibleFromControls = await isLocatorInsideViewport(entryAction);
    const entryText = (await entryAction.textContent())?.trim() ?? "";
    if (!entryVisibleFromControls || !/配置真实聊天|Configure real chat/u.test(entryText)) {
      throw new Error(
        `Controls did not expose the ordinary real-chat setup action: ${JSON.stringify({
          entryVisibleFromControls,
          entryText,
          box: await entryAction.boundingBox(),
          viewport: controlsWindow.viewportSize()
        })}`
      );
    }
    await controlsWindow.screenshot({ path: join(artifactDir, "controls-real-chat-entry.png") });

    await entryAction.click();
    if (!(await waitForRoleWindowVisible(app, "settings"))) {
      throw new Error("Controls real-chat setup action did not show Settings");
    }
    const settingsWindow = await waitForRoleWindow(app, "settings");
    const initialProviderEvidence = await readProviderViewportEvidence(settingsWindow);
    if (!Object.values(initialProviderEvidence).every(Boolean)) {
      throw new Error(`Provider setup did not fit without scrolling: ${JSON.stringify(initialProviderEvidence)}`);
    }
    await settingsWindow.screenshot({ path: join(artifactDir, "settings-four-fields.png") });

    const providerSelect = settingsWindow.locator('[data-settings-section="provider"] select').first();
    await providerSelect.selectOption("openai-compatible");
    await settingsWindow.getByLabel("Base URL").fill(`http://127.0.0.1:${port}/v1`);
    await settingsWindow.getByLabel("API Key").fill(apiKey);
    await settingsWindow.getByLabel(/^(Chat reply|聊天回复)$/, { exact: true }).fill(chatModel);
    const filledProviderEvidence = await readProviderViewportEvidence(settingsWindow);
    if (!Object.values(filledProviderEvidence).every(Boolean)) {
      throw new Error(`Four provider fields stopped fitting after input: ${JSON.stringify(filledProviderEvidence)}`);
    }
    await settingsWindow.locator(".provider-status--ready", { hasText: /Ready to test|可以测试/ }).waitFor({ timeout: 10_000 });
    await settingsWindow.getByRole("button", { name: /^(Test LLM|测试 LLM)$/ }).click();
    await settingsWindow.locator(".provider-test-result--success", { hasText: /pong/ }).waitFor({ timeout: 10_000 });
    const testLlmSucceeded = requests.length === 1 && requests[0]?.authorized === true;
    if (!testLlmSucceeded) {
      throw new Error(`Test LLM did not reach the local OpenAI-compatible stub: ${JSON.stringify({ requestCount: requests.length })}`);
    }
    await settingsWindow.screenshot({ path: join(artifactDir, "settings-test-success.png") });

    await settingsWindow.getByRole("button", { name: /^(Chat|聊天)$/ }).click();
    if (!(await waitForRoleWindowVisible(app, "chat"))) {
      throw new Error("Settings Chat action did not show the same app's Chat window");
    }
    const chatWindow = await waitForRoleWindow(app, "chat");
    await chatWindow.getByTestId("chat-message-input").fill(nonce);
    await chatWindow.getByTestId("chat-send-button").click();
    await chatWindow.locator(".message-list .assistant:not(.draft)", { hasText: expectedReply }).waitFor({ timeout: 10_000 });
    await petWindow.locator(".speech-bubble", { hasText: expectedReply }).waitFor({ state: "visible", timeout: 10_000 });

    const realRequest = requests.find((entry) =>
      entry.messages.some((message) => message.role === "user" && message.content === nonce)
    );
    const realRequestContainedNonce = realRequest !== undefined && realRequest.authorized;
    const chatText = (await chatWindow.locator(".message-list").textContent()) ?? "";
    const petText = (await petWindow.locator(".speech-bubble").textContent()) ?? "";
    const chatDisplayedStubReply = chatText.includes(expectedReply);
    const petDisplayedStubReply = petText.includes(expectedReply);
    const fakeReplyAbsent = !chatText.includes(fakeReply) && !petText.includes(fakeReply);
    if (!realRequestContainedNonce || !chatDisplayedStubReply || !petDisplayedStubReply || !fakeReplyAbsent) {
      throw new Error(
        `Real chat reply evidence was incomplete: ${JSON.stringify({ realRequestContainedNonce, chatDisplayedStubReply, petDisplayedStubReply, fakeReplyAbsent })}`
      );
    }

    await chatWindow.screenshot({ path: join(artifactDir, "chat-real-reply.png") });
    await petWindow.screenshot({ path: join(artifactDir, "pet-real-reply.png") });
    const savedConfig = await waitForSavedConfig();
    const turns = await waitForSessionTurns();
    if (
      turns.length !== 2 ||
      turns[0]?.role !== "user" ||
      turns[0]?.content !== nonce ||
      turns[1]?.role !== "assistant" ||
      turns[1]?.content !== expectedReply
    ) {
      throw new Error(`Session JSONL did not contain only the real user/assistant turn: ${JSON.stringify(turns)}`);
    }
    if (
      savedConfig.provider.llm !== "openai-compatible" ||
      savedConfig.provider.baseUrl !== `http://127.0.0.1:${port}/v1` ||
      savedConfig.provider.apiKey !== apiKey ||
      savedConfig.provider.taskModels.chat !== chatModel
    ) {
      throw new Error("Disk config did not preserve the four real-chat settings");
    }

    console.log(
      JSON.stringify(
        {
          ok: true,
          entryVisibleFromControls,
          providerCardFitsViewport: initialProviderEvidence.providerCardFitsViewport,
          testLlmSucceeded,
          realRequestContainedNonce,
          chatDisplayedStubReply,
          petDisplayedStubReply,
          fakeReplyAbsent,
          configSavedAsOpenAICompatible: true,
          sessionContainsOnlyRealUserAssistant: true,
          artifactDir,
          artifacts: [
            "controls-real-chat-entry.png",
            "settings-four-fields.png",
            "settings-test-success.png",
            "chat-real-reply.png",
            "pet-real-reply.png"
          ].map((name) => join(artifactDir, name))
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

async function waitForRoleWindow(
  app: ElectronApplication,
  roleName: "pet" | "settings" | "chat" | "controls"
): Promise<Page> {
  const selector = {
    pet: ".pet-shell",
    settings: ".greyfield-shell",
    chat: ".chat-shell",
    controls: ".desktop-control-panel"
  }[roleName];
  const started = Date.now();
  while (Date.now() - started < 5_000) {
    for (const page of app.windows()) {
      const role = await page.evaluate(() => new URLSearchParams(window.location.search).get("window")).catch(() => null);
      if (role === roleName) {
        await page.waitForSelector(selector);
        return page;
      }
    }
    await delay(100);
  }
  throw new Error(`Timed out waiting for ${roleName} window`);
}

async function waitForRoleWindowVisible(
  app: ElectronApplication,
  roleName: "settings" | "chat"
): Promise<boolean> {
  const started = Date.now();
  while (Date.now() - started < 3_000) {
    const visible = await app.evaluate(
      ({ BrowserWindow }, targetRole) =>
        BrowserWindow.getAllWindows().some(
          (browserWindow) => browserWindow.webContents.getURL().includes(`window=${targetRole}`) && browserWindow.isVisible()
        ),
      roleName
    );
    if (visible) {
      return true;
    }
    await delay(100);
  }
  return false;
}

async function isLocatorInsideViewport(locator: ReturnType<Page["getByTestId"]>): Promise<boolean> {
  return locator.evaluate((element) => {
    const rect = element.getBoundingClientRect();
    return (
      rect.width > 0 &&
      rect.height > 0 &&
      rect.left >= 0 &&
      rect.top >= 0 &&
      rect.right <= window.innerWidth &&
      rect.bottom <= window.innerHeight
    );
  });
}

async function readProviderViewportEvidence(page: Page): Promise<{
  providerCardFitsViewport: boolean;
  fourFieldsVisible: boolean;
  testLlmVisible: boolean;
  noHiddenScroll: boolean;
}> {
  return page.evaluate(() => {
    const control = document.querySelector<HTMLElement>(".control-surface");
    const provider = document.querySelector<HTMLElement>('[data-settings-section="provider"]');
    const fields = Array.from(
      document.querySelectorAll<HTMLElement>('[data-harness="provider-first-fields"] select, [data-harness="provider-first-fields"] input')
    );
    const testButton = Array.from(provider?.querySelectorAll<HTMLButtonElement>("button") ?? []).find((button) =>
      /^(Test LLM|测试 LLM)$/u.test(button.textContent?.trim() ?? "")
    );
    const controlRect = control?.getBoundingClientRect();
    const providerRect = provider?.getBoundingClientRect();
    const testRect = testButton?.getBoundingClientRect();
    return {
      providerCardFitsViewport:
        controlRect !== undefined &&
        providerRect !== undefined &&
        providerRect.width > 0 &&
        providerRect.height > 0 &&
        providerRect.top >= controlRect.top &&
        providerRect.bottom <= controlRect.bottom,
      fourFieldsVisible:
        fields.length === 4 &&
        controlRect !== undefined &&
        fields.every((field) => {
          const rect = field.getBoundingClientRect();
          return rect.width > 0 && rect.height > 0 && rect.top >= controlRect.top && rect.bottom <= controlRect.bottom;
        }),
      testLlmVisible:
        controlRect !== undefined &&
        testRect !== undefined &&
        testRect.width > 0 &&
        testRect.height > 0 &&
        testRect.top >= controlRect.top &&
        testRect.bottom <= controlRect.bottom,
      noHiddenScroll: control?.scrollTop === 0
    };
  });
}

async function waitForSavedConfig(): Promise<GreyfieldConfig> {
  const started = Date.now();
  while (Date.now() - started < 5_000) {
    const config = JSON.parse(await readFile(configPath, "utf8")) as GreyfieldConfig;
    if (config.provider.llm === "openai-compatible" && config.provider.taskModels.chat === chatModel) {
      return config;
    }
    await delay(100);
  }
  throw new Error("Timed out waiting for the real provider config to persist");
}

async function waitForSessionTurns(): Promise<SessionTurn[]> {
  const started = Date.now();
  while (Date.now() - started < 10_000) {
    const raw = await readFile(sessionPath, "utf8").catch(() => "");
    const turns = raw
      .split(/\r?\n/)
      .filter(Boolean)
      .map((line) => JSON.parse(line) as SessionTurn);
    if (turns.some((turn) => turn.content === expectedReply)) {
      return turns;
    }
    await delay(100);
  }
  throw new Error("Timed out waiting for the real user/assistant session turns");
}

async function readRequestBody(request: IncomingMessage): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of request) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks).toString("utf8");
}

function delay(ms: number): Promise<void> {
  return new Promise((resolveDelay) => setTimeout(resolveDelay, ms));
}
