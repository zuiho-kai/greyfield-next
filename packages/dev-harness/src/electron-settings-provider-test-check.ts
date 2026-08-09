import { _electron as electron, type ElectronApplication, type Page } from "playwright";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import { mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { defaultGreyfieldConfig, type GreyfieldConfig } from "@greyfield/persistence/config-schema";

const workspaceRoot = fileURLToPath(new URL("../../..", import.meta.url));
const desktopRoot = join(workspaceRoot, "apps", "desktop");
const tempDir = await mkdtemp(join(tmpdir(), "greyfield-settings-provider-test-"));
const configPath = join(tempDir, "greyfield.config.json");
const apiKey = "local-settings-provider-key";
const responseBodyMarker = "upstream-private-body-marker";
const syntheticSecret = "sk-provider-status-secret";
const syntheticRequestBodyMarker = "provider-request-body-marker";
const syntheticStackMarker = "at-provider-harness.ts:404:12";
const injectedDiagnostics = `${syntheticSecret} ${syntheticRequestBodyMarker} ${syntheticStackMarker}`;
const preservedTaskModels = {
  chat: "greyfield-fake-v1",
  planner: "preserved-planner-model",
  utility: "preserved-utility-model",
  memory: "preserved-memory-model",
  vision: "preserved-vision-model",
  multimodal: "preserved-multimodal-model",
  voiceAsr: "preserved-asr-model",
  voiceTts: "preserved-tts-model"
};

type ResponseMode = "success" | "unauthorized" | "forbidden" | "not-found" | "timeout" | "no-token" | "malformed";

let responseMode: ResponseMode = "success";
const requestCountByMode: Record<ResponseMode, number> = {
  success: 0,
  unauthorized: 0,
  forbidden: 0,
  "not-found": 0,
  timeout: 0,
  "no-token": 0,
  malformed: 0
};

const server = createServer(async (_request: IncomingMessage, response: ServerResponse) => {
  const mode = responseMode;
  requestCountByMode[mode] += 1;

  if (mode === "timeout") {
    await delay(800);
    if (!response.destroyed) {
      response.statusMessage = `Gateway Timeout ${injectedDiagnostics}`;
      response.writeHead(504, { "content-type": "application/json" });
      response.end(JSON.stringify({ error: `${responseBodyMarker} ${injectedDiagnostics}` }));
    }
    return;
  }

  await delay(80);
  if (mode === "unauthorized") {
    writeHttpFailure(response, 401, "Unauthorized");
    return;
  }
  if (mode === "forbidden") {
    writeHttpFailure(response, 403, "Forbidden");
    return;
  }
  if (mode === "not-found") {
    writeHttpFailure(response, 404, "Not Found");
    return;
  }

  response.writeHead(200, {
    "content-type": "text/event-stream",
    "cache-control": "no-cache"
  });
  if (mode === "malformed") {
    response.end(`data: ${injectedDiagnostics}\n\n`);
    return;
  }
  if (mode === "no-token") {
    response.write(`: ${injectedDiagnostics}\n\n`);
    response.end("data: [DONE]\n\n");
    return;
  }
  response.write('data: {"choices":[{"delta":{"content":"pong"}}]}\n\n');
  response.end("data: [DONE]\n\n");
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
        taskModels: preservedTaskModels
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
    const settingsWindow = await waitForRoleWindow(app, "settings");
    const chatWindow = await waitForRoleWindow(app, "chat");
    const controlsWindow = await waitForRoleWindow(app, "controls");
    const initialChatMessageCount = await chatWindow.locator(".message-list .message-item").count();
    const initialChatVisible = await isRoleWindowVisible(app, "chat");
    const initialEvidence = await readInitialProviderEvidence(settingsWindow);
    if (!Object.values(initialEvidence).every(Boolean)) {
      throw new Error(`Provider-first Settings did not fit the initial viewport: ${JSON.stringify(initialEvidence)}`);
    }

    await settingsWindow.locator(".provider-status--preview", { hasText: /Preview|预览模式/ }).waitFor({ timeout: 10_000 });
    const providerSelect = settingsWindow.locator('[data-settings-section="provider"] select').first();
    if ((await providerSelect.inputValue()) !== "fake") {
      throw new Error("Settings did not start in fake provider preview mode");
    }

    const testButton = settingsWindow.getByRole("button", { name: /^(Test LLM|测试 LLM)$/ });
    await testButton.click();
    await settingsWindow.locator(".provider-test-result--success", { hasText: /Test succeeded|测试成功/ }).waitFor({
      timeout: 10_000
    });
    assertProviderRequestCount(0, "fake preview test");

    await settingsWindow.getByLabel("Base URL").fill("");
    await settingsWindow.getByLabel("API Key").fill("");
    await settingsWindow.getByLabel(/^(Chat reply|聊天回复)$/, { exact: true }).fill("");
    await providerSelect.selectOption("openai-compatible");
    await settingsWindow.locator(".provider-status--blocked", { hasText: /Needs Base URL|需要 Base URL/ }).waitFor();
    await expectTestLlmBlocked(settingsWindow, /OpenAI-compatible chat needs a Base URL|Base URL/);
    assertProviderRequestCount(0, "missing Base URL");

    await settingsWindow.getByLabel("Base URL").fill(`http://127.0.0.1:${port}/v1`);
    await waitForSelectValue(providerSelect, "openai-compatible");
    await settingsWindow.locator(".provider-status--blocked", { hasText: /Needs API key|需要 API key/ }).waitFor();
    await expectTestLlmBlocked(settingsWindow, /Add an API key before testing|API key/);
    assertProviderRequestCount(0, "missing API key");

    await settingsWindow.getByLabel("API Key").fill(apiKey);
    await settingsWindow.locator(".provider-status--blocked", { hasText: /Needs model|需要模型/ }).waitFor();
    await expectTestLlmBlocked(settingsWindow, /Choose the provider model name|模型名称/);
    assertProviderRequestCount(0, "missing chat model");

    await settingsWindow.getByLabel(/^(Chat reply|聊天回复)$/, { exact: true }).fill("settings-provider-test-model");
    await settingsWindow.locator(".provider-status--ready", { hasText: /Ready to test|可以测试/ }).waitFor();
    if (!(await testButton.isEnabled())) {
      throw new Error("Test LLM stayed disabled after the four provider fields were complete");
    }

    responseMode = "success";
    await testButton.click();
    await settingsWindow.getByRole("button", { name: /^(Testing\.\.\.|测试中\.\.\.)$/ }).waitFor();
    await settingsWindow.locator(".provider-test-result--testing", { hasText: /Testing LLM|正在测试 LLM/ }).waitFor();
    await settingsWindow.locator(".provider-test-result--success", { hasText: /Received first token: pong|收到首个 token：pong/ }).waitFor({
      timeout: 10_000
    });

    await runProviderFailure(settingsWindow, controlsWindow, chatWindow, "unauthorized", /凭据未通过|Credentials were rejected/);
    await runProviderFailure(settingsWindow, controlsWindow, chatWindow, "forbidden", /没有访问权限|do not have access/);
    await runProviderFailure(settingsWindow, controlsWindow, chatWindow, "not-found", /Base URL.*聊天模型不存在|Base URL or chat model was not found/);
    await runProviderFailure(settingsWindow, controlsWindow, chatWindow, "timeout", /连接超时|Connection timed out/);
    await runProviderFailure(settingsWindow, controlsWindow, chatWindow, "no-token", /首个回复 token 前断开|before the first reply token/);
    await runProviderFailure(settingsWindow, controlsWindow, chatWindow, "malformed", /流格式异常|invalid stream/);

    const savedConfig = await waitForSavedConfig();
    assertAdvancedTaskModelsPreserved(savedConfig);
    const sessionWrites = await readSessionWrites();
    if (sessionWrites.length > 0) {
      throw new Error(`Test LLM wrote chat session data: ${JSON.stringify(sessionWrites.map((item) => item.file))}`);
    }
    const finalChatMessageCount = await chatWindow.locator(".message-list .message-item").count();
    const finalChatVisible = await isRoleWindowVisible(app, "chat");
    if (initialChatMessageCount !== finalChatMessageCount || initialChatVisible !== finalChatVisible || finalChatVisible) {
      throw new Error(
        `Test LLM changed or opened Chat: ${JSON.stringify({ initialChatMessageCount, finalChatMessageCount, initialChatVisible, finalChatVisible })}`
      );
    }
    if (savedConfig.voice.speechEnabled || (await settingsWindow.locator(".audio-strip span").count()) > 0) {
      throw new Error("Test LLM enabled voice or queued speech playback");
    }

    assertProviderRequestCount(7, "success plus six failure tests");
    console.log(
      JSON.stringify(
        {
          ok: true,
          providerCardFitsViewport: true,
          fourFieldsVisible: true,
          testLlmVisible: true,
          advancedDefaultClosed: true,
          missingBaseUrlBlocked: true,
          missingApiKeyBlocked: true,
          missingModelBlocked: true,
          unauthorizedReadableAndRetryable: true,
          forbiddenReadableAndRetryable: true,
          notFoundReadableAndRetryable: true,
          timeoutReadableAndRetryable: true,
          disconnectedBeforeFirstTokenReadableAndRetryable: true,
          malformedStreamReadableAndRetryable: true,
          failureMessagesRedacted: true,
          controlsAndChatFailureMessagesRedacted: true,
          advancedTaskModelsPreserved: true,
          testLlmDidNotWriteSession: true,
          testLlmDidNotOpenChat: true,
          testLlmDidNotEnableVoice: true,
          providerRequests: totalProviderRequestCount()
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

function writeHttpFailure(response: ServerResponse, status: number, statusMessage: string): void {
  response.statusMessage = `${statusMessage} ${injectedDiagnostics}`;
  response.writeHead(status, { "content-type": "application/json" });
  response.end(JSON.stringify({ error: `${responseBodyMarker} ${injectedDiagnostics}` }));
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
      GREYFIELD_USER_DATA_PATH: tempDir,
      GREYFIELD_LLM_TIMEOUT_MS: "250"
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

async function waitForRoleWindow(app: ElectronApplication, roleName: "settings" | "chat" | "controls"): Promise<Page> {
  const started = Date.now();
  while (Date.now() - started < 5_000) {
    for (const page of app.windows()) {
      const role = await page.evaluate(() => new URLSearchParams(window.location.search).get("window")).catch(() => null);
      if (role === roleName) {
        await page.waitForSelector(
          roleName === "settings" ? ".greyfield-shell" : roleName === "chat" ? ".chat-shell" : ".desktop-controls-shell"
        );
        return page;
      }
    }
    await delay(100);
  }
  throw new Error(`Timed out waiting for ${roleName} window`);
}

async function readInitialProviderEvidence(page: Page): Promise<{
  providerCardFitsViewport: boolean;
  fourFieldsVisible: boolean;
  testLlmVisible: boolean;
  advancedTaskModelsClosed: boolean;
  advancedSettingsClosed: boolean;
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
    const taskModels = document.querySelector<HTMLDetailsElement>('[data-harness="provider-advanced-models"]');
    const advancedSettings = document.querySelector<HTMLButtonElement>('[data-harness="settings-advanced-toggle"]');
    const advancedContent = document.querySelector<HTMLElement>('[data-harness="settings-advanced-content"]');
    const controlRect = control?.getBoundingClientRect();
    const providerRect = provider?.getBoundingClientRect();
    const testRect = testButton?.getBoundingClientRect();
    const advancedContentRect = advancedContent?.getBoundingClientRect();
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
      advancedTaskModelsClosed: taskModels?.open === false,
      advancedSettingsClosed:
        advancedSettings?.getAttribute("aria-expanded") === "false" &&
        (advancedContentRect?.width ?? 0) === 0 &&
        (advancedContentRect?.height ?? 0) === 0
    };
  });
}

async function runProviderFailure(
  page: Page,
  controlsPage: Page,
  chatPage: Page,
  mode: Exclude<ResponseMode, "success">,
  expected: RegExp
): Promise<void> {
  responseMode = mode;
  const button = page.getByRole("button", { name: /^(Test LLM|测试 LLM)$/ });
  await button.click();
  const result = page.locator(".provider-test-result--error", { hasText: expected });
  await result.waitFor({ timeout: 10_000 });
  const text = (await result.textContent())?.trim() ?? "";
  if (text.length === 0 || text.length > 180 || !/重试|重新测试|retry/iu.test(text)) {
    throw new Error(`Provider failure did not show short retry guidance for ${mode}: ${text}`);
  }
  const settingsDetail = (await result.locator("span").textContent())?.trim() ?? "";
  const chatExperience = chatPage.getByTestId("chat-provider-experience");
  await chatExperience.locator("span", { hasText: expected }).waitFor({ timeout: 10_000 });
  const chatDetail = (await chatExperience.locator("span").textContent())?.trim() ?? "";
  if (settingsDetail !== chatDetail) {
    throw new Error(`Settings and Chat did not share the same safe provider failure for ${mode}`);
  }
  await controlsPage.getByTestId("provider-experience").filter({ hasText: /Connection test failed|连接测试失败/ }).waitFor();
  await controlsPage.getByTestId("provider-experience-action").filter({ hasText: /Retest|重新测试/ }).waitFor();
  const surfaceTexts = [
    await page.locator("body").innerText(),
    await controlsPage.locator("body").innerText(),
    await chatPage.locator("body").innerText()
  ];
  for (const sensitive of [
    apiKey,
    responseBodyMarker,
    syntheticSecret,
    syntheticRequestBodyMarker,
    syntheticStackMarker,
    "at unsafe.ts",
    "api_key"
  ]) {
    if (surfaceTexts.some((surfaceText) => surfaceText.includes(sensitive))) {
      throw new Error(`Provider failure leaked sensitive diagnostics across renderer surfaces for ${mode}`);
    }
  }
  if (!(await button.isEnabled())) {
    throw new Error(`Test LLM was not retryable after ${mode}`);
  }
}

async function expectTestLlmBlocked(page: Page, message: RegExp): Promise<void> {
  const button = page.getByRole("button", { name: /^(Test LLM|测试 LLM)$/ });
  if (!(await button.isDisabled())) {
    throw new Error(`Test LLM was not disabled for blocked provider state: ${message}`);
  }
  await page.locator(".provider-test-result--error", { hasText: message }).first().waitFor({ timeout: 10_000 });
}

async function waitForSavedConfig(): Promise<GreyfieldConfig> {
  const started = Date.now();
  while (Date.now() - started < 5_000) {
    const raw = await readFile(configPath, "utf8");
    const config = JSON.parse(raw) as GreyfieldConfig;
    if (
      config.provider.llm === "openai-compatible" &&
      config.provider.baseUrl === `http://127.0.0.1:${port}/v1` &&
      config.provider.apiKey === apiKey &&
      config.provider.taskModels.chat === "settings-provider-test-model"
    ) {
      return config;
    }
    await delay(100);
  }
  throw new Error("Timed out waiting for the four provider fields to persist");
}

function assertAdvancedTaskModelsPreserved(config: GreyfieldConfig): void {
  for (const slot of ["planner", "utility", "memory", "vision", "multimodal", "voiceAsr", "voiceTts"] as const) {
    if (config.provider.taskModels[slot] !== preservedTaskModels[slot]) {
      throw new Error(`Basic provider setup rewrote advanced task model slot ${slot}`);
    }
  }
}

async function readSessionWrites(): Promise<Array<{ file: string; content: string }>> {
  const sessionDir = join(tempDir, "sessions");
  const files = await readdir(sessionDir).catch(() => [] as string[]);
  const writes: Array<{ file: string; content: string }> = [];
  for (const file of files.filter((entry) => entry.endsWith(".jsonl"))) {
    const content = await readFile(join(sessionDir, file), "utf8");
    if (content.trim().length > 0) {
      writes.push({ file, content });
    }
  }
  return writes;
}

async function isRoleWindowVisible(app: ElectronApplication, roleName: "chat"): Promise<boolean> {
  return app.evaluate(
    ({ BrowserWindow }, targetRole) =>
      BrowserWindow.getAllWindows().some(
        (browserWindow) => browserWindow.webContents.getURL().includes(`window=${targetRole}`) && browserWindow.isVisible()
      ),
    roleName
  );
}

function totalProviderRequestCount(): number {
  return Object.values(requestCountByMode).reduce((total, count) => total + count, 0);
}

function assertProviderRequestCount(expected: number, label: string): void {
  const actual = totalProviderRequestCount();
  if (actual !== expected) {
    throw new Error(`Unexpected provider request count for ${label}; expected=${expected}, actual=${actual}`);
  }
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForSelectValue(select: ReturnType<Page["getByLabel"]>, value: string): Promise<void> {
  const started = Date.now();
  while (Date.now() - started < 5_000) {
    if ((await select.inputValue()) === value) {
      return;
    }
    await delay(100);
  }
  throw new Error(`Timed out waiting for provider select to become ${value}`);
}
