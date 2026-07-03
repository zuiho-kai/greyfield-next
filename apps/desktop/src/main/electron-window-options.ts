import type { BrowserWindowConstructorOptions } from "electron";
import { createRequire } from "node:module";
import { join, normalize } from "node:path";
import type { GreyfieldConfig } from "@greyfield/persistence/config-schema";

const require = createRequire(import.meta.url);

export interface VisibleArea {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface WindowPlacement {
  x: number;
  y: number;
  width: number;
  height: number;
}

export function createPetWindowOptions(
  config: GreyfieldConfig,
  preload?: string,
  displayWorkAreas: VisibleArea[] = getElectronDisplayWorkAreas()
): BrowserWindowConstructorOptions {
  const placement = createClampedPetPlacement(config, displayWorkAreas);
  return {
    width: placement.width,
    height: placement.height,
    x: placement.x,
    y: placement.y,
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

export function createControlsWindowOptions(
  config: GreyfieldConfig,
  preload?: string,
  displayWorkAreas: VisibleArea[] = getElectronDisplayWorkAreas()
): BrowserWindowConstructorOptions {
  const placement = createClampedControlsPlacement(config, displayWorkAreas);
  return {
    width: placement.width,
    height: placement.height,
    x: placement.x,
    y: placement.y,
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

function createClampedPetPlacement(config: GreyfieldConfig, displayWorkAreas: VisibleArea[]): WindowPlacement {
  const width = config.window.width;
  const height = config.window.height;
  return clampWindowPlacement(
    {
      x: config.window.x ?? 0,
      y: config.window.y ?? 0,
      width,
      height
    },
    displayWorkAreas
  );
}

function createClampedControlsPlacement(config: GreyfieldConfig, displayWorkAreas: VisibleArea[]): WindowPlacement {
  const pet = createClampedPetPlacement(config, displayWorkAreas);
  return clampWindowPlacement(
    {
      width: 456,
      height: 140,
      x: pet.x,
      y: pet.y + pet.height - 150
    },
    displayWorkAreas
  );
}

function clampWindowPlacement(placement: WindowPlacement, displayWorkAreas: VisibleArea[]): WindowPlacement {
  const display = findNearestVisibleArea(placement, displayWorkAreas);
  if (!display) {
    return placement;
  }
  return {
    ...placement,
    x: clampCoordinate(placement.x, display.x, display.x + Math.max(0, display.width - placement.width)),
    y: clampCoordinate(placement.y, display.y, display.y + Math.max(0, display.height - placement.height))
  };
}

function findNearestVisibleArea(placement: WindowPlacement, displayWorkAreas: VisibleArea[]): VisibleArea | undefined {
  if (displayWorkAreas.length === 0) {
    return undefined;
  }
  const windowCenter = {
    x: placement.x + placement.width / 2,
    y: placement.y + placement.height / 2
  };
  return displayWorkAreas.reduce((nearest, candidate) => {
    const nearestDistance = distanceToArea(windowCenter, nearest);
    const candidateDistance = distanceToArea(windowCenter, candidate);
    return candidateDistance < nearestDistance ? candidate : nearest;
  });
}

function distanceToArea(point: { x: number; y: number }, area: VisibleArea): number {
  const x = clampCoordinate(point.x, area.x, area.x + area.width);
  const y = clampCoordinate(point.y, area.y, area.y + area.height);
  return (point.x - x) ** 2 + (point.y - y) ** 2;
}

function clampCoordinate(value: number, min: number, max: number): number {
  if (max < min) {
    return min;
  }
  return Math.min(max, Math.max(min, Math.round(value)));
}

function getElectronDisplayWorkAreas(): VisibleArea[] {
  try {
    const electron = require("electron") as {
      screen?: { getAllDisplays?: () => Array<{ workArea: VisibleArea }> };
    };
    return electron.screen?.getAllDisplays?.().map((display) => display.workArea) ?? [];
  } catch {
    return [];
  }
}
