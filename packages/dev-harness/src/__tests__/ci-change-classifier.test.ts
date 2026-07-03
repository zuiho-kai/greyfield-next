import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

type ClassifierOutputs = {
  code_checks: boolean;
  desktop_pet: boolean;
  frontend_required: boolean;
  frontend_smoke: boolean;
  frontend_visual: boolean;
  frontend_user_path: boolean;
  frontend_full_heavy: boolean;
};

const classifierScript = fileURLToPath(
  new URL("../../../../scripts/classify-ci-changes.ps1", import.meta.url)
);
const powershellCommand = process.platform === "win32" ? "powershell" : "pwsh";
const powershellArgs =
  process.platform === "win32"
    ? ["-NoProfile", "-ExecutionPolicy", "Bypass", "-File"]
    : ["-NoProfile", "-File"];

function classify(paths: string[]): ClassifierOutputs {
  const result = spawnSync(
    powershellCommand,
    [...powershellArgs, classifierScript, "-Json", "-ChangedPath", ...paths],
    {
      encoding: "utf8"
    }
  );

  expect(result.status, result.stderr).toBe(0);
  return JSON.parse(result.stdout) as ClassifierOutputs;
}

describe("CI change classifier", () => {
  it("keeps dev launch and fixture helper paths out of frontend split gates", () => {
    expect(
      classify([
        "apps/desktop/scripts/dev-live2d-electron.mjs",
        "apps/desktop/src/main/electron-window-options.ts",
        "packages/dev-harness/src/live2d-fixture.ts"
      ])
    ).toEqual({
      code_checks: true,
      desktop_pet: true,
      frontend_required: false,
      frontend_smoke: false,
      frontend_visual: false,
      frontend_user_path: false,
      frontend_full_heavy: false
    });
  });

  it("keeps renderer-visible changes on all frontend split gates", () => {
    expect(classify(["apps/desktop/src/renderer/ControlsWindow.vue"])).toMatchObject({
      code_checks: true,
      desktop_pet: true,
      frontend_required: true,
      frontend_smoke: true,
      frontend_visual: true,
      frontend_user_path: true,
      frontend_full_heavy: true
    });
  });

  it("keeps stage rendering changes on visible frontend gates without forcing heavy", () => {
    expect(classify(["packages/stage-live2d/src/stage-driver.ts"])).toMatchObject({
      code_checks: true,
      desktop_pet: true,
      frontend_required: true,
      frontend_smoke: true,
      frontend_visual: true,
      frontend_user_path: true,
      frontend_full_heavy: false
    });
  });

  it("keeps runtime package changes on user-path and heavy gates", () => {
    expect(classify(["packages/core-runtime/src/runtime-loop.ts"])).toMatchObject({
      code_checks: true,
      desktop_pet: false,
      frontend_required: true,
      frontend_smoke: false,
      frontend_visual: false,
      frontend_user_path: true,
      frontend_full_heavy: true
    });
  });

  it("still runs frontend gates when frontend harness entrypoints change", () => {
    expect(classify(["packages/dev-harness/src/frontend-full-check.ts"])).toMatchObject({
      code_checks: true,
      desktop_pet: true,
      frontend_required: true,
      frontend_smoke: true,
      frontend_visual: true,
      frontend_user_path: true,
      frontend_full_heavy: true
    });
  });
});
