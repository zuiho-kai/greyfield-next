import { build } from "esbuild";

await build({
  entryPoints: ["src/main/index.ts"],
  bundle: true,
  platform: "node",
  format: "esm",
  outfile: "dist-main/index.mjs",
  external: ["electron"],
  sourcemap: true,
  target: "node22"
});
