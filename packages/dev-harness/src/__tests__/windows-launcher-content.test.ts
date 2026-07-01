import { readFileSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { describe, expect, it } from "vitest";

async function loadLauncherModule(): Promise<{
  buildLauncherFiles: () => Array<{ relativePath: string; content: string }>;
}> {
  return import(pathToFileURL(join(process.cwd(), "scripts", "windows-launcher-content.mjs")).href);
}

describe("Windows launcher scripts", () => {
  it("generates double-click VBS launchers that hide command windows and quote paths with spaces", async () => {
    const { buildLauncherFiles } = await loadLauncherModule();
    const files = buildLauncherFiles();
    const launchVbs = files.find((file) => file.relativePath === "Launch Greyfield.vbs");

    expect(launchVbs?.content).toContain("shell.Run command, 0, False");
    expect(launchVbs?.content).toContain("-File \" & QuoteForCommand(ps1)");
    expect(launchVbs?.content).toContain("-WorkspaceRoot \" & QuoteForCommand(root)");
    expect(launchVbs?.content).toContain("GetParentFolderName(WScript.ScriptFullName)");
  });

  it("generates PowerShell launch logic with user-facing failures and hidden pnpm startup", async () => {
    const { buildLauncherFiles } = await loadLauncherModule();
    const files = buildLauncherFiles();
    const launchPs1 = files.find((file) => file.relativePath === "scripts/launch-greyfield-windows.ps1");

    expect(launchPs1?.content).toContain("Show-GreyfieldMessage");
    expect(launchPs1?.content).toContain("pnpm install");
    expect(launchPs1?.content).toContain("port");
    expect(launchPs1?.content).toContain("Electron");
    expect(launchPs1?.content).toContain("-WindowStyle Hidden");
    expect(launchPs1?.content).toContain('"dev:live2d"');
  });

  it("keeps the existing developer live2d commands alongside the Windows launcher command", () => {
    const packageJson = JSON.parse(readFileSync(join(process.cwd(), "package.json"), "utf8"));

    expect(packageJson.scripts["dev:live2d"]).toBe("node apps/desktop/scripts/dev-live2d-electron.mjs");
    expect(packageJson.scripts["dev:live2d:fast"]).toBe("node apps/desktop/scripts/dev-live2d-electron.mjs --skip-build");
    expect(packageJson.scripts["dev:live2d:stop"]).toBe("node apps/desktop/scripts/stop-live2d-electron.mjs");
    expect(packageJson.scripts["launch:windows"]).toBe("node scripts/create-windows-launchers.mjs");
  });

  it("keeps committed launcher files in sync with the generated templates", async () => {
    const { buildLauncherFiles } = await loadLauncherModule();

    for (const file of buildLauncherFiles()) {
      expect(readFileSync(join(process.cwd(), file.relativePath), "utf8")).toBe(file.content);
    }
  });
});
