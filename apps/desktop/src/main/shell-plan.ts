import { defaultGreyfieldConfig } from "@greyfield/persistence/config-schema";
import { createDesktopWindowPlan } from "./window-plan";

export function createDesktopShellPlan() {
  return {
    runtime: "fake-provider-first",
    ipc: ["runtime:input", "settings:update", "stage:load-model"],
    windows: createDesktopWindowPlan(defaultGreyfieldConfig)
  };
}
