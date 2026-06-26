import type { BrowserWindowConstructorOptions } from "electron";
import { join, normalize } from "node:path";
import type { GreyfieldConfig } from "@greyfield/persistence/config-schema";

export function createPetWindowOptions(config: GreyfieldConfig, preload?: string): BrowserWindowConstructorOptions {
  return {
    width: config.window.width,
    height: config.window.height,
    x: config.window.x,
    y: config.window.y,
    transparent: true,
    backgroundColor: "#00000000",
    frame: false,
    resizable: false,
    hasShadow: false,
    alwaysOnTop: config.window.alwaysOnTop,
    show: true,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      preload,
      sandbox: true
    }
  };
}

export function createSettingsWindowOptions(preload?: string): BrowserWindowConstructorOptions {
  return {
    width: 820,
    height: 620,
    show: false,
    frame: true,
    transparent: false,
    resizable: true,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      preload,
      sandbox: true
    }
  };
}

export function createChatWindowOptions(preload?: string): BrowserWindowConstructorOptions {
  return {
    width: 520,
    height: 680,
    show: false,
    frame: true,
    transparent: false,
    resizable: true,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      preload,
      sandbox: true
    }
  };
}

export function createControlsWindowOptions(config: GreyfieldConfig, preload?: string): BrowserWindowConstructorOptions {
  return {
    width: 420,
    height: 140,
    x: config.window.x ?? 0,
    y: (config.window.y ?? 0) + config.window.height - 150,
    transparent: true,
    backgroundColor: "#00000000",
    frame: false,
    resizable: false,
    hasShadow: false,
    alwaysOnTop: config.window.alwaysOnTop,
    show: true,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      preload,
      sandbox: true
    }
  };
}

export function resolveRendererHtmlPath(mainOutputDir: string): string {
  return normalize(join(mainOutputDir, "../dist-renderer/index.html"));
}

export function resolvePreloadPath(mainOutputDir: string): string {
  return normalize(join(mainOutputDir, "../dist-preload/index.cjs"));
}
