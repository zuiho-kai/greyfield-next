export interface RealProviderHarnessConfig {
  baseUrl: string;
  apiKey: string;
  model: string;
}

const requiredKeys = [
  "GREYFIELD_REAL_LLM_BASE_URL",
  "GREYFIELD_REAL_LLM_API_KEY",
  "GREYFIELD_REAL_LLM_MODEL"
] as const;

export function readRealProviderEnv(env: Record<string, string | undefined>): RealProviderHarnessConfig {
  const missing = requiredKeys.filter((key) => !env[key]?.trim());
  if (missing.length > 0) {
    throw new Error(`Missing ${missing.join(", ")}`);
  }
  return {
    baseUrl: trimTrailingSlash(env.GREYFIELD_REAL_LLM_BASE_URL ?? ""),
    apiKey: env.GREYFIELD_REAL_LLM_API_KEY ?? "",
    model: env.GREYFIELD_REAL_LLM_MODEL ?? ""
  };
}

export function redactRealProviderConfig(config: RealProviderHarnessConfig): RealProviderHarnessConfig {
  return { ...config, apiKey: "<redacted>" };
}

function trimTrailingSlash(value: string): string {
  return value.trim().replace(/\/+$/g, "");
}
