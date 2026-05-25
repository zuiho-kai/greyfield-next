import { parseModel3Manifest, resolveModelManifest, type ParsedModel3Manifest } from "@greyfield/stage-live2d";

export interface Live2DModelSelection {
  modelPath: string;
  rootDir: string;
  manifest: ParsedModel3Manifest;
}

export interface Live2DModelSelectionFs {
  stat(path: string): Promise<{ isDirectory(): boolean } | { isDirectory: boolean }>;
  readdir(path: string): Promise<string[]>;
  readFile(path: string, encoding: "utf8"): Promise<string>;
}

export async function resolveLive2DModelSelection(
  selectedPath: string,
  fs: Live2DModelSelectionFs
): Promise<Live2DModelSelection> {
  const stat = await fs.stat(selectedPath);
  const isDirectory = typeof stat.isDirectory === "function" ? stat.isDirectory() : stat.isDirectory;
  const entries = isDirectory ? await fs.readdir(selectedPath) : undefined;
  const resolution = resolveModelManifest(selectedPath, entries);
  const raw = JSON.parse(await fs.readFile(resolution.manifestPath, "utf8")) as unknown;

  return {
    modelPath: resolution.manifestPath,
    rootDir: resolution.rootDir,
    manifest: parseModel3Manifest(raw)
  };
}
