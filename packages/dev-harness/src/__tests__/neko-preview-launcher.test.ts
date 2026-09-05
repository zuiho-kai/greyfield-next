import { execFile } from "node:child_process";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { expect, it } from "vitest";

const execute = promisify(execFile);
it.each(["missing build", "spawn failure"])("reports preview %s without printing launch success", async (failure) => {
  const root = await mkdtemp(join(tmpdir(), "greyfield-preview-launcher-"));
  try {
    const scripts = join(root, "scripts");
    const desktop = join(root, "apps", "desktop");
    const preview = join(root, "preview");
    await mkdir(scripts, { recursive: true });
    await mkdir(join(desktop, "dist-main"), { recursive: true });
    await mkdir(preview);
    await writeFile(join(preview, "greyfield.preview.config.json"), "{}");
    await writeFile(join(scripts, "start.mjs"), await readFile(new URL("../../../../scripts/start-neko-preview.mjs", import.meta.url)));
    if (failure === "spawn failure") {
      await writeFile(join(desktop, "dist-main", "index.mjs"), "");
      const module = join(desktop, "node_modules", "electron");
      await mkdir(module, { recursive: true });
      await writeFile(join(module, "index.js"), `module.exports = ${JSON.stringify(join(root, "missing-electron"))};`);
    }
    const error = await execute(process.execPath, [join(scripts, "start.mjs")], {
      env: { ...process.env, GREYFIELD_NEKO_PREVIEW_DIR: preview }, windowsHide: true
    }).then(() => { throw new Error("launcher unexpectedly succeeded"); }, (error) => error);
    expect(error.code).not.toBe(0);
    expect(error.stdout).not.toContain("process launched");
    expect(error.stderr).toContain(failure === "missing build" ? "pnpm build:desktop" : "ENOENT");
  } finally { await rm(root, { recursive: true, force: true }); }
});
