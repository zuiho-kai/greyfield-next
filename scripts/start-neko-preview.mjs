import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const desktop = join(root, "apps", "desktop");
const preview = process.env.GREYFIELD_NEKO_PREVIEW_DIR || join(root, ".cache", "neko-plugin-acceptance");
const config = join(preview, "greyfield.preview.config.json");
if (!existsSync(config)) throw new Error("Missing private preview config. Set up the preview before launching.");
const require = createRequire(join(desktop, "package.json"));
const executable = require("electron");
const env = { ...process.env, GREYFIELD_PROJECT_ROOT: root, GREYFIELD_CONFIG_PATH: config,
  GREYFIELD_USER_DATA_PATH: join(preview, "user-data") };
delete env.GREYFIELD_NEKO_SOURCE_PATH;
delete env.ELECTRON_RUN_AS_NODE;
const child = spawn(executable, [join(desktop, "dist-main", "index.mjs")], { cwd: desktop, env, detached: true, stdio: "ignore", windowsHide: true });
child.unref();
console.log("Greyfield preview started. Open Settings → Plugins → N.E.K.O → Start voice.");
