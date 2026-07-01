import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { buildLauncherFiles } from "./windows-launcher-content.mjs";

const workspaceRoot = fileURLToPath(new URL("..", import.meta.url));

for (const file of buildLauncherFiles()) {
  const targetPath = join(workspaceRoot, file.relativePath);
  await mkdir(dirname(targetPath), { recursive: true });
  await writeFile(targetPath, file.content, "utf8");
  console.log(`wrote ${file.relativePath}`);
}

console.log("Windows launchers are ready. Double-click Launch Greyfield.vbs to start, or Stop Greyfield.vbs to stop.");
