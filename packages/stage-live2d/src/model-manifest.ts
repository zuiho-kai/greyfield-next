export interface ModelManifestResolution {
  manifestPath: string;
  rootDir: string;
}

export function resolveModelManifest(modelPath: string, directoryEntries?: string[]): ModelManifestResolution {
  const normalizedPath = normalizePath(modelPath);
  if (normalizedPath.endsWith(".model3.json")) {
    return {
      manifestPath: normalizedPath,
      rootDir: dirname(normalizedPath)
    };
  }

  const entries = directoryEntries ?? [];
  const manifests = entries
    .map(normalizePath)
    .filter((entry) => entry.endsWith(".model3.json"));

  if (manifests.length === 0) {
    throw new Error(`No Live2D model3 manifest found in ${normalizedPath}`);
  }
  if (manifests.length > 1) {
    throw new Error(`Multiple Live2D model3 manifests found in ${normalizedPath}: ${manifests.join(", ")}`);
  }

  return {
    manifestPath: joinPath(normalizedPath, manifests[0]),
    rootDir: normalizedPath
  };
}

function normalizePath(path: string): string {
  return path.replace(/\\/g, "/").replace(/\/+$/g, "");
}

function dirname(path: string): string {
  const index = path.lastIndexOf("/");
  return index === -1 ? "." : path.slice(0, index);
}

function joinPath(base: string, child: string): string {
  if (child.startsWith(base)) {
    return child;
  }
  return `${base}/${child}`.replace(/\/{2,}/g, "/");
}
