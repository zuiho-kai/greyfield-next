import { build } from "esbuild";

await build({
  entryPoints: ["src/main/index.ts"],
  bundle: true,
  platform: "node",
  format: "esm",
  outfile: "dist-main/index.mjs",
  external: ["electron"],
  banner: {
    js: "import { createRequire } from 'node:module';\nconst require = createRequire(import.meta.url);"
  },
  sourcemap: true,
  target: "node22"
});
