import type { ASRProvider, ASRTranscribeOptions } from "./providers";

export interface OpenAICompatibleASRProviderOptions {
  baseUrl: string;
  apiKey: string;
  model: string;
  fetch?: typeof fetch;
  timeoutMs?: number;
}

export class OpenAICompatibleASRProvider implements ASRProvider {
  constructor(private readonly options: OpenAICompatibleASRProviderOptions) {}

  async transcribe(audio: Uint8Array, options: ASRTranscribeOptions = {}): Promise<string> {
    this.validateConfig();
    if (audio.length === 0) {
      throw new Error("OpenAI-compatible ASR needs microphone audio before transcribing.");
    }
    const fetchImpl = this.options.fetch ?? fetch;
    const controller = new AbortController();
    const timeout = setTimeout(
      () => controller.abort(new Error("OpenAI-compatible ASR request timed out.")),
      this.options.timeoutMs ?? 30_000
    );
    const abortFromCaller = () => controller.abort(options.signal?.reason);
    options.signal?.addEventListener("abort", abortFromCaller, { once: true });

    try {
      const form = new FormData();
      form.append("model", this.options.model.trim());
      form.append("response_format", "json");
      form.append("file", new Blob([audio.slice().buffer], { type: "audio/webm" }), "greyfield-microphone.webm");
      const response = await fetchImpl(`${trimTrailingSlash(this.options.baseUrl)}/audio/transcriptions`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.options.apiKey}`
        },
        body: form,
        signal: controller.signal
      });
      if (!response.ok) {
        throw new Error(`OpenAI-compatible ASR request failed: ${response.status} ${response.statusText}`.trim());
      }
      const payload = (await response.json()) as { text?: unknown };
      const text = typeof payload.text === "string" ? payload.text.trim() : "";
      if (text.length === 0) {
        throw new Error("OpenAI-compatible ASR returned an empty transcript.");
      }
      return text;
    } catch (error) {
      if (controller.signal.aborted && error instanceof DOMException && error.name === "AbortError") {
        throw new Error("OpenAI-compatible ASR request timed out or was stopped.");
      }
      throw error;
    } finally {
      clearTimeout(timeout);
      options.signal?.removeEventListener("abort", abortFromCaller);
    }
  }

  private validateConfig(): void {
    if (this.options.baseUrl.trim().length === 0) {
      throw new Error("OpenAI-compatible ASR needs a Base URL before transcribing.");
    }
    if (this.options.apiKey.trim().length === 0) {
      throw new Error("OpenAI-compatible ASR needs an API key before transcribing.");
    }
    if (this.options.model.trim().length === 0) {
      throw new Error("OpenAI-compatible ASR needs an ASR model before transcribing.");
    }
  }
}

function trimTrailingSlash(value: string): string {
  return value.trim().replace(/\/+$/g, "");
}
