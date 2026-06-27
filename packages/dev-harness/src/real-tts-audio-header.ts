export function isPlayableAudioHeader(headerHex: string): boolean {
  const normalized = headerHex.toLowerCase();
  return (
    normalized.startsWith("494433") ||
    /^ff[ef][0-9a-f]/.test(normalized) ||
    normalized.startsWith("52494646") ||
    normalized.startsWith("4f676753")
  );
}
