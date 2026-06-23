export interface DestroyableWindow {
  isDestroyed(): boolean;
}

export interface ShowableWindow extends DestroyableWindow {
  show(): void;
}

export interface HideableWindow extends DestroyableWindow {
  hide(): void;
}

export function getUsableWindow<T extends DestroyableWindow>(window: T | undefined): T | undefined {
  return window && !window.isDestroyed() ? window : undefined;
}

export function showWindowIfUsable(window: ShowableWindow | undefined): void {
  getUsableWindow(window)?.show();
}

export function hideWindowIfUsable(window: HideableWindow | undefined): void {
  getUsableWindow(window)?.hide();
}
