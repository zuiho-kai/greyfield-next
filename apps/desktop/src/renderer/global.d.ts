import type { GreyfieldDesktopApi } from "../preload";

declare global {
  interface Window {
    greyfield?: GreyfieldDesktopApi;
  }
}

export {};
