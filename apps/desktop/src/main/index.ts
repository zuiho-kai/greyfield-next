import { app, BrowserWindow, dialog, ipcMain, Menu, nativeImage, Tray } from "electron";
import { readdir, readFile, stat } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import type { GreyfieldConfig, GreyfieldConfigPatch } from "@greyfield/persistence/config-schema";
import { loadGreyfieldConfig, saveGreyfieldConfig } from "@greyfield/persistence";
import { createDesktopRuntimeStoreOptions } from "./desktop-runtime-stores";
import { createChatWindowOptions, createControlsWindowOptions, createPetWindowOptions, createSettingsWindowOptions, resolvePreloadPath, resolveRendererHtmlPath } from "./electron-window-options";
import { Live2DModelController, type Live2DModelInfo } from "./live2d-model-controller";
import { resolveLive2DModelSelection } from "./live2d-model-selection";
import { toWindowMenuPoint } from "./pet-menu";
import { PetWindowController } from "./pet-window-controller";
import { RuntimeIpcController } from "./runtime-ipc-controller";
import { RuntimeService } from "./runtime-service";
import { redactConfigForRenderer } from "./settings-redaction";
import { SettingsController } from "./settings-controller";
import { getUsableWindow, hideWindowIfUsable, showWindowIfUsable } from "./window-lifecycle";

const currentDir = dirname(fileURLToPath(import.meta.url));
let petWindow: BrowserWindow | undefined;
let settingsWindow: BrowserWindow | undefined;
let chatWindow: BrowserWindow | undefined;
let controlsWindow: BrowserWindow | undefined;
let tray: Tray | undefined;
let settingsController: SettingsController | undefined;
let runtimeService: RuntimeService | undefined;
let runtimeIpcController: RuntimeIpcController | undefined;
let petWindowController: PetWindowController | undefined;
let live2DModelController: Live2DModelController | undefined;
let isQuitting = false;
let controlsWindowDrag:
  | {
      startScreenX: number;
      startScreenY: number;
      startWindowX: number;
      startWindowY: number;
      width: number;
      height: number;
    }
  | undefined;

async function createWindows(): Promise<void> {
  const config = await loadGreyfieldConfig(resolveConfigPath());
  runtimeService = new RuntimeService(config, {
    ...createDesktopRuntimeStoreOptions(resolveRuntimeStorePaths()),
    llmTimeoutMs: resolvePositiveIntegerEnv("GREYFIELD_LLM_TIMEOUT_MS"),
    recentTurnLimit: resolvePositiveIntegerEnv("GREYFIELD_RECENT_TURN_LIMIT"),
    recallMaxItems: resolvePositiveIntegerEnv("GREYFIELD_RECALL_MAX_ITEMS"),
    recallMaxCharacters: resolvePositiveIntegerEnv("GREYFIELD_RECALL_MAX_CHARACTERS"),
    summaryBatchTurnLimit: resolvePositiveIntegerEnv("GREYFIELD_SUMMARY_BATCH_TURN_LIMIT"),
    summaryMinTurns: resolvePositiveIntegerEnv("GREYFIELD_SUMMARY_MIN_TURNS")
  });
  runtimeIpcController = new RuntimeIpcController({
    service: runtimeService,
    broadcast: broadcastRuntimeEvent
  });
  settingsController = new SettingsController(
    config,
    (nextConfig) => saveGreyfieldConfig(resolveConfigPath(), nextConfig),
    (nextConfig) => {
      runtimeService?.updateConfig(nextConfig);
      broadcastSettings(nextConfig);
    }
  );
  live2DModelController = new Live2DModelController({
    showOpenDialog: showLive2DModelDialog,
    resolveSelection: (selectedPath) => resolveLive2DModelSelection(selectedPath, { stat, readdir, readFile }),
    updateSettings: async (patch) => {
      await settingsController?.update(patch);
    },
    broadcastModelInfo,
    broadcastLog
  });
  const preload = resolvePreloadPath(currentDir);
  petWindow = new BrowserWindow(createPetWindowOptions(config, preload));
  petWindowController = new PetWindowController({
    getWindow: () => getUsableWindow(petWindow),
    nativeShapeEnabled: canUseWindowShape()
  });
  petWindowController.setModelPassThrough(config.window.modelPassThrough);
  settingsWindow = new BrowserWindow(createSettingsWindowOptions(preload));
  chatWindow = new BrowserWindow(createChatWindowOptions(preload));
  controlsWindow = new BrowserWindow(createControlsWindowOptions(config, preload));
  attachWindowLifecycle();

  registerIpc();
  await loadRenderer(petWindow, "pet");
  await loadRenderer(settingsWindow, "settings");
  await loadRenderer(chatWindow, "chat");
  await loadRenderer(controlsWindow, "controls");
  broadcastSettings(config);
  broadcastWindowState();
  applyHitTest({ passthrough: true, reason: "transparent-area" });
  createTray();
}

async function loadRenderer(window: BrowserWindow, role: "pet" | "settings" | "chat" | "controls"): Promise<void> {
  const devUrl = process.env.GREYFIELD_DESKTOP_URL;
  if (devUrl) {
    const url = new URL(devUrl);
    url.searchParams.set("window", role);
    await window.loadURL(url.toString());
    return;
  }

  await window.loadFile(resolveRendererHtmlPath(currentDir), { query: { window: role } });
}

function createTray(): void {
  try {
    tray = new Tray(createTrayIcon());
  } catch (error) {
    console.warn("Greyfield tray disabled:", error);
    return;
  }
  tray.setToolTip("Greyfield Next");
  tray.setContextMenu(
    Menu.buildFromTemplate([
      { label: "Show Settings", click: () => showWindowIfUsable(settingsWindow) },
      { label: "Open Chat", click: () => showWindowIfUsable(chatWindow) },
      { label: "Show Controls", click: () => showWindowIfUsable(controlsWindow) },
      { label: "Model Pass Through", type: "checkbox", checked: petWindowController?.isModelPassThrough(), click: () => setModelPassThrough(!petWindowController?.isModelPassThrough()) },
      { label: "Interrupt", click: () => handleRuntimeInput({ type: "runtime.interrupt" }) },
      { type: "separator" },
      { label: "Quit", click: () => app.quit() }
    ])
  );
}

function createTrayIcon(): Electron.NativeImage {
  const transparentPng =
    "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII=";
  return nativeImage.createFromDataURL(transparentPng).resize({ width: 16, height: 16 });
}

function registerIpc(): void {
  ipcMain.on("runtime:input", (_event, payload) => {
    handleRuntimeInput(payload);
  });

  ipcMain.on("runtime:speech-playback", (_event, payload) => {
    broadcastSpeechPlayback(payload);
  });

  ipcMain.on("provider:test-llm", () => {
    void testLLMProvider();
  });

  ipcMain.on("provider:test-voice", () => {
    void testVoiceProvider();
  });

  ipcMain.on("memory:debug-request", () => {
    void broadcastMemoryDebugSnapshot();
  });

  ipcMain.on("window:set-click-through", (_event, payload: { enabled: boolean }) => {
    setModelPassThrough(payload.enabled);
  });

  ipcMain.on("window:set-hit-test", (_event, payload: { passthrough: boolean; reason: "transparent-area" | "model-pass-through" | "model-hit" }) => {
    applyHitTest(payload);
  });

  ipcMain.on(
    "window:set-shape",
    (_event, payload: { rects: Electron.Rectangle[]; reason: "model-mask" | "drag-full-window" | "reset" }) => {
      applyWindowShape(payload.rects, payload.reason);
    }
  );

  ipcMain.on("window:set-locked", (_event, payload: { locked: boolean }) => {
    petWindowController?.setLocked(payload.locked);
    broadcastWindowState();
  });

  ipcMain.on("settings:update", async (_event, patch: GreyfieldConfigPatch) => {
    const nextConfig = await settingsController?.update(patch);
    if (nextConfig?.window.modelPassThrough !== undefined) {
      petWindowController?.setModelPassThrough(nextConfig.window.modelPassThrough);
      if (petWindowController?.isModelPassThrough()) {
        applyHitTest({ passthrough: true, reason: "model-pass-through" });
      } else {
        applyStoredShape();
      }
      broadcastWindowState();
    }
  });

  ipcMain.on("window:drag-start", (_event, payload: { screenX: number; screenY: number }) => {
    petWindowController?.startDrag(payload);
  });

  ipcMain.on("window:drag-move", (_event, payload: { screenX: number; screenY: number }) => {
    petWindowController?.moveDrag(payload);
  });

  ipcMain.on("window:drag-end", async () => {
    petWindowController?.endDrag();
    if (!petWindow || !settingsController) {
      return;
    }
    const bounds = petWindow.getBounds();
    await settingsController.update({ window: { x: bounds.x, y: bounds.y } });
  });

  ipcMain.on("window:show-pet-menu", (_event, payload: { screenX: number; screenY: number }) => {
    showPetMenu(payload);
  });

  ipcMain.on("window:open-settings", () => showWindowIfUsable(settingsWindow));
  ipcMain.on("window:open-chat", () => showWindowIfUsable(chatWindow));
  ipcMain.on("window:hide-pet", () => hideWindowIfUsable(petWindow));
  ipcMain.on("window:hide-controls", () => hideWindowIfUsable(controlsWindow));
  ipcMain.on("window:controls-drag-start", (_event, payload: { screenX: number; screenY: number }) => {
    startControlsWindowDrag(payload);
  });
  ipcMain.on("window:controls-drag-move", (_event, payload: { screenX: number; screenY: number }) => {
    moveControlsWindowDrag(payload);
  });
  ipcMain.on("window:controls-drag-end", () => {
    controlsWindowDrag = undefined;
  });
  ipcMain.on("stage:choose-model", () => {
    void live2DModelController?.chooseModel();
  });
}

function attachWindowLifecycle(): void {
  const currentPetWindow = petWindow;
  currentPetWindow?.on("closed", () => {
    if (petWindow === currentPetWindow) {
      petWindow = undefined;
      petWindowController = undefined;
    }
  });
  attachHideOnClose(settingsWindow, () => {
    settingsWindow = undefined;
  });
  attachHideOnClose(chatWindow, () => {
    chatWindow = undefined;
  });
  attachHideOnClose(controlsWindow, () => {
    controlsWindow = undefined;
  });
}

function attachHideOnClose(window: BrowserWindow | undefined, markDestroyed: () => void): void {
  window?.on("close", (event) => {
    if (isQuitting || window.isDestroyed()) {
      return;
    }
    event.preventDefault();
    window.hide();
  });
  window?.on("closed", markDestroyed);
}

function handleRuntimeInput(payload: Parameters<NonNullable<typeof runtimeService>["handle"]>[0]): void {
  void runtimeIpcController?.handleRuntimeInput(payload);
}

async function testLLMProvider(): Promise<void> {
  const result = await runtimeService?.testLLM();
  if (result) {
    broadcastProviderTestResult(result);
  }
}

async function testVoiceProvider(): Promise<void> {
  const result = await runtimeService?.testVoice();
  if (result) {
    broadcastVoiceTestResult(result);
  }
}

async function broadcastMemoryDebugSnapshot(): Promise<void> {
  const snapshot = await runtimeService?.getMemoryDebugSnapshot();
  if (!snapshot) {
    return;
  }
  for (const window of BrowserWindow.getAllWindows()) {
    window.webContents.send("memory:debug-snapshot", snapshot);
  }
}

async function setModelPassThrough(enabled: boolean): Promise<void> {
  petWindowController?.setModelPassThrough(enabled);
  await settingsController?.update({ window: { modelPassThrough: enabled } });
  applyHitTest({ passthrough: enabled, reason: enabled ? "model-pass-through" : "transparent-area" });
  if (!enabled) {
    applyStoredShape();
  }
  broadcastWindowState();
}

function applyHitTest(payload: { passthrough: boolean; reason: "transparent-area" | "model-pass-through" | "model-hit" }): void {
  petWindowController?.applyHitTest(payload);
}

function applyWindowShape(rects: Electron.Rectangle[], reason: "model-mask" | "drag-full-window" | "reset"): void {
  petWindowController?.applyWindowShape(rects, reason);
}

function applyStoredShape(): void {
  petWindowController?.applyStoredShape();
}

function startControlsWindowDrag(payload: { screenX: number; screenY: number }): void {
  const window = getUsableWindow(controlsWindow);
  if (!window) {
    return;
  }
  const bounds = window.getBounds();
  controlsWindowDrag = {
    startScreenX: payload.screenX,
    startScreenY: payload.screenY,
    startWindowX: bounds.x,
    startWindowY: bounds.y,
    width: bounds.width,
    height: bounds.height
  };
}

function moveControlsWindowDrag(payload: { screenX: number; screenY: number }): void {
  const window = getUsableWindow(controlsWindow);
  if (!window || !controlsWindowDrag) {
    return;
  }
  window.setBounds({
    x: Math.round(controlsWindowDrag.startWindowX + payload.screenX - controlsWindowDrag.startScreenX),
    y: Math.round(controlsWindowDrag.startWindowY + payload.screenY - controlsWindowDrag.startScreenY),
    width: controlsWindowDrag.width,
    height: controlsWindowDrag.height
  });
}

function canUseWindowShape(): boolean {
  return process.env.GREYFIELD_ENABLE_NATIVE_SHAPE === "1" && (process.platform === "win32" || process.platform === "linux");
}

function showPetMenu(point: { screenX: number; screenY: number }): void {
  const owner = getUsableWindow(petWindow);
  if (!owner) {
    return;
  }
  const menu = Menu.buildFromTemplate([
    { label: "Open Chat", click: () => showWindowIfUsable(chatWindow) },
    { label: "Settings", click: () => showWindowIfUsable(settingsWindow) },
    { label: "Show Controls", click: () => showWindowIfUsable(controlsWindow) },
    { type: "separator" },
    { label: "Model Pass Through", type: "checkbox", checked: petWindowController?.isModelPassThrough(), click: () => setModelPassThrough(!petWindowController?.isModelPassThrough()) },
    { label: "Lock Position", type: "checkbox", checked: petWindowController?.isLocked(), click: () => {
      petWindowController?.setLocked(!petWindowController.isLocked());
      broadcastWindowState();
    } },
    { type: "separator" },
    { label: "Hide Model", click: () => hideWindowIfUsable(petWindow) },
    { label: "Quit", click: () => app.quit() }
  ]);
  const bounds = owner.getBounds();
  const popupPoint = bounds ? toWindowMenuPoint(point, bounds) : { x: 0, y: 0 };
  menu.popup({ window: owner, x: popupPoint.x, y: popupPoint.y });
}

async function showLive2DModelDialog(): Promise<{ canceled: boolean; filePaths: string[] }> {
  const dialogOptions = {
    title: "Choose Live2D Model",
    properties: ["openFile", "openDirectory"],
    filters: [
      { name: "Live2D model3", extensions: ["model3.json"] },
      { name: "All files", extensions: ["*"] }
    ]
  } satisfies Electron.OpenDialogOptions;
  const owner = getUsableWindow(settingsWindow) ?? getUsableWindow(petWindow);
  return owner ? dialog.showOpenDialog(owner, dialogOptions) : dialog.showOpenDialog(dialogOptions);
}

function broadcastModelInfo(selection: Live2DModelInfo): void {
  for (const window of BrowserWindow.getAllWindows()) {
    window.webContents.send("stage:model-info", {
      modelPath: selection.modelPath,
      expressions: selection.expressions,
      motions: selection.motions
    });
  }
}

function broadcastWindowState(): void {
  getUsableWindow(petWindow)?.webContents.send("window:state", {
    modelPassThrough: petWindowController?.isModelPassThrough() ?? false,
    locked: petWindowController?.isLocked() ?? false
  });
}

function broadcastLog(level: "debug" | "info" | "warn" | "error", message: string): void {
  for (const window of BrowserWindow.getAllWindows()) {
    window.webContents.send("log:line", { level, message, createdAt: new Date().toISOString() });
  }
}

function broadcastRuntimeEvent(event: Parameters<Parameters<RuntimeService["handle"]>[1]>[0]): void {
  for (const window of BrowserWindow.getAllWindows()) {
    window.webContents.send("runtime:event", event);
  }
}

function broadcastSpeechPlayback(payload: { type: "finished" | "error"; text: string; message?: string }): void {
  for (const window of BrowserWindow.getAllWindows()) {
    window.webContents.send("runtime:speech-playback", payload);
  }
}

function broadcastProviderTestResult(result: Awaited<ReturnType<RuntimeService["testLLM"]>>): void {
  for (const window of BrowserWindow.getAllWindows()) {
    window.webContents.send("provider:test-llm-result", result);
  }
}

function broadcastVoiceTestResult(result: Awaited<ReturnType<RuntimeService["testVoice"]>>): void {
  for (const window of BrowserWindow.getAllWindows()) {
    window.webContents.send("provider:test-voice-result", result);
  }
}

function broadcastSettings(config: GreyfieldConfig): void {
  const rendererConfig = redactConfigForRenderer(config);
  for (const window of BrowserWindow.getAllWindows()) {
    window.webContents.send("settings:changed", rendererConfig);
  }
}

function resolveConfigPath(): string {
  return process.env.GREYFIELD_CONFIG_PATH ?? join(app.getPath("userData"), "greyfield.config.json");
}

function resolveRuntimeStorePaths(): { userDataPath: string; projectRoot: string } {
  return {
    userDataPath: process.env.GREYFIELD_USER_DATA_PATH ?? app.getPath("userData"),
    projectRoot: process.env.GREYFIELD_PROJECT_ROOT ?? join(currentDir, "..", "..", "..")
  };
}

function resolvePositiveIntegerEnv(name: string): number | undefined {
  const raw = process.env[name];
  if (!raw) {
    return undefined;
  }
  const parsed = Number(raw);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : undefined;
}

app.whenReady().then(createWindows).catch((error) => {
  console.error("Greyfield failed to create windows:", error);
  app.quit();
});

app.on("before-quit", () => {
  isQuitting = true;
});

app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    void createWindows();
  }
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});
