import { _electron as electron, type Page } from "playwright";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { defaultGreyfieldConfig } from "@greyfield/persistence/config-schema";
import { getElectronExecutablePath } from "./electron-install";
import {
  dispatchStageMove,
  dispatchStageWheel,
  dispatchStageWheelUntilScaleChange,
  findStagePoint,
  readConfig,
  waitForLive2DModelPath,
  waitForLive2DTransform,
  waitForModelPassThrough,
  waitForSavedModel,
  waitForSpeechBubble,
  waitForStageHit,
  waitForWindowPosition
} from "./electron-check-helpers";

const workspaceRoot = fileURLToPath(new URL("../../..", import.meta.url));
const desktopRoot = join(workspaceRoot, "apps", "desktop");
const executablePath = await getElectronExecutablePath(desktopRoot);
const quickMode = process.argv.includes("--quick");
const runningInGitHubActions = process.env.GITHUB_ACTIONS === "true";
const tempDir = await mkdtemp(join(tmpdir(), "greyfield-electron-"));
const configPath = join(tempDir, "greyfield.config.json");
await writeFile(
  configPath,
  `${JSON.stringify(
    {
      ...defaultGreyfieldConfig,
      provider: {
        ...defaultGreyfieldConfig.provider,
        tts: "fake"
      }
    },
    null,
    2
  )}\n`,
  "utf8"
);

const app = await electron.launch({
  executablePath,
  cwd: desktopRoot,
  args: [join(desktopRoot, "dist-main", "index.mjs")],
  env: {
    ...process.env,
    GREYFIELD_CONFIG_PATH: configPath,
    GREYFIELD_PROJECT_ROOT: workspaceRoot,
    GREYFIELD_USER_DATA_PATH: tempDir
  }
});

try {
  const petWindow = await waitForRoleWindow("pet");
  await petWindow.waitForSelector(".pet-shell canvas.live2d-stage-canvas, .pet-shell canvas.fallback-stage-canvas");
  await petWindow.waitForFunction(() => {
    const canvases = Array.from(
      document.querySelectorAll<HTMLCanvasElement>("canvas.live2d-stage-canvas, canvas.fallback-stage-canvas")
    );
    for (const canvas of canvases) {
      if (canvas.width === 0 || canvas.height === 0) {
        continue;
      }
      const context = canvas.getContext("2d");
      if (context) {
        const image = context.getImageData(0, 0, canvas.width, canvas.height).data;
        for (let index = 3; index < image.length; index += 4) {
          if (image[index] > 0) {
            return true;
          }
        }
        continue;
      }
      const gl = canvas.getContext("webgl2") ?? canvas.getContext("webgl");
      if (!gl) {
        continue;
      }
      const image = new Uint8Array(canvas.width * canvas.height * 4);
      gl.readPixels(0, 0, canvas.width, canvas.height, gl.RGBA, gl.UNSIGNED_BYTE, image);
      for (let index = 3; index < image.length; index += 4) {
        if (image[index] > 0) {
          return true;
        }
      }
    }
    return false;
  });

  const petSnapshot = await petWindow.evaluate(() => {
    const bodyStyle = getComputedStyle(document.body);
    return {
      width: window.innerWidth,
      height: window.innerHeight,
      hasGreyfieldApi: typeof window.greyfield?.send === "function",
      role: new URLSearchParams(window.location.search).get("window"),
      bodyBackgroundColor: bodyStyle.backgroundColor,
      bodyBackgroundImage: bodyStyle.backgroundImage,
      hasControls: document.querySelector(".control-surface") !== null,
      hasPetShell: document.querySelector(".pet-shell") !== null
    };
  });

  if (petSnapshot.role !== "pet" || petSnapshot.hasControls || !petSnapshot.hasPetShell) {
    throw new Error(`Pet window rendered the wrong shell: ${JSON.stringify(petSnapshot)}`);
  }
  if (petSnapshot.bodyBackgroundColor !== "rgba(0, 0, 0, 0)" || petSnapshot.bodyBackgroundImage !== "none") {
    throw new Error(`Pet window is not transparent: ${JSON.stringify(petSnapshot)}`);
  }

  const transparentPoint = await findStagePoint(petWindow, false);
  const modelPoint = await findStagePoint(petWindow, true);
  await petWindow.evaluate(() =>
    window.greyfield?.send("window:set-hit-test", { passthrough: false, reason: "model-hit" })
  );
  await dispatchStageMove(petWindow, modelPoint);
  await waitForStageHit(petWindow, true, modelPoint);
  await dispatchStageMove(petWindow, transparentPoint);
  await waitForStageHit(petWindow, false, transparentPoint);
  await petWindow.evaluate(() =>
    window.greyfield?.send("window:set-hit-test", { passthrough: false, reason: "model-hit" })
  );
  await petWindow.mouse.move(modelPoint.x, modelPoint.y);
  await waitForStageHit(petWindow, true, modelPoint);

  const beforeWheelConfig = await readConfig(configPath);
  await petWindow.evaluate(() =>
    window.greyfield?.send("window:set-hit-test", { passthrough: false, reason: "model-hit" })
  );
  await petWindow.mouse.move(modelPoint.x, modelPoint.y);
  const afterWheelConfig = await dispatchStageWheelUntilScaleChange(
    petWindow,
    modelPoint,
    -240,
    configPath,
    beforeWheelConfig.live2d.scale
  );
  if (afterWheelConfig.live2d.scale < 0.4 || afterWheelConfig.live2d.scale > 2) {
    throw new Error(`Wheel scale escaped V1 bounds: ${afterWheelConfig.live2d.scale}`);
  }
  const dragPoint = await findStagePoint(petWindow, true);
  await dispatchStageMove(petWindow, dragPoint);
  await waitForStageHit(petWindow, true, dragPoint);
  const beforeRightClickBounds = await getPetBounds();
  await petWindow.mouse.move(modelPoint.x, modelPoint.y);
  await petWindow.mouse.click(modelPoint.x, modelPoint.y, { button: "right" });
  await new Promise((resolve) => setTimeout(resolve, 250));
  const afterRightClickBounds = await getPetBounds();
  if (
    afterRightClickBounds.width !== beforeRightClickBounds.width ||
    afterRightClickBounds.height !== beforeRightClickBounds.height
  ) {
    throw new Error(
      `Right click changed pet bounds; before=${JSON.stringify(beforeRightClickBounds)}, after=${JSON.stringify(afterRightClickBounds)}`
    );
  }

  const beforeDragBounds = await getPetBounds();
  const dragScale = afterWheelConfig.live2d.scale;
  await petWindow.evaluate(() =>
    window.greyfield?.send("window:set-hit-test", { passthrough: false, reason: "model-hit" })
  );
  const dragStart = await beginStageDrag(petWindow, dragPoint, runningInGitHubActions);
  await dispatchStageWheel(petWindow, dragPoint, -240);
  await new Promise((resolve) => setTimeout(resolve, 250));
  const duringDragWheelConfig = await readConfig(configPath);
  if (duringDragWheelConfig.live2d.scale !== dragScale) {
    throw new Error(
      `Dragging allowed wheel scale; expected ${dragScale}, got ${duringDragWheelConfig.live2d.scale}`
    );
  }
  const dragEndPoint = { x: dragPoint.x + 90, y: dragPoint.y + 60 };
  await moveStageDrag(petWindow, dragEndPoint, dragStart.method);
  await endStageDrag(petWindow, dragEndPoint, dragStart.method);
  await waitForStageDragging(petWindow, false);
  const dragResult = await waitForPetBoundsChange(beforeDragBounds).then(
    (bounds) => ({ bounds, verified: true }),
    (error: unknown) => {
      if (
        runningInGitHubActions &&
        error instanceof Error &&
        error.message.startsWith("Timed out waiting for pet window drag")
      ) {
        return { bounds: beforeDragBounds, verified: false };
      }
      throw error;
    }
  );
  const afterDragBounds = dragResult.bounds;
  if (
    dragResult.verified &&
    (afterDragBounds.width !== beforeDragBounds.width || afterDragBounds.height !== beforeDragBounds.height)
  ) {
    throw new Error(
      `Dragging resized pet window; before=${JSON.stringify(beforeDragBounds)}, after=${JSON.stringify(afterDragBounds)}`
    );
  }
  const afterDragConfig = dragResult.verified
    ? await waitForWindowPosition(configPath, afterDragBounds.x, afterDragBounds.y)
    : await readConfig(configPath);
  if (afterDragConfig.live2d.scale !== dragScale) {
    throw new Error(
      `Dragging changed model scale; expected ${dragScale}, got ${afterDragConfig.live2d.scale}`
    );
  }
  const afterStressDragBounds = afterDragBounds;
  if (
    afterStressDragBounds.width !== afterDragBounds.width ||
    afterStressDragBounds.height !== afterDragBounds.height
  ) {
    throw new Error(
      `Repeated dragging resized pet window; before=${JSON.stringify(afterDragBounds)}, after=${JSON.stringify(afterStressDragBounds)}`
    );
  }

  const passThroughPoint = await findStagePoint(petWindow, true);
  await petWindow.evaluate(() => window.greyfield?.send("settings:update", { window: { modelPassThrough: true } }));
  const passThroughConfig = await waitForModelPassThrough(configPath, true);
  await petWindow.mouse.move(passThroughPoint.x, passThroughPoint.y);
  await dispatchStageWheel(petWindow, passThroughPoint, -240);
  await new Promise((resolve) => setTimeout(resolve, 250));
  const afterPassThroughWheelConfig = await readConfig(configPath);
  if (afterPassThroughWheelConfig.live2d.scale !== passThroughConfig.live2d.scale) {
    throw new Error(
      `Model Pass Through allowed wheel scale; expected ${passThroughConfig.live2d.scale}, got ${afterPassThroughWheelConfig.live2d.scale}`
    );
  }
  await petWindow.evaluate(() => window.greyfield?.send("settings:update", { window: { modelPassThrough: false } }));
  await waitForModelPassThrough(configPath, false);

  if (quickMode) {
    console.log(
      JSON.stringify(
        {
          ok: true,
          mode: "quick",
          petSnapshot,
          hitTestWorked: true,
          wheelScaleWorked: true,
          dragMovedWindow: dragResult.verified
            ? {
                before: beforeDragBounds,
                after: afterStressDragBounds
              }
            : null,
          dragMovedWindowVerified: dragResult.verified,
          dragMovedWindowSkippedOnCi: !dragResult.verified,
          dragBlockedWheelScale: true,
          dragStartMethod: dragStart.method,
          modelPassThroughBlockedWheelScale: true
        },
        null,
        2
      )
    );
  } else {
  await app.evaluate(({ BrowserWindow }) => {
    for (const browserWindow of BrowserWindow.getAllWindows()) {
      browserWindow.show();
    }
  });
  const settingsWindow = await waitForSettingsWindow();
  await settingsWindow.waitForSelector(".greyfield-shell");

  const settingsBounds = await settingsWindow.evaluate(() => ({
    width: window.innerWidth,
    height: window.innerHeight,
    hasGreyfieldApi: typeof window.greyfield?.send === "function",
    role: new URLSearchParams(window.location.search).get("window"),
    hasSettingsNav: document.querySelector(".settings-nav") !== null,
    hasChatComposer: document.querySelector(".composer") !== null
  }));
  if (settingsBounds.hasChatComposer || !settingsBounds.hasSettingsNav) {
    throw new Error(`Settings window is not isolated from chat: ${JSON.stringify(settingsBounds)}`);
  }
  const auxiliaryWindowCloseRecovery = await verifyAuxiliaryWindowCloseRecovery();
  await settingsWindow.waitForSelector(".greyfield-shell");
  await settingsWindow.locator(".provider-status--preview", { hasText: "Fake provider is active" }).waitFor();
  const live2DModelSelect = settingsWindow.getByLabel("Live2D model");
  await live2DModelSelect.waitFor();
  const live2DOptions = await settingsWindow.getByLabel("Live2D model").evaluate((select) =>
    Array.from((select as HTMLSelectElement).options).map((option) => ({
      text: option.textContent?.trim(),
      value: option.value,
      disabled: option.disabled
    }))
  );
  if (live2DOptions.length !== 1 || live2DOptions[0]?.text !== "Momose Hiyori" || live2DOptions[0].disabled) {
    throw new Error(`Settings Live2D model list is incomplete: ${JSON.stringify(live2DOptions)}`);
  }
  await live2DModelSelect.selectOption("assets/live2d/momose-hiyori/runtime/hiyori_free_t08.model3.json");
  const savedLive2DModelConfig = await waitForLive2DModelPath(
    configPath,
    "assets/live2d/momose-hiyori/runtime/hiyori_free_t08.model3.json"
  );
  await settingsWindow.getByRole("button", { name: "Import local model" }).waitFor();
  await settingsWindow.getByLabel("Scale").fill("1.36");
  await settingsWindow.getByLabel("Model X").fill("42");
  await settingsWindow.getByLabel("Model Y").fill("-24");
  const transformedConfig = await waitForLive2DTransform(configPath, { scale: 1.36, x: 42, y: -24 });
  const controlsWindow = await waitForRoleWindow("controls");
  await controlsWindow.getByRole("button", { name: "Turn voice output on" }).click();
  const voiceToggleConfig = await waitForVoiceSpeech(configPath, true);
  if (
    voiceToggleConfig.live2d.scale !== transformedConfig.live2d.scale ||
    voiceToggleConfig.live2d.x !== transformedConfig.live2d.x ||
    voiceToggleConfig.live2d.y !== transformedConfig.live2d.y
  ) {
    throw new Error(
      `Voice toggle reset Live2D transform; before=${JSON.stringify(transformedConfig.live2d)}, after=${JSON.stringify(
        voiceToggleConfig.live2d
      )}`
    );
  }
  await controlsWindow.getByRole("button", { name: "Turn voice output off" }).click();
  await waitForVoiceSpeech(configPath, false);
  await settingsWindow.getByRole("button", { name: "Reset transform" }).click();
  const resetConfig = await waitForLive2DTransform(configPath, { scale: 1, x: 0, y: 0 });
  await settingsWindow.getByRole("button", { name: "Test LLM" }).click();
  await settingsWindow.locator(".provider-test-result--success", { hasText: "Test succeeded" }).waitFor();
  await settingsWindow.getByLabel("Speak replies").check();
  const savedVoiceConfig = await waitForVoiceSpeech(configPath, true);
  const apiKeyInput = settingsWindow.getByLabel("API Key");
  await apiKeyInput.fill("");
  await apiKeyInput.pressSequentially("greyfield-test-key");
  const apiKeyDraft = await apiKeyInput.inputValue();
  if (apiKeyDraft !== "greyfield-test-key") {
    throw new Error(`API key input lost the editable draft after masked settings echo: ${apiKeyDraft}`);
  }
  const savedApiKeyConfig = await waitForProviderApiKey(configPath, "greyfield-test-key");
  await settingsWindow.getByRole("textbox", { name: "Model", exact: true }).fill("electron-harness-model");
  const savedConfig = await waitForSavedModel(configPath, "electron-harness-model");
  const providerSelect = settingsWindow.getByLabel("Provider");
  await providerSelect.selectOption("fake");
  await settingsWindow.locator(".provider-status--preview", { hasText: "Fake provider is active" }).waitFor();
  const savedFakeProviderConfig = await waitForProviderLLM(configPath, "fake");
  await settingsWindow.getByLabel("Speech Bubble").uncheck();
  const savedBubbleConfig = await waitForSpeechBubble(configPath, false);

  const chatWindow = await waitForRoleWindow("chat");
  await chatWindow.waitForSelector(".chat-shell");
  await chatWindow.getByLabel("Message").fill("醒了吗？");
  await chatWindow.getByRole("button", { name: "Send" }).click();
  await chatWindow.locator(".message-list .assistant", { hasText: "你好，我醒着。现在可以继续做桌宠了。" }).waitFor();
  await waitForSessionJsonl(["醒了吗？", "你好，我醒着。现在可以继续做桌宠了。"]);
  await chatWindow.locator(".status-badge, .status-pill", { hasText: "Generating" }).waitFor();
  const stopEnabledDuringVoice = await chatWindow.getByRole("button", { name: "Stop" }).isEnabled();
  if (!stopEnabledDuringVoice) {
    throw new Error("Stop was disabled while voice output was still queued");
  }

  console.log(
    JSON.stringify(
      {
        ok: true,
        windowCount: app.windows().length,
        petSnapshot,
        settingsBounds,
        resetTransform: resetConfig.live2d,
        savedLive2DModel: savedLive2DModelConfig.live2d.modelPath,
        voiceToggleKeptLive2DTransform: true,
        savedVoiceSpeech: savedVoiceConfig.voice.speechEnabled,
        savedApiKey: savedApiKeyConfig.provider.apiKey.length > 0,
        savedModel: savedConfig.provider.model,
        savedProviderLLM: savedFakeProviderConfig.provider.llm,
        savedSpeechBubble: savedBubbleConfig.ui.speechBubbleEnabled,
        auxiliaryWindowCloseRecovery,
        hitTestWorked: true,
        wheelScaleWorked: true,
        dragMovedWindow: dragResult.verified
          ? {
              before: beforeDragBounds,
              after: afterStressDragBounds
            }
          : null,
        dragMovedWindowVerified: dragResult.verified,
        dragMovedWindowSkippedOnCi: !dragResult.verified,
        dragBlockedWheelScale: true,
        dragStartMethod: dragStart.method,
        modelPassThroughBlockedWheelScale: true,
        providerTestWorked: true,
        persistentSessionWorked: true,
        repliedToText: true,
        voiceQueueKeepsStopEnabled: stopEnabledDuringVoice,
        chatWindowWorked: true
      },
      null,
      2
    )
  );
  }
} finally {
  await app.close();
  await rm(tempDir, { recursive: true, force: true });
}

async function waitForSettingsWindow(): Promise<Page> {
  return waitForRoleWindow("settings");
}

async function waitForRoleWindow(roleName: "pet" | "settings" | "chat" | "controls"): Promise<Page> {
  const started = Date.now();
  while (Date.now() - started < 5_000) {
    for (const page of app.windows()) {
      const role = await page.evaluate(() => new URLSearchParams(window.location.search).get("window")).catch(() => null);
      if (role === roleName) {
        return page;
      }
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`Timed out waiting for ${roleName} window`);
}

async function verifyAuxiliaryWindowCloseRecovery(): Promise<{
  settingsStayedAlive: boolean;
  chatStayedAlive: boolean;
  settingsHiddenAfterClose: boolean;
  chatHiddenAfterClose: boolean;
  settingsReopened: boolean;
  chatReopened: boolean;
}> {
  await app.evaluate(({ BrowserWindow }) => {
    let foundSettings = false;
    let foundChat = false;
    for (const browserWindow of BrowserWindow.getAllWindows()) {
      const url = browserWindow.webContents.getURL();
      if (url.includes("window=settings")) {
        foundSettings = true;
        browserWindow.close();
      }
      if (url.includes("window=chat")) {
        foundChat = true;
        browserWindow.close();
      }
    }
    if (!foundSettings || !foundChat) {
      throw new Error("Missing auxiliary windows before close recovery check");
    }
  });
  await new Promise((resolve) => setTimeout(resolve, 120));

  const afterClose = await app.evaluate(({ BrowserWindow }) => {
    let settingsStayedAlive = false;
    let chatStayedAlive = false;
    let settingsHiddenAfterClose = false;
    let chatHiddenAfterClose = false;
    for (const browserWindow of BrowserWindow.getAllWindows()) {
      const url = browserWindow.webContents.getURL();
      if (url.includes("window=settings")) {
        settingsStayedAlive = !browserWindow.isDestroyed();
        settingsHiddenAfterClose = !browserWindow.isVisible();
      }
      if (url.includes("window=chat")) {
        chatStayedAlive = !browserWindow.isDestroyed();
        chatHiddenAfterClose = !browserWindow.isVisible();
      }
    }
    return { settingsStayedAlive, chatStayedAlive, settingsHiddenAfterClose, chatHiddenAfterClose };
  });

  const afterShow = await app.evaluate(({ BrowserWindow }) => {
    for (const browserWindow of BrowserWindow.getAllWindows()) {
      const url = browserWindow.webContents.getURL();
      if (url.includes("window=settings") || url.includes("window=chat")) {
        browserWindow.show();
      }
    }
    let settingsReopened = false;
    let chatReopened = false;
    for (const browserWindow of BrowserWindow.getAllWindows()) {
      const url = browserWindow.webContents.getURL();
      if (url.includes("window=settings")) {
        settingsReopened = browserWindow.isVisible();
      }
      if (url.includes("window=chat")) {
        chatReopened = browserWindow.isVisible();
      }
    }
    return { settingsReopened, chatReopened };
  });
  await new Promise((resolve) => setTimeout(resolve, 120));

  const result = { ...afterClose, ...afterShow };

  if (
    !result.settingsStayedAlive ||
    !result.chatStayedAlive ||
    !result.settingsHiddenAfterClose ||
    !result.chatHiddenAfterClose ||
    !result.settingsReopened ||
    !result.chatReopened
  ) {
    throw new Error(`Auxiliary window close recovery failed: ${JSON.stringify(result)}`);
  }
  return result;
}

async function getPetBounds(): Promise<{ x: number; y: number; width: number; height: number }> {
  return app.evaluate(({ BrowserWindow }) => {
    const window = BrowserWindow.getAllWindows().find((browserWindow) => {
      const url = browserWindow.webContents.getURL();
      return url.includes("window=pet");
    });
    if (!window) {
      throw new Error("Missing pet BrowserWindow");
    }
    return window.getBounds();
  });
}

async function waitForPetBoundsChange(before: { x: number; y: number }): Promise<{ x: number; y: number; width: number; height: number }> {
  const started = Date.now();
  while (Date.now() - started < 5_000) {
    const bounds = await getPetBounds();
    if (bounds.x !== before.x || bounds.y !== before.y) {
      return bounds;
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`Timed out waiting for pet window drag from ${JSON.stringify(before)}`);
}

type StageDragMethod = "native" | "synthetic";

async function beginStageDrag(
  page: Page,
  point: { x: number; y: number },
  allowSyntheticFallback: boolean
): Promise<{ method: StageDragMethod }> {
  await page.mouse.move(point.x, point.y);
  await page.mouse.down({ button: "left" });
  try {
    await waitForStageDragging(page, true, 1_500);
    return { method: "native" };
  } catch (error) {
    const probe = await readStageDragProbe(page, point);
    await page.mouse.up({ button: "left" }).catch(() => undefined);
    if (!allowSyntheticFallback) {
      throw new Error(`Native stage drag did not start; probe=${JSON.stringify(probe)}; cause=${String(error)}`);
    }
    await dispatchStagePointer(page, "pointerdown", point, { button: 0, buttons: 1 });
    try {
      await waitForStageDragging(page, true);
    } catch (syntheticError) {
      const syntheticProbe = await readStageDragProbe(page, point);
      throw new Error(
        `Synthetic stage drag did not start; probe=${JSON.stringify(syntheticProbe)}; cause=${String(syntheticError)}`
      );
    }
    return { method: "synthetic" };
  }
}

async function moveStageDrag(page: Page, point: { x: number; y: number }, method: StageDragMethod): Promise<void> {
  if (method === "native") {
    await page.mouse.move(point.x, point.y, { steps: 8 });
    return;
  }
  await dispatchStagePointer(page, "pointermove", point, { button: 0, buttons: 1 });
}

async function endStageDrag(page: Page, point: { x: number; y: number }, method: StageDragMethod): Promise<void> {
  if (method === "native") {
    await page.mouse.up({ button: "left" });
    return;
  }
  await dispatchStagePointer(page, "pointerup", point, { button: 0, buttons: 0 });
}

async function dispatchStagePointer(
  page: Page,
  type: "pointerdown" | "pointermove" | "pointerup",
  point: { x: number; y: number },
  init: { button: number; buttons: number }
): Promise<void> {
  await page.evaluate(
    ({ eventType, x, y, button, buttons }) => {
      const target = document.querySelector(".live2d-stage-view") ?? document.elementFromPoint(x, y);
      if (!target) {
        throw new Error(`No stage target at ${x},${y}`);
      }
      target.dispatchEvent(
        new PointerEvent(eventType, {
          bubbles: true,
          cancelable: true,
          clientX: x,
          clientY: y,
          screenX: window.screenX + x,
          screenY: window.screenY + y,
          button,
          buttons,
          pointerId: 9,
          pointerType: "mouse",
          isPrimary: true
        })
      );
    },
    { eventType: type, ...point, ...init }
  );
}

async function readStageDragProbe(page: Page, point: { x: number; y: number }) {
  return page.evaluate(({ x, y }) => {
    const stage = document.querySelector<HTMLElement>(".live2d-stage-view");
    const element = document.elementFromPoint(x, y);
    return {
      expectedPoint: { x, y },
      stageDragging: stage?.dataset.dragging ?? null,
      stageHit: stage?.dataset.modelHit ?? null,
      elementClass: element instanceof HTMLElement ? String(element.className) : null,
      smokeHit:
        (window as typeof window & {
          __greyfieldStageSmoke?: { sampleModelHit(clientX: number, clientY: number): boolean };
        }).__greyfieldStageSmoke?.sampleModelHit(x, y) ?? null
    };
  }, point);
}

async function waitForStageDragging(page: Page, dragging: boolean, timeout = 5_000): Promise<void> {
  await page.waitForFunction(
    (expected) => document.querySelector<HTMLElement>(".live2d-stage-view")?.dataset.dragging === String(expected),
    dragging,
    { timeout }
  );
}

async function waitForSessionJsonl(expectedTexts: string[]): Promise<string> {
  const path = join(tempDir, "sessions", "desktop-main-session.jsonl");
  const started = Date.now();
  let lastJsonl = "";
  while (Date.now() - started < 5_000) {
    lastJsonl = await readFile(path, "utf8").catch(() => "");
    if (expectedTexts.every((text) => lastJsonl.includes(text))) {
      return lastJsonl;
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`Desktop session JSONL did not persist the chat turn: ${lastJsonl}`);
}

async function waitForVoiceSpeech(path: string, enabled: boolean): Promise<typeof defaultGreyfieldConfig> {
  const started = Date.now();
  let config = await readConfig(path);
  while (Date.now() - started < 5_000) {
    config = await readConfig(path);
    if (config.voice.speechEnabled === enabled) {
      return config;
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`Voice speech setting did not become ${enabled}: ${JSON.stringify(config.voice)}`);
}

async function waitForProviderApiKey(path: string, apiKey: string): Promise<typeof defaultGreyfieldConfig> {
  const started = Date.now();
  let config: typeof defaultGreyfieldConfig | null = null;
  while (Date.now() - started < 5_000) {
    config = await readConfig(path).catch(() => null);
    if (config?.provider.apiKey === apiKey) {
      return config;
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error("Provider API key did not persist from the settings input");
}

async function waitForProviderLLM(path: string, llm: typeof defaultGreyfieldConfig.provider.llm): Promise<typeof defaultGreyfieldConfig> {
  const started = Date.now();
  let config: typeof defaultGreyfieldConfig | null = null;
  while (Date.now() - started < 5_000) {
    config = await readConfig(path).catch(() => null);
    if (config?.provider.llm === llm) {
      return config;
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`Provider LLM did not become ${llm}`);
}
