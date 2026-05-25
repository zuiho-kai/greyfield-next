export function toRendererModelUrl(modelPath: string): string {
  const trimmed = modelPath.trim();
  if (trimmed.length === 0) {
    return "";
  }
  if (/^(https?:|blob:|data:|file:)/i.test(trimmed) || trimmed.startsWith("/")) {
    return trimmed;
  }
  const normalized = trimmed.replace(/\\/g, "/");
  if (/^[A-Za-z]:\//.test(normalized) || normalized.startsWith("//")) {
    return `/@fs/${normalized}`;
  }
  return normalized;
}
