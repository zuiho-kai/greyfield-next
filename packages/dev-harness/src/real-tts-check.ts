import { OpenAICompatibleTTSProvider } from "@greyfield/core-runtime";

interface RealTTSHarnessConfig {
  baseUrl: string;
  apiKey: string;
  model: string;
  voice: string;
}

const config = readRealTTSEnv(process.env);
const provider = new OpenAICompatibleTTSProvider({
  baseUrl: config.baseUrl,
  apiKey: config.apiKey,
  model: config.model,
  timeoutMs: 30_000
});

const audio = await provider.synthesize("你好，这是 Greyfield 的真实语音验收。", config.voice);
const headerHex = Array.from(audio.slice(0, 8))
  .map((byte) => byte.toString(16).padStart(2, "0"))
  .join("");

if (!isPlayableAudio(audio)) {
  throw new Error(`Real TTS returned non-playable audio bytes: length=${audio.length}, header=${headerHex}`);
}

console.log(
  JSON.stringify(
    {
      ok: true,
      provider: redactRealTTSConfig(config),
      bytes: audio.length,
      headerHex
    },
    null,
    2
  )
);

function readRealTTSEnv(env: Record<string, string | undefined>): RealTTSHarnessConfig {
  const baseUrl = env.GREYFIELD_REAL_TTS_BASE_URL || env.GREYFIELD_REAL_LLM_BASE_URL;
  const apiKey = env.GREYFIELD_REAL_TTS_API_KEY || env.GREYFIELD_REAL_LLM_API_KEY;
  const model = env.GREYFIELD_REAL_TTS_MODEL || "FunAudioLLM/CosyVoice2-0.5B";
  const voice = env.GREYFIELD_REAL_TTS_VOICE || "FunAudioLLM/CosyVoice2-0.5B:anna";
  const missing = [
    ["GREYFIELD_REAL_TTS_BASE_URL or GREYFIELD_REAL_LLM_BASE_URL", baseUrl],
    ["GREYFIELD_REAL_TTS_API_KEY or GREYFIELD_REAL_LLM_API_KEY", apiKey]
  ]
    .filter(([, value]) => !value?.trim())
    .map(([key]) => key);
  if (missing.length > 0) {
    throw new Error(`Missing ${missing.join(", ")}`);
  }
  return {
    baseUrl: trimTrailingSlash(baseUrl ?? ""),
    apiKey: apiKey ?? "",
    model,
    voice
  };
}

function redactRealTTSConfig(config: RealTTSHarnessConfig): RealTTSHarnessConfig {
  return { ...config, apiKey: "<redacted>" };
}

function trimTrailingSlash(value: string): string {
  return value.trim().replace(/\/+$/g, "");
}

function isPlayableAudio(audio: Uint8Array): boolean {
  if (audio.length < 4) {
    return false;
  }
  const [a, b, c, d] = audio;
  return (
    (a === 0x49 && b === 0x44 && c === 0x33) ||
    (a === 0xff && (b & 0xe0) === 0xe0) ||
    (a === 0x52 && b === 0x49 && c === 0x46 && d === 0x46) ||
    (a === 0x4f && b === 0x67 && c === 0x67 && d === 0x53)
  );
}
