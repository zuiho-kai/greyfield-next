import { build } from "esbuild";

const productionPersistenceEntryPlugin = {
  name: "production-persistence-entry",
  setup(build) {
    build.onResolve({ filter: /^@greyfield\/persistence$/ }, () => ({
      path: "production-persistence-entry",
      namespace: "greyfield"
    }));
    build.onLoad({ filter: /.*/, namespace: "greyfield" }, () => ({
      resolveDir: process.cwd(),
      loader: "ts",
      contents: [
        'export * from "../../packages/persistence/src/config.ts";',
        'export * from "../../packages/persistence/src/character-persona.ts";',
        'export * from "../../packages/persistence/src/jsonl-session-store.ts";',
        'export * from "../../packages/persistence/src/jsonl-summary-segment-store.ts";',
        'export * from "../../packages/persistence/src/jsonl-memory-atom-store.ts";',
        'export * from "../../packages/persistence/src/jsonl-deleted-memory-evidence-store.ts";',
        'export * from "../../packages/persistence/src/jsonl-user-profile-store.ts";',
        'export * from "../../packages/persistence/src/memory-store.ts";'
      ].join("\n")
    }));
  }
};

await build({
  entryPoints: ["src/main/index.ts"],
  bundle: true,
  platform: "node",
  format: "esm",
  outfile: "dist-main/index.mjs",
  external: ["electron"],
  plugins: [productionPersistenceEntryPlugin],
  banner: {
    js: "import { createRequire } from 'node:module';\nconst require = createRequire(import.meta.url);"
  },
  sourcemap: true,
  target: "node22"
});
