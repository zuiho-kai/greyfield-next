import type { MenuItemConstructorOptions } from "electron";

export interface TrayMenuActions {
  showModel: () => void;
  showSettings: () => void;
  openChat: () => void;
  showControls: () => void;
  toggleModelPassThrough: () => void;
  interrupt: () => void;
  quit: () => void;
}

export interface TrayMenuState {
  modelPassThrough: boolean;
}

export function buildTrayMenuTemplate(actions: TrayMenuActions, state: TrayMenuState): MenuItemConstructorOptions[] {
  return [
    { label: "Show Model", click: actions.showModel },
    { label: "Show Settings", click: actions.showSettings },
    { label: "Open Chat", click: actions.openChat },
    { label: "Show Controls", click: actions.showControls },
    {
      label: "Model Pass Through",
      type: "checkbox",
      checked: state.modelPassThrough,
      click: actions.toggleModelPassThrough
    },
    { label: "Interrupt", click: actions.interrupt },
    { type: "separator" },
    { label: "Quit", click: actions.quit }
  ];
}
