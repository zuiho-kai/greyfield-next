import type { GreyfieldConfig } from "@greyfield/persistence";

export interface DesktopWindowPlan {
  pet: {
    transparent: true;
    frame: false;
    alwaysOnTop: boolean;
    clickThrough: boolean;
    width: number;
    height: number;
  };
  settings: {
    width: number;
    height: number;
    visibleOnStart: boolean;
  };
  tray: {
    enabled: true;
    menuItems: string[];
  };
}

export function createDesktopWindowPlan(config: GreyfieldConfig): DesktopWindowPlan {
  return {
    pet: {
      transparent: true,
      frame: false,
      alwaysOnTop: config.window.alwaysOnTop,
      clickThrough: config.window.clickThrough,
      width: config.window.width,
      height: config.window.height
    },
    settings: {
      width: 820,
      height: 620,
      visibleOnStart: false
    },
    tray: {
      enabled: true,
      menuItems: ["Show Settings", "Toggle Click Through", "Interrupt", "Quit"]
    }
  };
}
