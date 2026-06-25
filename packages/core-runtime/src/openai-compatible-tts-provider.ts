import type { TTSProvider, TTSStreamOptions } from "./providers";

export interface OpenAICompatibleTTSProviderOptions {
  baseUrl: string;
  apiKey: string;
  model: string;
  fetch?: typeof fetch;
  timeoutMs?: number;
  responseFormat?: "mp3" | "opus" | "wav" | "pcm";
}

export const DEFAULT_OPENAI_COMPATIBLE_TTS_TIMEOUT_MS = 30_000;

export class OpenAICompatibleTTSProvider implements TTSProvider {
  private readonly fetchImpl: typeof fetch;

  constructor(private readonly options: OpenAICompatibleTTSProviderOptions) {
    this.fetchImpl = options.fetch ?? fetch;
  }

  async synthesize(text: string, voice: string, options: TTSStreamOptions = {}): Promise<Uint8Array> {
    this.validateConfig(voice);
    const timeoutMs = this.options.timeoutMs ?? DEFAULT_OPENAI_COMPATIBLE_TTS_TIMEOUT_MS;
    const abortHandle = createRequestAbortHandle(options.signal, timeoutMs);

    try {
      const response = await this.fetchImpl(`${trimTrailingSlash(this.options.baseUrl)}/audio/speech`, {
        method: "POST",
        signal: abortHandle.signal,
        headers: {
          Authorization: `Bearer ${this.options.apiKey}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          model: this.options.model,
          voice,
          input: text,
          response_format: this.options.responseFormat ?? "mp3",
          stream: false
        })
      });

      if (!response.ok) {
        throw new Error(`OpenAI-compatible TTS request failed: ${response.status} ${response.statusText}`.trim());
      }

      return new Uint8Array(await response.arrayBuffer());
    } catch (error) {
      if (abortHandle.timedOut) {
        throw new Error(`OpenAI-compatible TTS request timed out after ${timeoutMs}ms`);
      }
      if (options.signal?.aborted) {
        return new Uint8Array();
      }
      throw error;
    } finally {
      abortHandle.dispose();
    }
  }

  private validateConfig(voice: string): void {
    if (this.options.baseUrl.trim().length === 0) {
      throw new Error("OpenAI-compatible TTS needs a Base URL before speaking.");
    }
    if (this.options.apiKey.trim().length === 0) {
      throw new Error("OpenAI-compatible TTS needs an API key before speaking.");
    }
    if (this.options.model.trim().length === 0) {
      throw new Error("OpenAI-compatible TTS needs a TTS model before speaking.");
    }
    if (voice.trim().length === 0) {
      throw new Error("OpenAI-compatible TTS needs a voice before speaking.");
    }
  }
}

function trimTrailingSlash(value: string): string {
  return value.replace(/\/+$/g, "");
}

function createRequestAbortHandle(externalSignal: AbortSignal | undefined, timeoutMs: number): {
  signal: AbortSignal;
  timedOut: boolean;
  dispose(): void;
} {
  const controller = new AbortController();
  let timedOut = false;
  let timeout: ReturnType<typeof setTimeout> | undefined;

  const abortFromExternal = () => controller.abort(externalSignal?.reason);
  if (externalSignal?.aborted) {
    abortFromExternal();
  } else {
    externalSignal?.addEventListener("abort", abortFromExternal, { once: true });
  }

  if (timeoutMs > 0 && Number.isFinite(timeoutMs)) {
    timeout = setTimeout(() => {
      timedOut = true;
      controller.abort(new Error(`OpenAI-compatible TTS request timed out after ${timeoutMs}ms`));
    }, timeoutMs);
  }

  return {
    signal: controller.signal,
    get timedOut() {
      return timedOut;
    },
    dispose() {
      if (timeout) {
        clearTimeout(timeout);
      }
      externalSignal?.removeEventListener("abort", abortFromExternal);
    }
  };
}
