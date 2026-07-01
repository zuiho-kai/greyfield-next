import type { GreyfieldWindowLayerMode } from "@greyfield/persistence/config-schema";

type LayerLevel = "normal" | "floating";

export interface LayerManagedWindow {
  setAlwaysOnTop(flag: boolean, level?: LayerLevel): void;
  moveTop(): void;
}

export function applyWindowLayerMode(
  mode: GreyfieldWindowLayerMode,
  windows: {
    petWindow?: LayerManagedWindow;
    controlsWindow?: LayerManagedWindow;
  },
  alwaysOnTop = true
): void {
  const petWindow = windows.petWindow;
  const controlsWindow = windows.controlsWindow;
  if (!petWindow && !controlsWindow) {
    return;
  }

  if (!alwaysOnTop) {
    petWindow?.setAlwaysOnTop(false);
    controlsWindow?.setAlwaysOnTop(false);
    return;
  }

  if (mode === "controls-front") {
    petWindow?.setAlwaysOnTop(true, "normal");
    controlsWindow?.setAlwaysOnTop(true, "floating");
    controlsWindow?.moveTop();
    return;
  }

  if (mode === "pet-front") {
    petWindow?.setAlwaysOnTop(true, "floating");
    controlsWindow?.setAlwaysOnTop(true, "normal");
    petWindow?.moveTop();
    return;
  }

  petWindow?.setAlwaysOnTop(true, "normal");
  controlsWindow?.setAlwaysOnTop(true, "normal");
}
