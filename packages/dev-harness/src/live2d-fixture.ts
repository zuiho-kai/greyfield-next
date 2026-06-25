import { existsSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const workspaceRoot = fileURLToPath(new URL("../../..", import.meta.url));

export function resolveLive2DFixturePath(): string {
  const configured = process.env.GREYFIELD_LIVE2D_FIXTURE;
  if (configured && existsSync(configured)) {
    return configured;
  }

  const packageFixture = join(
    workspaceRoot,
    "apps",
    "desktop",
    "public",
    "assets",
    "live2d",
    "momose-hiyori",
    "runtime",
    "hiyori_free_t08.model3.json"
  );
  if (existsSync(packageFixture)) {
    return packageFixture;
  }

  throw new Error(
    "No Live2D fixture found. Set GREYFIELD_LIVE2D_FIXTURE to a .model3.json file or install the official sample assets."
  );
}

export function toViteFsModelUrl(modelPath: string): string {
  return `/@fs/${modelPath.replace(/\\/g, "/")}`;
}
