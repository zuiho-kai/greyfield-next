import { app, BrowserWindow, dialog, ipcMain, Menu, nativeImage, Tray } from "electron";
import { readdir, readFile, stat } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import type { GreyfieldConfig, GreyfieldConfigPatch } from "@greyfield/persistence/config-schema";
import { loadCharacterPersona, loadGreyfieldConfig, saveCharacterPersona, saveGreyfieldConfig } from "@greyfield/persistence";
import { createDesktopRuntimeStoreOptions, resolveCharacterPath } from "./desktop-runtime-stores";
import { createChatWindowOptions, createControlsWindowOptions, createPetWindowOptions, createSettingsWindowOptions, resolvePreloadPath, resolveRendererHtmlPath } from "./electron-window-options";
import { Live2DModelController, type Live2DModelInfo } from "./live2d-model-controller";
import { resolveLive2DModelSelection } from "./live2d-model-selection";
import { ObservationController } from "./observation-controller";
import { toWindowMenuPoint } from "./pet-menu";
import { PetWindowController } from "./pet-window-controller";
import { RuntimeIpcController } from "./runtime-ipc-controller";
import { RuntimeService } from "./runtime-service";
import { ElectronScreenCaptureSource } from "./screen-capture-source";
import { redactConfigForRenderer } from "./settings-redaction";
import { SettingsController } from "./settings-controller";
import { buildTrayMenuTemplate } from "./tray-menu";
import { applyWindowLayerMode } from "./window-layer-mode";
import { getUsableWindow, hideWindowIfUsable, showWindowIfUsable } from "./window-lifecycle";
import type { DesktopPersonaSaveRequest, DesktopProactiveCheckRequest, DesktopScreenAwarenessState } from "../shared/ipc";

const currentDir = dirname(fileURLToPath(import.meta.url));
let petWindow: BrowserWindow | undefined;
let settingsWindow: BrowserWindow | undefined;
let chatWindow: BrowserWindow | undefined;
let controlsWindow: BrowserWindow | undefined;
let tray: Tray | undefined;
let settingsController: SettingsController | undefined;
let runtimeService: RuntimeService | undefined;
let runtimeIpcController: RuntimeIpcController | undefined;
let observationController: ObservationController | undefined;
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
  observationController = new ObservationController({
    captureSource: new ElectronScreenCaptureSource(),
    broadcast: broadcastScreenAwarenessState
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
  attachSettingsReplayOnLoad(petWindow);
  petWindowController = new PetWindowController({
    getWindow: () => getUsableWindow(petWindow),
    nativeShapeEnabled: canUseWindowShape()
  });
  petWindowController.setModelPassThrough(config.window.modelPassThrough);
  settingsWindow = new BrowserWindow(createSettingsWindowOptions(preload));
  attachSettingsReplayOnLoad(settingsWindow);
  chatWindow = new BrowserWindow(createChatWindowOptions(preload));
  attachSettingsReplayOnLoad(chatWindow);
  controlsWindow = new BrowserWindow(createControlsWindowOptions(config, preload));
  attachSettingsReplayOnLoad(controlsWindow);
  attachWindowLifecycle();
  applyWindowLayerMode(
    config.window.layerMode,
    {
      petWindow: getUsableWindow(petWindow),
      controlsWindow: getUsableWindow(controlsWindow)
    },
    config.window.alwaysOnTop
  );

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
    Menu.buildFromTemplate(
      buildTrayMenuTemplate(
        {
          showModel: () => showWindowIfUsable(petWindow),
          showSettings: () => showWindowIfUsable(settingsWindow),
          openChat: () => showWindowIfUsable(chatWindow),
          showControls: () => showWindowIfUsable(controlsWindow),
          toggleModelPassThrough: () => setModelPassThrough(!petWindowController?.isModelPassThrough()),
          interrupt: () => handleRuntimeInput({ type: "runtime.interrupt" }),
          quit: () => app.quit()
        },
        { modelPassThrough: petWindowController?.isModelPassThrough() ?? false }
      )
    )
  );
}

function createTrayIcon(): Electron.NativeImage {
  const iconPng =
    "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAYAAABzenr0AAAAAXNSR0IArs4c6QAAAARnQU1BAACxjwv8YQUAAAAJcEhZcwAADsMAAA7DAcdvqGQAAATJSURBVFhH1ZdbTBxlFMf75lvffOsTl3JrYmNMbDQ2JqYPXp5sYqQxMSa2IBYq0KWlYAulLKZ4AeWiNS0SlyqiUqq1sqUtyNLa1JICZSmWStkFFmZnb+xl9jJzjjnD7LL9Znbl9uI/OcnsZjK/c/vO931btvxfBQDbAODZqCFiCvvOpgoAtgLAXgBoAIDxYDhsDYRCc1Gj3wAwBQDnACAXAJ5kv7EuKeAiUZLuLgnCIrfk8c7Y7TA4OYk9w8OyXbwzjNfGzTjD87jo8fg8AYGLiOJ9AKjckCNKeoc9QoCzOHjx8ugIHuow4PM1JzG19DCmluowrYSsTLad5cfxYJsBzw/9iRa7Q3IHAnZJAjMAvMZ++z9F6aYobC6XcNU8jm+2NmHK4VJMJdOApxUfwfTio5j+QTmmHzqGL+s/w/OmWzjrcIYjoviIssEyEkqBP7I6HJGmPiNmlpetCb6drKhCtqMdP8nZoD4BgBqWpRKlnSIneHVPN6boStYN315UiRmFlfhWw1l8aOPEcEScoQZlmTFRw1CzUdop8s2AZxR+iBkHj2NpWxfO8s6I0pxZLFsW1Ykah2q+kbSz8Eyy909gy+UB5Jd8bgBoZdly9BKAmbr99S8aksM/6UcLasmOhtPacLLnyk7j1DwHoihNq7JAtaHl1nX7VhJ4Jw6yTEYmgzY8s6AKswqqsfHidXR4/S5VQ9IEW/C4/QXt7auD3+tSpb1qjBxIDM967yS+WtWKc7wrDAA34+FbqTlowj1VWaEBL8MT95LDE6U9Hp6VX4PZ+TV4++8ZVFbEchnoQQiFZqn5tOBpxT+gKUY3Y9UG4Nl5p/Bs7030CyFbbEICwB5/MGjruHFDA34E0+ObjhvA3A3AyfSdRvT4BTsA5EUdyPUEAtyZ6/1qOC21DnMsfhzrisFz++wr/0e1aMLcJPDsvFrUfX0BnV6/M9aIlAqfICx888egGk7r3MA6sBx5Igf2JYHnHKhF/fdGdPsEHgB0sgOIuJNm9e8jo2o41bt+IG7dT2CVKu0/r/QIOZAEnnNAj1/+OoQ+IbgQG8s0hCKSND0+O4fZugqNCdeEBi7mAVr6WpiaMw4kgefsr0PjnfsohMKzALBbWYiyE7/YXG5hX9NX2uPVMLHigexEa1zDdcc5MLTsQAL4CyWNaOVcIp2qAOCJeAeKnD6fs7n3mhoe7XbGCU2RAwngO/bXYcW5S8h7fEuq/YAOlVSGB7YF2FVRq4bH1bx6jKUqGr2QMHKCP51fjyMP5zAYjtD5cc9jDpDIK97rdTdcupIQvpp1rgXf8e5HcvScy+ujcrNsWTQRaaey8g7xnea2TYW/pGvGiZlFSRnB6uijoulEHfpgfhFeOfX5psAp9f0jU9Glpz4LsKKzP71sts5Lb3x8ZkNwipzgyuQzPtb5iUQvkac0nOhAWdv1Gz5TUrdmeHFLt5x2JXKCb2NZSSVfSERp2u72eu/+Y8Vj7T34YnljUviuwk9l8F+TFrnhlJq30pbPfn9VUi4nP9LVi/d4l6x2p2gcnkB9Z6+8q71d/6082/XfXcFu0whaOKdEDgvBMB3DB9Z1KdESdW70XkhN6vYLdqpr1Gh7VaDR++Fe9hubJiUrRYp10K6mPO9ea6r/Bct9CRlGiyoEAAAAAElFTkSuQmCC";
  return nativeImage.createFromDataURL(iconPng).resize({ width: 16, height: 16 });
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

  ipcMain.on("provider:test-voice", (event) => {
    void testVoiceProvider(event.sender);
  });

  ipcMain.on("memory:debug-request", () => {
    void broadcastMemoryDebugSnapshot();
  });

  ipcMain.on("memory:summary-update", (_event, payload) => {
    void updateMemorySummary(payload);
  });

  ipcMain.on("memory:summary-delete", (_event, payload) => {
    void deleteMemorySummary(payload.id);
  });

  ipcMain.on("memory:summary-clear", () => {
    void clearMemorySummaries();
  });

  ipcMain.on("memory:atom-update", (_event, payload) => {
    void updateMemoryAtom(payload);
  });

  ipcMain.on("memory:atom-delete", (_event, payload) => {
    void deleteMemoryAtom(payload.id);
  });

  ipcMain.on("memory:atom-clear-current-role", () => {
    void clearCurrentRoleMemoryAtoms();
  });

  ipcMain.on("memory:atom-export", (event, payload) => {
    void exportMemoryAtom(event.sender, payload.id);
  });

  ipcMain.on("memory:export-request", (event) => {
    void exportMemory(event.sender);
  });

  ipcMain.on("screen-awareness:set-enabled", (_event, payload) => {
    void observationController?.setEnabled(payload.enabled);
  });

  ipcMain.on("proactive:check", (_event, payload) => {
    void checkProactiveMemory(payload);
  });

  ipcMain.on("persona:load", (event) => {
    void sendCurrentPersona(event.sender);
  });

  ipcMain.on("persona:save", (event, payload: DesktopPersonaSaveRequest) => {
    void saveCurrentPersona(event.sender, payload.persona);
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
    if (nextConfig) {
      applyWindowLayerMode(
        nextConfig.window.layerMode,
        {
          petWindow: getUsableWindow(petWindow),
          controlsWindow: getUsableWindow(controlsWindow)
        },
        nextConfig.window.alwaysOnTop
      );
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
  void (async () => {
    const input =
      payload.type === "text.input" && observationController?.isEnabled()
        ? {
            ...payload,
            ...(await observationController.ensureFreshContext())
          }
        : payload;
    await runtimeIpcController?.handleRuntimeInput(input);
  })();
}

async function testLLMProvider(): Promise<void> {
  const result = await runtimeService?.testLLM();
  if (result) {
    broadcastProviderTestResult(result);
  }
}

async function testVoiceProvider(sender: Electron.WebContents): Promise<void> {
  const result = await runtimeService?.testVoice();
  if (result) {
    broadcastVoiceTestResult(sender, result);
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

async function updateMemorySummary(payload: Parameters<NonNullable<typeof runtimeService>["updateMemorySummary"]>[1] & { id: string }): Promise<void> {
  const result = await runtimeService?.updateMemorySummary(payload.id, payload);
  if (!result) {
    broadcastMemoryActionResult({ ok: false, message: "Memory runtime is not available." });
    return;
  }
  broadcastMemoryActionResult({ ok: result.ok, message: result.message });
  if (result.snapshot) {
    broadcastMemoryDebugSnapshotPayload(result.snapshot);
  }
}

async function deleteMemorySummary(id: string): Promise<void> {
  const result = await runtimeService?.deleteMemorySummary(id);
  if (!result) {
    broadcastMemoryActionResult({ ok: false, message: "Memory runtime is not available." });
    return;
  }
  broadcastMemoryActionResult({ ok: result.ok, message: result.message });
  if (result.snapshot) {
    broadcastMemoryDebugSnapshotPayload(result.snapshot);
  }
}

async function clearMemorySummaries(): Promise<void> {
  const result = await runtimeService?.clearMemorySummaries();
  if (!result) {
    broadcastMemoryActionResult({ ok: false, message: "Memory runtime is not available." });
    return;
  }
  broadcastMemoryActionResult({ ok: result.ok, message: result.message });
  if (result.snapshot) {
    broadcastMemoryDebugSnapshotPayload(result.snapshot);
  }
}

async function updateMemoryAtom(payload: Parameters<NonNullable<typeof runtimeService>["updateMemoryAtom"]>[1] & { id: string }): Promise<void> {
  const result = await runtimeService?.updateMemoryAtom(payload.id, payload);
  if (!result) {
    broadcastMemoryActionResult({ ok: false, message: "Memory runtime is not available." });
    return;
  }
  broadcastMemoryActionResult({ ok: result.ok, message: result.message });
  if (result.snapshot) {
    broadcastMemoryDebugSnapshotPayload(result.snapshot);
  }
}

async function deleteMemoryAtom(id: string): Promise<void> {
  const result = await runtimeService?.deleteMemoryAtom(id);
  if (!result) {
    broadcastMemoryActionResult({ ok: false, message: "Memory runtime is not available." });
    return;
  }
  broadcastMemoryActionResult({ ok: result.ok, message: result.message });
  if (result.snapshot) {
    broadcastMemoryDebugSnapshotPayload(result.snapshot);
  }
}

async function clearCurrentRoleMemoryAtoms(): Promise<void> {
  const result = await runtimeService?.clearCurrentRoleMemoryAtoms();
  if (!result) {
    broadcastMemoryActionResult({ ok: false, message: "Memory runtime is not available." });
    return;
  }
  broadcastMemoryActionResult({ ok: result.ok, message: result.message });
  if (result.snapshot) {
    broadcastMemoryDebugSnapshotPayload(result.snapshot);
  }
}

async function exportMemory(sender: Electron.WebContents): Promise<void> {
  const exported = await runtimeService?.exportMemory();
  if (!exported) {
    sender.send("memory:export-result", { ok: false, message: "Memory runtime is not available." });
    return;
  }
  sender.send("memory:export-result", {
    ok: true,
    message: "Memory export is ready.",
    export: exported
  });
}

async function exportMemoryAtom(sender: Electron.WebContents, id: string): Promise<void> {
  const exported = await runtimeService?.exportMemoryAtom(id);
  if (!exported) {
    sender.send("memory:export-result", {
      ok: false,
      message: `Atom memory ${id} was not found in the current role.`
    });
    return;
  }
  sender.send("memory:export-result", {
    ok: true,
    message: `Atom memory ${id} export is ready.`,
    export: exported
  });
}

async function checkProactiveMemory(payload: DesktopProactiveCheckRequest): Promise<void> {
  if (getUsableWindow(settingsWindow)?.isVisible()) {
    return;
  }
  if (observationController?.isEnabled()) {
    const visualContext = await observationController.ensureFreshContext();
    const screenAwareResult = await runtimeService?.checkProactiveScreenAwareness(visualContext);
    const window = getUsableWindow(petWindow);
    if (screenAwareResult?.message && window) {
      window.webContents.send("proactive:message", screenAwareResult.message);
      return;
    }
  }
  const result = await runtimeService?.checkProactiveMemory(payload.sceneContext);
  const window = getUsableWindow(petWindow);
  if (!result?.message || !window) {
    return;
  }
  window.webContents.send("proactive:message", result.message);
}

function broadcastMemoryActionResult(result: { ok: boolean; message: string }): void {
  for (const window of BrowserWindow.getAllWindows()) {
    window.webContents.send("memory:action-result", result);
  }
}

function broadcastMemoryDebugSnapshotPayload(snapshot: Awaited<ReturnType<NonNullable<typeof runtimeService>["getMemoryDebugSnapshot"]>>): void {
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

function broadcastVoiceTestResult(sender: Electron.WebContents, result: Awaited<ReturnType<RuntimeService["testVoice"]>>): void {
  if (!sender.isDestroyed()) {
    sender.send("provider:test-voice-result", result);
  }
}

function broadcastScreenAwarenessState(state: DesktopScreenAwarenessState): void {
  for (const window of BrowserWindow.getAllWindows()) {
    window.webContents.send("screen-awareness:state", state);
  }
}

function broadcastSettings(config: GreyfieldConfig): void {
  const rendererConfig = redactConfigForRenderer(config);
  for (const window of BrowserWindow.getAllWindows()) {
    window.webContents.send("settings:changed", rendererConfig);
  }
}

function attachSettingsReplayOnLoad(window: BrowserWindow): void {
  window.webContents.on("did-finish-load", () => {
    const config = settingsController?.getCurrent();
    if (!config || window.isDestroyed()) {
      return;
    }
    window.webContents.send("settings:changed", redactConfigForRenderer(config));
    const screenAwarenessState = observationController?.getState();
    if (screenAwarenessState) {
      window.webContents.send("screen-awareness:state", screenAwarenessState);
    }
  });
}

async function sendCurrentPersona(sender: Electron.WebContents): Promise<void> {
  const config = settingsController?.getCurrent();
  if (!config) {
    sendPersonaError(sender, "", "Settings are not ready yet.");
    return;
  }
  const path = resolveCurrentCharacterPath(config);
  try {
    const persona = await loadCharacterPersona(path);
    if (!sender.isDestroyed()) {
      sender.send("persona:state", {
        status: "ready",
        path,
        message: `Loaded persona from ${path}`,
        persona
      });
    }
  } catch (error) {
    sendPersonaError(sender, path, `Could not load persona: ${error instanceof Error ? error.message : String(error)}`);
  }
}

async function saveCurrentPersona(sender: Electron.WebContents, persona: DesktopPersonaSaveRequest["persona"]): Promise<void> {
  const config = settingsController?.getCurrent();
  if (!config) {
    sendPersonaError(sender, "", "Settings are not ready yet.");
    return;
  }
  const path = resolveCurrentCharacterPath(config);
  try {
    const saved = await saveCharacterPersona(path, persona);
    broadcastPersonaState({
      status: "saved",
      path,
      message: `Saved persona to ${path}`,
      persona: saved
    });
  } catch (error) {
    sendPersonaError(sender, path, `Could not save persona: ${error instanceof Error ? error.message : String(error)}`);
  }
}

function sendPersonaError(sender: Electron.WebContents, path: string, message: string): void {
  if (!sender.isDestroyed()) {
    sender.send("persona:state", {
      status: "error",
      path,
      message
    });
  }
}

function broadcastPersonaState(payload: {
  status: "ready" | "saved" | "error";
  path: string;
  message: string;
  persona?: DesktopPersonaSaveRequest["persona"];
}): void {
  for (const window of BrowserWindow.getAllWindows()) {
    window.webContents.send("persona:state", payload);
  }
}

function resolveCurrentCharacterPath(config: GreyfieldConfig): string {
  return resolveCharacterPath(config, resolveRuntimeStorePaths().projectRoot);
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
