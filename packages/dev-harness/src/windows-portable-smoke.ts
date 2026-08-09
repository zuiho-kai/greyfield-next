import { spawn, execFile, type ChildProcessWithoutNullStreams } from "node:child_process";
import { createHash } from "node:crypto";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { basename, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { cp, mkdir, mkdtemp, readFile, readdir, rm, stat, writeFile } from "node:fs/promises";
import { chromium, type Browser, type Page } from "playwright";

const execFileAsync = promisify(execFile);
const workspaceRoot = fileURLToPath(new URL("../../..", import.meta.url));
const packageArtifactsDir = join(workspaceRoot, ".cache", "greyfield-windows-portable", "artifacts");
const evidenceDir = join(workspaceRoot, ".cache", "greyfield-packaged-smoke", "latest");
const expectedArtifactName = "Greyfield-0.1.0-preview.1-win-x64-portable.exe";
const launchRoot = await mkdtemp(join(tmpdir(), "greyfield-packaged-smoke-"));
const externalExeDir = join(launchRoot, "portable");
const userDataPath = join(launchRoot, "user-data");
const externalExecutablePath = join(externalExeDir, expectedArtifactName);
const configPath = join(userDataPath, "greyfield.config.json");
const sessionPath = join(userDataPath, "sessions", "desktop-main-session.jsonl");
const characterPath = join(userDataPath, "characters", "greyfield.yaml");
const memorySeedPath = join(userDataPath, "data", "memory.md");
const apiKey = `portable-key-${Date.now()}`;
const chatModel = "portable-smoke-model";
const testNonce = `test-${Date.now()}`;
const realNonce = `real-${Date.now()}`;
const abortNonce = `abort-${Date.now()}`;
const lateNonce = `late-${Date.now()}`;
const restartNonce = `restart-${Date.now()}`;
const expectedRealReply = `真实回复:${realNonce}`;
const expectedRestartReply = `重启回复:${restartNonce}`;
const abortSentence = "语音已经开始。";
const fakeReply = "你好，我醒着。现在可以继续做桌宠了。";
const screenshots = {
  pet: join(evidenceDir, "pet.png"),
  controlsTrial: join(evidenceDir, "controls-trial.png"),
  settingsRealConfig: join(evidenceDir, "settings-real-config.png"),
  chatRealReply: join(evidenceDir, "chat-real-reply.png"),
  chatStopped: join(evidenceDir, "chat-stopped.png"),
  restart: join(evidenceDir, "restart.png")
};
const repositoryEvidencePaths = [
  "greyfield.config.json",
  ".cache/greyfield-desktop/greyfield.config.json",
  "characters/greyfield.yaml",
  "data/memory.md"
];

type RequestKind = "test" | "real" | "abort" | "restart" | "unexpected";

interface StubRequest {
  path: string;
  kind: RequestKind;
  authorized: boolean;
  model: string;
  messages: Array<{ role: string; content: string }>;
}

interface NativeProcess {
  processId: number;
  parentProcessId: number;
  name: string;
  commandLine: string;
}

interface PortableLaunch {
  browser: Browser;
  process: ChildProcessWithoutNullStreams;
  cdpPort: number;
  output: string[];
  processTree: NativeProcess[];
}

const requests: StubRequest[] = [];
let abortRequestClosed = false;
let abortLateWriteAttempted = false;
let abortResponse: ServerResponse | undefined;

await rm(evidenceDir, { recursive: true, force: true });
await mkdir(evidenceDir, { recursive: true });
await mkdir(externalExeDir, { recursive: true });

const artifactPath = await resolveUniquePortableArtifact();
const artifact = {
  fileName: basename(artifactPath),
  bytes: (await stat(artifactPath)).size,
  sha256: await sha256File(artifactPath)
};
if (artifact.fileName !== expectedArtifactName || artifact.bytes <= 0 || artifact.sha256.length !== 64) {
  throw new Error(`Portable artifact identity is invalid: ${JSON.stringify(artifact)}`);
}
await cp(artifactPath, externalExecutablePath);
const copiedArtifactHash = await sha256File(externalExecutablePath);
if (copiedArtifactHash !== artifact.sha256) {
  throw new Error("Repository-external portable copy did not preserve the artifact hash");
}

const repositoryHashesBefore = await hashRepositoryEvidence();
const stubServer = createServer((request, response) => {
  void handleStubRequest(request, response).catch(() => {
    response.destroy();
  });
});
await new Promise<void>((resolveListen) => stubServer.listen(0, "127.0.0.1", resolveListen));
const stubPort = (stubServer.address() as AddressInfo).port;
const providerBaseUrl = `http://127.0.0.1:${stubPort}/v1`;
const stubValidation = await assertStubRejectsInvalidRequests(providerBaseUrl);

let firstLaunch: PortableLaunch | undefined;
let secondLaunch: PortableLaunch | undefined;
try {
  firstLaunch = await launchPortable();
  const firstPages = await readRolePages(firstLaunch.browser);
  const firstRendererUrls = rolePagesToUrls(firstPages);
  assertFileRenderers(firstRendererUrls);
  firstLaunch.processTree = await readDescendantProcessTree(firstLaunch.process.pid!);
  assertNoDevelopmentProcesses(firstLaunch.processTree);

  const petWindow = firstPages.pet;
  const controlsWindow = firstPages.controls;
  const settingsWindow = firstPages.settings;
  const chatWindow = firstPages.chat;
  const paintedPixels = await waitForLive2D(petWindow);
  const usedFallback = await petWindow
    .locator(".live2d-stage-view")
    .getAttribute("data-stage-mode")
    .then((mode) => mode !== "live2d");
  if (usedFallback || paintedPixels < 2_000) {
    throw new Error(`Packaged Live2D acceptance failed: ${JSON.stringify({ usedFallback, paintedPixels })}`);
  }
  await petWindow.screenshot({ path: screenshots.pet });

  const windowBounds = {
    pet: await readVisibleWindowEvidence(petWindow, "pet"),
    controls: await readVisibleWindowEvidence(controlsWindow, "controls")
  };
  const controlsTrial = await readControlsTrialEvidence(controlsWindow);
  if (!Object.values(controlsTrial).every(Boolean)) {
    throw new Error(`Packaged Controls trial disclosure is incomplete: ${JSON.stringify(controlsTrial)}`);
  }
  await controlsWindow.screenshot({ path: screenshots.controlsTrial });

  await controlsWindow.getByTestId("provider-experience-action").click();
  await waitForPageFocus(settingsWindow, "Settings");
  const providerViewport = await readProviderViewportEvidence(settingsWindow);
  if (!Object.values(providerViewport).every(Boolean)) {
    throw new Error(`Packaged provider setup is not first-glance usable: ${JSON.stringify(providerViewport)}`);
  }
  await configureRealProvider(settingsWindow);
  await settingsWindow.getByRole("button", { name: /^(Test LLM|测试 LLM)$/u }).click();
  await settingsWindow.locator(".provider-test-result--success", { hasText: testNonce }).waitFor({ timeout: 15_000 });
  const testRequest = requests.find((request) => request.kind === "test");
  if (!testRequest?.authorized || testRequest.model !== chatModel) {
    throw new Error(`Test LLM did not reach the packaged stub correctly: ${JSON.stringify(testRequest)}`);
  }
  await settingsWindow.screenshot({ path: screenshots.settingsRealConfig });
  await selectDeterministicFakeTts(settingsWindow);

  await settingsWindow.getByRole("button", { name: /^(Chat|聊天)$/u }).click();
  await waitForPageFocus(chatWindow, "Chat");
  await sendChatMessage(chatWindow, realNonce);
  await chatWindow.locator(".message-list .assistant:not(.draft)", { hasText: expectedRealReply }).waitFor({ timeout: 15_000 });
  await petWindow.locator(".speech-bubble", { hasText: expectedRealReply }).waitFor({ timeout: 15_000 });
  const realRequest = requests.find((request) => request.kind === "real");
  const realSurfaceText = `${await chatWindow.locator(".message-list").textContent()} ${await petWindow.locator(".speech-bubble").textContent()}`;
  if (!realRequest?.authorized || !realSurfaceText.includes(expectedRealReply) || realSurfaceText.includes(fakeReply)) {
    throw new Error("Packaged real reply did not replace the fake preview path");
  }
  await chatWindow.screenshot({ path: screenshots.chatRealReply });

  await installSpeechProbe(petWindow);
  const speechToggle = controlsWindow.getByRole("button", {
    name: /^(Turn voice output on|开启语音输出)$/u
  });
  await speechToggle.click();
  await controlsWindow.getByRole("button", { name: /^(Turn voice output off|关闭语音输出)$/u }).waitFor();
  await sendChatMessage(chatWindow, abortNonce);
  await waitForSpeechEvent(petWindow, "speak");
  await waitForAudioQueue(settingsWindow, (count) => count > 0, "started fake TTS playback");
  const stopButton = controlsWindow.getByRole("button", {
    name: /^(Stop reply or voice|停止回复或语音)$/u,
    exact: true
  });
  if (!(await stopButton.isEnabled())) {
    throw new Error("Packaged Controls Stop was disabled during provider/TTS activity");
  }
  await stopButton.click();
  await waitForAbortClose();
  await waitForSpeechEvent(petWindow, "cancel");
  await waitForAudioQueue(settingsWindow, (count) => count === 0, "cleared fake TTS queue");
  await petWindow.waitForFunction(() => {
    const stage = document.querySelector<HTMLElement>(".live2d-stage-view");
    return Number(stage?.dataset.mouthOpen ?? "1") === 0;
  });
  await delay(1_800);
  const stoppedState = await chatWindow.evaluate(
    ({ late, initial }) => ({
      text: document.querySelector(".message-list")?.textContent ?? "",
      assistantDraftCount: document.querySelectorAll(".message-list .assistant.draft").length,
      latePresent: (document.querySelector(".message-list")?.textContent ?? "").includes(late),
      abortedSentencePresent: (document.querySelector(".message-list")?.textContent ?? "").includes(initial)
    }),
    { late: lateNonce, initial: abortSentence }
  );
  const speechEvents = await readSpeechEvents(petWindow);
  const mouthOpen = await petWindow
    .locator(".live2d-stage-view")
    .getAttribute("data-mouth-open")
    .then((value) => Number(value ?? "0"));
  if (
    !abortRequestClosed ||
    !abortLateWriteAttempted ||
    stoppedState.assistantDraftCount !== 0 ||
    stoppedState.latePresent ||
    stoppedState.abortedSentencePresent ||
    !speechEvents.some((event) => event.startsWith("speak:")) ||
    !speechEvents.includes("cancel") ||
    mouthOpen !== 0
  ) {
    throw new Error(
      `Packaged Stop evidence failed: ${JSON.stringify({ abortRequestClosed, abortLateWriteAttempted, stoppedState, speechEvents, mouthOpen })}`
    );
  }
  await chatWindow.screenshot({ path: screenshots.chatStopped });

  const savedConfig = await waitForJsonFile(configPath);
  const savedSessionLines = await waitForSessionLines(2);
  assertSavedProvider(savedConfig);
  if (
    savedSessionLines.length !== 2 ||
    savedSessionLines[0]?.content !== realNonce ||
    savedSessionLines[1]?.content !== expectedRealReply
  ) {
    throw new Error(`Stopped turn leaked into packaged session: ${JSON.stringify(savedSessionLines)}`);
  }
  await assertBootstrapFilesExist();

  const firstProcessTree = firstLaunch.processTree;
  await closePortable(firstLaunch);
  firstLaunch = undefined;

  secondLaunch = await launchPortable();
  const secondPages = await readRolePages(secondLaunch.browser);
  const secondRendererUrls = rolePagesToUrls(secondPages);
  assertFileRenderers(secondRendererUrls);
  secondLaunch.processTree = await readDescendantProcessTree(secondLaunch.process.pid!);
  assertNoDevelopmentProcesses(secondLaunch.processTree);
  const restartPaintedPixels = await waitForLive2D(secondPages.pet);
  const restartUsedFallback =
    (await secondPages.pet.locator(".live2d-stage-view").getAttribute("data-stage-mode")) !== "live2d";
  if (restartUsedFallback || restartPaintedPixels < 2_000) {
    throw new Error("Restarted packaged Live2D fell back or rendered empty");
  }

  await secondPages.controls.getByTestId("provider-experience-action").click();
  await waitForPageFocus(secondPages.settings, "restarted Settings");
  const restartProviderUi = await readRestartProviderUi(secondPages.settings);
  if (!Object.values(restartProviderUi).every(Boolean)) {
    throw new Error(`Restart did not preserve packaged provider settings: ${JSON.stringify(restartProviderUi)}`);
  }
  await secondPages.settings.getByRole("button", { name: /^(Chat|聊天)$/u }).click();
  await waitForPageFocus(secondPages.chat, "restarted Chat");
  const continuity = secondPages.chat.getByTestId("session-continuity-notice");
  await continuity.waitFor({ state: "visible", timeout: 10_000 });
  const continuityText = (await continuity.textContent())?.trim() ?? "";
  const requestCountBeforeRestartSend = requests.length;
  const restoredRecentMessageCount = /(?:最近\s*2\s*条|latest\s*2\s*conversation messages)/iu.test(continuityText);
  const continuityTruthful = /不是长期记忆|not long-term memory/iu.test(continuityText);
  if (!restoredRecentMessageCount || !continuityTruthful || requestCountBeforeRestartSend !== 3) {
    throw new Error(
      `Restart continuity was not visible before send: ${JSON.stringify({
        continuityText,
        requestCountBeforeRestartSend,
        requests: requests.map((request) => ({
          path: request.path,
          kind: request.kind,
          latestUser: [...request.messages].reverse().find((message) => message.role === "user")?.content ?? ""
        }))
      })}`
    );
  }
  await secondPages.chat.getByTestId("chat-message-input").fill("");
  await secondPages.chat.screenshot({ path: screenshots.restart });
  await sendChatMessage(secondPages.chat, restartNonce);
  await secondPages.chat
    .locator(".message-list .assistant:not(.draft)", { hasText: expectedRestartReply })
    .waitFor({ timeout: 15_000 });
  const restartRequest = requests.find((request) => request.kind === "restart");
  const restartContextContainsFirstTurn =
    restartRequest?.messages.some((message) => message.role === "user" && message.content === realNonce) === true &&
    restartRequest.messages.some(
      (message) => message.role === "assistant" && message.content === expectedRealReply
    );
  if (!restartRequest?.authorized || !restartContextContainsFirstTurn) {
    throw new Error(`Restart request missed the first packaged turn: ${JSON.stringify(restartRequest)}`);
  }

  const secondProcessTree = secondLaunch.processTree;
  await closePortable(secondLaunch);
  secondLaunch = undefined;

  const repositoryHashesAfter = await hashRepositoryEvidence();
  if (JSON.stringify(repositoryHashesAfter) !== JSON.stringify(repositoryHashesBefore)) {
    throw new Error(
      `Packaged smoke modified repository config/persona/data: ${JSON.stringify({ repositoryHashesBefore, repositoryHashesAfter })}`
    );
  }
  const executableDirectoryClean = await assertExternalExecutableDirectoryClean();
  const userDataEvidence = await readUserDataEvidence();
  const summary = {
    ok: true,
    artifact,
    externalExecutablePath,
    copiedArtifactHash,
    rendererSchemes: [
      ...new Set(
        [...Object.values(firstRendererUrls), ...Object.values(secondRendererUrls)].map((url) => new URL(url).protocol)
      )
    ],
    rendererUrls: { first: firstRendererUrls, restart: secondRendererUrls },
    windowBounds,
    paintedPixels,
    restartPaintedPixels,
    usedFallback: false,
    restartUsedFallback: false,
    controlsTrial,
    providerViewport,
    stubValidation,
    testNonce,
    realNonce,
    abortNonce,
    lateNonce,
    restartNonce,
    providerRequests: requests.map((request) => ({
      kind: request.kind,
      authorized: request.authorized,
      model: request.model,
      messageCount: request.messages.length
    })),
    realReply: {
      chatAndPetDisplayed: true,
      fakeReplyAbsent: true
    },
    stop: {
      providerRequestAborted: abortRequestClosed,
      lateWriteAttempted: abortLateWriteAttempted,
      lateTextAbsent: !stoppedState.latePresent,
      assistantDraftCount: stoppedState.assistantDraftCount,
      audioQueueEmpty: true,
      speechEvents,
      speechCanceled: speechEvents.includes("cancel"),
      mouthOpen
    },
    configPath,
    userDataPath,
    userDataEvidence,
    executableDirectoryClean,
    restartContext: {
      providerSettingsPersisted: Object.values(restartProviderUi).every(Boolean),
      restoredRecentMessageCount,
      restoredBeforeSecondSend: requestCountBeforeRestartSend === 3,
      continuityTruthful,
      firstTurnIncludedInSecondRequest: restartContextContainsFirstTurn
    },
    repositoryHashesBefore,
    repositoryHashesAfter,
    repositoryHashesUnchanged: true,
    processTrees: { first: firstProcessTree, restart: secondProcessTree },
    developmentProcessesAbsent: true,
    screenshots
  };
  await writeFile(join(evidenceDir, "summary.json"), `${JSON.stringify(summary, null, 2)}\n`, "utf8");
  process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`);
} finally {
  if (firstLaunch) {
    await closePortable(firstLaunch).catch(() => undefined);
  }
  if (secondLaunch) {
    await closePortable(secondLaunch).catch(() => undefined);
  }
  abortResponse?.destroy();
  stubServer.closeAllConnections?.();
  stubServer.close();
  await rm(launchRoot, { recursive: true, force: true }).catch(() => undefined);
}

async function handleStubRequest(request: IncomingMessage, response: ServerResponse): Promise<void> {
  if (request.method !== "POST" || request.url !== "/v1/chat/completions") {
    respondWithJsonError(response, 404, "unsupported request");
    return;
  }
  const raw = await readRequestBody(request);
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    respondWithJsonError(response, 400, "invalid json");
    return;
  }
  if (
    typeof parsed !== "object" ||
    parsed === null ||
    typeof (parsed as { model?: unknown }).model !== "string" ||
    !Array.isArray((parsed as { messages?: unknown }).messages) ||
    !(parsed as { messages: unknown[] }).messages.every(
      (message) =>
        typeof message === "object" &&
        message !== null &&
        typeof (message as { role?: unknown }).role === "string" &&
        typeof (message as { content?: unknown }).content === "string"
    )
  ) {
    respondWithJsonError(response, 400, "invalid chat payload");
    return;
  }
  const payload = parsed as {
    model?: unknown;
    messages?: Array<{ role?: unknown; content?: unknown }>;
  };
  const messages = (payload.messages ?? []).flatMap((message) =>
    typeof message.role === "string" && typeof message.content === "string"
      ? [{ role: message.role, content: message.content }]
      : []
  );
  const latestUser = [...messages].reverse().find((message) => message.role === "user")?.content ?? "";
  const kind: RequestKind =
    latestUser === realNonce
      ? "real"
      : latestUser === abortNonce
        ? "abort"
        : latestUser === restartNonce
          ? "restart"
          : requests.some((entry) => entry.kind === "test")
            ? "unexpected"
            : "test";
  requests.push({
    path: request.url ?? "",
    kind,
    authorized: request.headers.authorization === `Bearer ${apiKey}`,
    model: typeof payload.model === "string" ? payload.model : "",
    messages
  });
  response.writeHead(200, {
    "content-type": "text/event-stream",
    "cache-control": "no-cache",
    connection: "keep-alive"
  });
  if (kind === "abort") {
    abortResponse = response;
    response.on("error", () => {
      abortRequestClosed = true;
    });
    response.write(`data: {"choices":[{"delta":{"content":${JSON.stringify(abortSentence)}}}]}\n\n`);
    response.on("close", () => {
      abortRequestClosed = true;
    });
    request.on("aborted", () => {
      abortRequestClosed = true;
    });
    const lateWrite = setTimeout(() => {
      abortLateWriteAttempted = true;
      if (response.destroyed || response.closed || response.writableEnded) {
        return;
      }
      try {
        response.write(`data: {"choices":[{"delta":{"content":${JSON.stringify(lateNonce)}}}]}\n\n`);
        response.end("data: [DONE]\n\n");
      } catch {
        abortRequestClosed = true;
        response.destroy();
      }
    }, 1_200);
    lateWrite.unref();
    return;
  }
  const reply =
    kind === "real"
      ? expectedRealReply
      : kind === "restart"
        ? expectedRestartReply
        : kind === "test"
          ? `连接测试:${testNonce}`
          : "unexpected-request";
  response.end(`data: {"choices":[{"delta":{"content":${JSON.stringify(reply)}}}]}\n\ndata: [DONE]\n\n`);
}

function respondWithJsonError(response: ServerResponse, status: number, error: string): void {
  response.writeHead(status, { "content-type": "application/json" });
  response.end(`${JSON.stringify({ error })}\n`);
}

async function assertStubRejectsInvalidRequests(providerBaseUrl: string): Promise<{
  unsupportedStatus: number;
  invalidJsonStatus: number;
  invalidPayloadStatus: number;
}> {
  const unsupported = await fetch(`${providerBaseUrl}/models`);
  const invalidJson = await fetch(`${providerBaseUrl}/chat/completions`, {
    method: "POST",
    body: "{"
  });
  const invalidPayload = await fetch(`${providerBaseUrl}/chat/completions`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ model: chatModel, messages: "not-an-array" })
  });
  const result = {
    unsupportedStatus: unsupported.status,
    invalidJsonStatus: invalidJson.status,
    invalidPayloadStatus: invalidPayload.status
  };
  if (
    result.unsupportedStatus !== 404 ||
    result.invalidJsonStatus !== 400 ||
    result.invalidPayloadStatus !== 400 ||
    requests.length !== 0
  ) {
    throw new Error(`Packaged stub accepted an invalid request: ${JSON.stringify(result)}`);
  }
  return result;
}

async function resolveUniquePortableArtifact(): Promise<string> {
  const entries = await readdir(packageArtifactsDir, { withFileTypes: true });
  const executables = entries.filter((entry) => entry.isFile() && entry.name.toLowerCase().endsWith(".exe"));
  if (executables.length !== 1 || executables[0]?.name !== expectedArtifactName) {
    throw new Error(
      `Expected exactly one ${expectedArtifactName}; found ${executables.map((entry) => entry.name).join(", ") || "none"}`
    );
  }
  return join(packageArtifactsDir, expectedArtifactName);
}

async function launchPortable(): Promise<PortableLaunch> {
  const cdpPort = await reservePort();
  const output: string[] = [];
  const child = spawn(externalExecutablePath, [`--remote-debugging-port=${cdpPort}`, "--remote-allow-origins=*"], {
    cwd: externalExeDir,
    env: createPackagedEnvironment(),
    stdio: "pipe",
    windowsHide: true
  });
  child.stdout.on("data", (chunk) => output.push(String(chunk)));
  child.stderr.on("data", (chunk) => output.push(String(chunk)));
  try {
    const endpoint = await waitForCdpEndpoint(cdpPort, child, output);
    const browser = await chromium.connectOverCDP(endpoint, { timeout: 15_000 });
    const launch: PortableLaunch = { browser, process: child, cdpPort, output, processTree: [] };
    await readRolePages(browser);
    return launch;
  } catch (error) {
    await killProcessTree(child.pid);
    throw new Error(
      `Portable wrapper did not expose its packaged renderer to Playwright: output=${output.join("").slice(-4_000)}; cause=${String(error)}`
    );
  }
}

function createPackagedEnvironment(): NodeJS.ProcessEnv {
  const systemRoot = process.env.SystemRoot ?? process.env.WINDIR ?? "C:\\Windows";
  const requiredNames = [
    "APPDATA",
    "COMSPEC",
    "HOMEDRIVE",
    "HOMEPATH",
    "LOCALAPPDATA",
    "PATHEXT",
    "PROCESSOR_ARCHITECTURE",
    "TEMP",
    "TMP",
    "USERPROFILE",
    "WINDIR"
  ];
  const env: NodeJS.ProcessEnv = {};
  for (const name of requiredNames) {
    if (process.env[name]) {
      env[name] = process.env[name];
    }
  }
  env.SystemRoot = systemRoot;
  env.Path = `${join(systemRoot, "System32")};${systemRoot}`;
  env.GREYFIELD_USER_DATA_PATH = userDataPath;
  return env;
}

async function waitForCdpEndpoint(
  port: number,
  child: ChildProcessWithoutNullStreams,
  output: string[]
): Promise<string> {
  const endpoint = `http://127.0.0.1:${port}`;
  const started = Date.now();
  while (Date.now() - started < 30_000) {
    try {
      const response = await fetch(`${endpoint}/json/version`);
      if (response.ok) {
        return endpoint;
      }
    } catch {
      // The portable wrapper extracts Electron before the CDP socket opens.
    }
    if (child.exitCode !== null) {
      throw new Error(`portable wrapper exited ${child.exitCode}: ${output.join("").slice(-2_000)}`);
    }
    await delay(250);
  }
  throw new Error("timed out waiting for the portable CDP endpoint");
}

async function closePortable(launch: PortableLaunch): Promise<void> {
  const knownProcessIds = launch.processTree.map((process) => process.processId);
  await launch.browser.close().catch(() => undefined);
  const started = Date.now();
  while (Date.now() - started < 8_000) {
    if (!(await canReachCdp(launch.cdpPort))) {
      break;
    }
    await delay(100);
  }
  if (await canReachCdp(launch.cdpPort)) {
    for (const processId of knownProcessIds.reverse()) {
      await killProcessTree(processId);
    }
  }
  if (launch.process.exitCode === null) {
    await killProcessTree(launch.process.pid);
  }
}

async function readRolePages(browser: Browser): Promise<Record<"pet" | "controls" | "settings" | "chat", Page>> {
  const roles = ["pet", "controls", "settings", "chat"] as const;
  const selectors = {
    pet: ".pet-shell",
    controls: ".desktop-control-panel",
    settings: ".greyfield-shell",
    chat: ".chat-shell"
  };
  const result = {} as Record<(typeof roles)[number], Page>;
  const started = Date.now();
  while (Date.now() - started < 30_000) {
    const pages = browser.contexts().flatMap((context) => context.pages());
    for (const page of pages) {
      const role = new URL(page.url()).searchParams.get("window") as (typeof roles)[number] | null;
      if (role && roles.includes(role) && !result[role]) {
        await page.waitForSelector(selectors[role], { timeout: 10_000 });
        result[role] = page;
      }
    }
    if (roles.every((role) => result[role])) {
      return result;
    }
    await delay(100);
  }
  throw new Error(`Timed out waiting for packaged role pages: ${Object.keys(result).join(", ")}`);
}

function rolePagesToUrls(pages: Record<"pet" | "controls" | "settings" | "chat", Page>): Record<string, string> {
  return Object.fromEntries(Object.entries(pages).map(([role, page]) => [role, page.url()]));
}

function assertFileRenderers(urls: Record<string, string>): void {
  for (const [role, url] of Object.entries(urls)) {
    const parsed = new URL(url);
    if (parsed.protocol !== "file:" || !parsed.pathname.includes("/resources/app.asar/dist-renderer/index.html")) {
      throw new Error(`Packaged ${role} renderer was not loaded from app.asar: ${url}`);
    }
  }
}

async function waitForLive2D(page: Page): Promise<number> {
  await page.waitForSelector('[data-stage-mode="live2d"] canvas.live2d-stage-canvas', { timeout: 30_000 });
  await page.waitForFunction(
    () => {
      const canvas = document.querySelector<HTMLCanvasElement>("canvas.live2d-stage-canvas");
      if (!canvas) return false;
      const gl = canvas.getContext("webgl2") ?? canvas.getContext("webgl");
      if (!gl || canvas.width === 0 || canvas.height === 0) return false;
      const image = new Uint8Array(canvas.width * canvas.height * 4);
      gl.readPixels(0, 0, canvas.width, canvas.height, gl.RGBA, gl.UNSIGNED_BYTE, image);
      let count = 0;
      for (let index = 3; index < image.length; index += 4) {
        if (image[index]! > 0) count += 1;
      }
      return count >= 2_000;
    },
    null,
    { timeout: 30_000 }
  );
  return page.evaluate(() => {
    const canvas = document.querySelector<HTMLCanvasElement>("canvas.live2d-stage-canvas");
    if (!canvas) throw new Error("Missing packaged Live2D canvas");
    const gl = canvas.getContext("webgl2") ?? canvas.getContext("webgl");
    if (!gl) throw new Error("Missing packaged Live2D WebGL context");
    const image = new Uint8Array(canvas.width * canvas.height * 4);
    gl.readPixels(0, 0, canvas.width, canvas.height, gl.RGBA, gl.UNSIGNED_BYTE, image);
    let count = 0;
    for (let index = 3; index < image.length; index += 4) {
      if (image[index]! > 0) count += 1;
    }
    return count;
  });
}

async function readVisibleWindowEvidence(page: Page, role: string): Promise<{
  bounds: { x: number; y: number; width: number; height: number };
  display: { x: number; y: number; width: number; height: number };
  intersectsVisibleDisplay: boolean;
}> {
  const evidence = await page.evaluate(() => {
    const display = window.screen as Screen & { availLeft?: number; availTop?: number };
    return {
      bounds: { x: window.screenX, y: window.screenY, width: window.outerWidth, height: window.outerHeight },
      display: {
        x: display.availLeft ?? 0,
        y: display.availTop ?? 0,
        width: display.availWidth,
        height: display.availHeight
      }
    };
  });
  const right = Math.min(evidence.bounds.x + evidence.bounds.width, evidence.display.x + evidence.display.width);
  const bottom = Math.min(evidence.bounds.y + evidence.bounds.height, evidence.display.y + evidence.display.height);
  const intersectsVisibleDisplay = right > Math.max(evidence.bounds.x, evidence.display.x) && bottom > Math.max(evidence.bounds.y, evidence.display.y);
  if (!intersectsVisibleDisplay || evidence.bounds.width <= 0 || evidence.bounds.height <= 0) {
    throw new Error(`Packaged ${role} window is not on a visible display: ${JSON.stringify(evidence)}`);
  }
  return { ...evidence, intersectsVisibleDisplay };
}

async function readControlsTrialEvidence(page: Page): Promise<{
  trialStatusVisible: boolean;
  configureActionVisible: boolean;
  fakeAsrDisclosureVisible: boolean;
}> {
  const status = page.getByTestId("provider-experience");
  const action = page.getByTestId("provider-experience-action");
  const fakeAsr = page.getByTestId("controls-fake-asr-disclosure");
  await Promise.all([status.waitFor(), action.waitFor(), fakeAsr.waitFor()]);
  const statusText = (await status.textContent())?.trim() ?? "";
  const actionText = (await action.textContent())?.trim() ?? "";
  const asrText = `${(await fakeAsr.textContent())?.trim() ?? ""} ${await fakeAsr.getAttribute("aria-label")}`;
  return {
    trialStatusVisible: /试玩模式|Preview mode/iu.test(statusText) && (await insideViewport(status)),
    configureActionVisible: /配置真实聊天|Configure real chat/iu.test(actionText) && (await insideViewport(action)),
    fakeAsrDisclosureVisible: /固定转写试玩|Fixed transcript preview/iu.test(asrText) && (await insideViewport(fakeAsr))
  };
}

async function configureRealProvider(page: Page): Promise<void> {
  await page.locator('[data-settings-section="provider"] select').first().selectOption("openai-compatible");
  await page.getByLabel("Base URL").fill(providerBaseUrl);
  await page.getByLabel("API Key").fill(apiKey);
  await page.getByLabel(/^(Chat reply|聊天回复)$/u, { exact: true }).fill(chatModel);
  await page.locator(".provider-status--ready", { hasText: /Ready to test|可以测试/iu }).waitFor({ timeout: 10_000 });
}

async function selectDeterministicFakeTts(page: Page): Promise<void> {
  await page.locator('[data-harness="settings-advanced-toggle"]').click();
  await page.getByRole("button", { name: /^(Voice|语音)$/u, exact: true }).click();
  const tts = page.locator('[data-settings-section="voice"] select').nth(1);
  await tts.selectOption("fake");
  if ((await tts.inputValue()) !== "fake") {
    throw new Error("Packaged Settings did not select deterministic fake TTS");
  }
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
        controlRect !== undefined && providerRect !== undefined && providerRect.top >= controlRect.top && providerRect.bottom <= controlRect.bottom,
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

async function readRestartProviderUi(page: Page): Promise<{
  providerSelected: boolean;
  baseUrlPreserved: boolean;
  apiKeyPresencePreserved: boolean;
  modelPreserved: boolean;
}> {
  const section = page.locator('[data-settings-section="provider"]');
  const providerSelected = (await section.locator("select").first().inputValue()) === "openai-compatible";
  const baseUrlPreserved = (await page.getByLabel("Base URL").inputValue()) === providerBaseUrl;
  const apiKeyInput = page.getByLabel("API Key");
  const apiKeyPresencePreserved = ((await apiKeyInput.getAttribute("placeholder")) ?? "").trim().length > 0;
  const modelPreserved = (await page.getByLabel(/^(Chat reply|聊天回复)$/u, { exact: true }).inputValue()) === chatModel;
  return { providerSelected, baseUrlPreserved, apiKeyPresencePreserved, modelPreserved };
}

async function sendChatMessage(page: Page, text: string): Promise<void> {
  await page.getByTestId("chat-message-input").fill(text);
  await page.getByTestId("chat-send-button").click();
}

async function installSpeechProbe(page: Page): Promise<void> {
  await page.evaluate(() => {
    const synthesis = window.speechSynthesis;
    if (!synthesis) throw new Error("speechSynthesis is unavailable in packaged Pet");
    const events: string[] = [];
    (window as typeof window & { __greyfieldSpeechEvents?: string[] }).__greyfieldSpeechEvents = events;
    synthesis.speak = (utterance: SpeechSynthesisUtterance) => {
      events.push(`speak:${utterance.text}`);
    };
    synthesis.cancel = () => {
      events.push("cancel");
    };
  });
}

async function waitForSpeechEvent(page: Page, event: "speak" | "cancel"): Promise<void> {
  await page.waitForFunction(
    (target) => {
      const events = (window as typeof window & { __greyfieldSpeechEvents?: string[] }).__greyfieldSpeechEvents ?? [];
      return target === "speak" ? events.some((item) => item.startsWith("speak:")) : events.includes("cancel");
    },
    event,
    { timeout: 15_000 }
  );
}

async function readSpeechEvents(page: Page): Promise<string[]> {
  return page.evaluate(
    () => [...((window as typeof window & { __greyfieldSpeechEvents?: string[] }).__greyfieldSpeechEvents ?? [])]
  );
}

async function waitForAudioQueue(page: Page, predicate: (count: number) => boolean, label: string): Promise<void> {
  const started = Date.now();
  while (Date.now() - started < 15_000) {
    const count = await page.locator(".audio-strip span").count();
    if (predicate(count)) return;
    await delay(100);
  }
  throw new Error(`Timed out waiting for packaged audio queue: ${label}`);
}

async function waitForAbortClose(): Promise<void> {
  const started = Date.now();
  while (Date.now() - started < 15_000) {
    if (abortRequestClosed) return;
    await delay(100);
  }
  throw new Error("Packaged Stop did not abort the provider request");
}

async function waitForPageFocus(page: Page, label: string): Promise<void> {
  await page.waitForFunction(() => document.hasFocus(), null, { timeout: 10_000 }).catch(async (error) => {
    throw new Error(`${label} did not become the ordinary focused window: ${String(error)}`);
  });
}

async function insideViewport(locator: ReturnType<Page["getByTestId"]>): Promise<boolean> {
  return locator.evaluate((element) => {
    const rect = element.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0 && rect.left >= 0 && rect.top >= 0 && rect.right <= innerWidth && rect.bottom <= innerHeight;
  });
}

async function waitForJsonFile(path: string): Promise<Record<string, unknown>> {
  const started = Date.now();
  while (Date.now() - started < 10_000) {
    try {
      return JSON.parse(await readFile(path, "utf8")) as Record<string, unknown>;
    } catch {
      await delay(100);
    }
  }
  throw new Error(`Timed out waiting for ${path}`);
}

async function waitForSessionLines(minimum: number): Promise<Array<{ role?: string; content?: string }>> {
  const started = Date.now();
  while (Date.now() - started < 10_000) {
    const raw = await readFile(sessionPath, "utf8").catch(() => "");
    const lines = raw
      .split(/\r?\n/u)
      .filter(Boolean)
      .map((line) => JSON.parse(line) as { role?: string; content?: string });
    if (lines.length >= minimum) return lines;
    await delay(100);
  }
  throw new Error("Timed out waiting for packaged session persistence");
}

function assertSavedProvider(config: Record<string, unknown>): void {
  const provider = config.provider as
    | { llm?: unknown; tts?: unknown; baseUrl?: unknown; apiKey?: unknown; model?: unknown; taskModels?: { chat?: unknown } }
    | undefined;
  if (
    provider?.llm !== "openai-compatible" ||
    provider.tts !== "fake" ||
    provider.baseUrl !== providerBaseUrl ||
    provider.apiKey !== apiKey ||
    (provider.taskModels?.chat ?? provider.model) !== chatModel
  ) {
    throw new Error("Packaged config did not persist the four provider fields");
  }
}

async function assertBootstrapFilesExist(): Promise<void> {
  const [character, memory] = await Promise.all([readFile(characterPath, "utf8"), readFile(memorySeedPath, "utf8")]);
  if (!character.includes("name: Greyfield") || !memory.includes("# Greyfield Memory")) {
    throw new Error("Packaged bootstrap persona/data were not copied into userData");
  }
}

async function readUserDataEvidence(): Promise<Record<string, { path: string; bytes: number }>> {
  const entries = { config: configPath, session: sessionPath, persona: characterPath, data: memorySeedPath };
  return Object.fromEntries(
    await Promise.all(
      Object.entries(entries).map(async ([name, path]) => {
        if (!resolve(path).startsWith(`${resolve(userDataPath)}\\`)) {
          throw new Error(`${name} escaped packaged userData: ${path}`);
        }
        return [name, { path, bytes: (await stat(path)).size }];
      })
    )
  );
}

async function assertExternalExecutableDirectoryClean(): Promise<boolean> {
  const files = await listFiles(externalExeDir);
  if (files.length !== 1 || files[0] !== expectedArtifactName) {
    throw new Error(`Portable executable directory contains user data: ${JSON.stringify(files)}`);
  }
  return true;
}

async function hashRepositoryEvidence(): Promise<Record<string, string>> {
  return Object.fromEntries(
    await Promise.all(
      repositoryEvidencePaths.map(async (relativePath) => {
        const path = join(workspaceRoot, relativePath);
        try {
          return [relativePath, await sha256File(path)];
        } catch (error) {
          if (isNodeError(error) && error.code === "ENOENT") return [relativePath, "missing"];
          throw error;
        }
      })
    )
  );
}

async function sha256File(path: string): Promise<string> {
  return createHash("sha256").update(await readFile(path)).digest("hex");
}

async function readDescendantProcessTree(rootProcessId: number): Promise<NativeProcess[]> {
  const command =
    "Get-CimInstance Win32_Process | Select-Object ProcessId,ParentProcessId,Name,CommandLine | ConvertTo-Json -Compress";
  const { stdout } = await execFileAsync("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", command], {
    windowsHide: true,
    maxBuffer: 10 * 1024 * 1024
  });
  const parsed = JSON.parse(stdout) as
    | Array<{ ProcessId: number; ParentProcessId: number; Name?: string; CommandLine?: string }>
    | { ProcessId: number; ParentProcessId: number; Name?: string; CommandLine?: string };
  const processes = Array.isArray(parsed) ? parsed : [parsed];
  const included = new Set([rootProcessId]);
  let changed = true;
  while (changed) {
    changed = false;
    for (const process of processes) {
      if (included.has(process.ParentProcessId) && !included.has(process.ProcessId)) {
        included.add(process.ProcessId);
        changed = true;
      }
    }
  }
  return processes
    .filter((process) => included.has(process.ProcessId))
    .map((process) => ({
      processId: process.ProcessId,
      parentProcessId: process.ParentProcessId,
      name: process.Name ?? "",
      commandLine: process.CommandLine ?? ""
    }));
}

function assertNoDevelopmentProcesses(processes: NativeProcess[]): void {
  const offenders = processes.filter((process) =>
    /(?:^|\\)(?:node|pnpm|vite)(?:\.exe)?\b|node_modules|vite(?:\.js)?/iu.test(`${process.name} ${process.commandLine}`)
  );
  if (offenders.length > 0) {
    throw new Error(`Packaged process tree contains a development process: ${JSON.stringify(offenders)}`);
  }
}

async function reservePort(): Promise<number> {
  const server = createServer();
  await new Promise<void>((resolveListen) => server.listen(0, "127.0.0.1", resolveListen));
  const port = (server.address() as AddressInfo).port;
  await new Promise<void>((resolveClose) => server.close(() => resolveClose()));
  return port;
}

async function canReachCdp(port: number): Promise<boolean> {
  try {
    const response = await fetch(`http://127.0.0.1:${port}/json/version`);
    return response.ok;
  } catch {
    return false;
  }
}

async function killProcessTree(processId: number | undefined): Promise<void> {
  if (!processId) return;
  await execFileAsync("taskkill.exe", ["/pid", String(processId), "/t", "/f"], { windowsHide: true }).catch(() => undefined);
}

async function readRequestBody(request: IncomingMessage): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of request) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks).toString("utf8");
}

async function listFiles(root: string, current = root): Promise<string[]> {
  const entries = await readdir(current, { withFileTypes: true });
  const files: string[] = [];
  for (const entry of entries) {
    const path = join(current, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await listFiles(root, path)));
    } else {
      files.push(path.slice(root.length + 1).replaceAll("\\", "/"));
    }
  }
  return files.sort();
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error;
}

function delay(ms: number): Promise<void> {
  return new Promise((resolveDelay) => setTimeout(resolveDelay, ms));
}
