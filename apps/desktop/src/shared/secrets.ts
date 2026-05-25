export const API_KEY_MASK = "__GREYFIELD_API_KEY_SAVED__";

export function isMaskedApiKey(value: string): boolean {
  return value === API_KEY_MASK;
}
