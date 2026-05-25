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
    "packages",
    "stage-live2d",
    "node_modules",
    "live2dcubismcore",
    "characters",
    "haru_greeter_pro_jp",
    "runtime",
    "haru_greeter_t03.model3.json"
  );
  if (existsSync(packageFixture)) {
    return packageFixture;
  }

  throw new Error(
    "No Live2D fixture found. Set GREYFIELD_LIVE2D_FIXTURE to a .model3.json file or install stage-live2d dependencies."
  );
}

export function toViteFsModelUrl(modelPath: string): string {
  return `/@fs/${modelPath.replace(/\\/g, "/")}`;
}
