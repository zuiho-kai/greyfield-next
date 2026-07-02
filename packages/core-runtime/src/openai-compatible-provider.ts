import type { ChatMessage, LLMProvider, LLMStreamOptions, ToolDefinition } from "./providers";

export interface OpenAICompatibleLLMProviderOptions {
  baseUrl: string;
  apiKey: string;
  model: string;
  supportsVision?: boolean;
  fetch?: typeof fetch;
  timeoutMs?: number;
}

export const DEFAULT_OPENAI_COMPATIBLE_TIMEOUT_MS = 30_000;

interface OpenAICompatibleChunk {
  choices?: Array<{
    delta?: {
      content?: unknown;
    };
  }>;
}

export class OpenAICompatibleLLMProvider implements LLMProvider {
  readonly supportsVision: boolean;
  private readonly fetchImpl: typeof fetch;

  constructor(private readonly options: OpenAICompatibleLLMProviderOptions) {
    this.supportsVision = options.supportsVision === true;
    this.fetchImpl = options.fetch ?? fetch;
  }

  async *stream(messages: ChatMessage[], tools?: ToolDefinition[], options: LLMStreamOptions = {}): AsyncIterable<string> {
    const timeoutMs = this.options.timeoutMs ?? DEFAULT_OPENAI_COMPATIBLE_TIMEOUT_MS;
    const abortHandle = createRequestAbortHandle(options.signal, timeoutMs);
    let reader: ReadableStreamDefaultReader<Uint8Array> | undefined;

    try {
      const response = await this.fetchImpl(`${trimTrailingSlash(this.options.baseUrl)}/chat/completions`, {
        method: "POST",
        signal: abortHandle.signal,
        headers: {
          Authorization: `Bearer ${this.options.apiKey}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          model: this.options.model,
          messages,
          stream: true,
          ...(tools && tools.length > 0 ? { tools } : {})
        })
      });

      if (!response.ok) {
        throw new Error(`OpenAI-compatible LLM request failed: ${response.status} ${response.statusText}`.trim());
      }
      if (!response.body) {
        return;
      }

      const decoder = new TextDecoder();
      reader = response.body.getReader();
      let buffer = "";
      while (true) {
        const { done, value } = await reader.read();
        if (done) {
          break;
        }
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split(/\r?\n/);
        buffer = lines.pop() ?? "";
        for (const line of lines) {
          const text = parseSseLine(line);
          if (text === undefined) {
            continue;
          }
          if (text === "[DONE]") {
            return;
          }
          const content = readDeltaContent(text);
          if (content.length > 0) {
            yield content;
          }
        }
      }
    } catch (error) {
      if (abortHandle.timedOut) {
        throw new Error(`OpenAI-compatible LLM request timed out after ${timeoutMs}ms`);
      }
      if (options.signal?.aborted) {
        return;
      }
      throw error;
    } finally {
      abortHandle.dispose();
      reader?.releaseLock();
    }
  }
}

function parseSseLine(line: string): string | undefined {
  const trimmed = line.trim();
  if (!trimmed.startsWith("data:")) {
    return undefined;
  }
  return trimmed.slice("data:".length).trim();
}

function readDeltaContent(raw: string): string {
  let parsed: OpenAICompatibleChunk;
  try {
    parsed = JSON.parse(raw) as OpenAICompatibleChunk;
  } catch {
    throw new Error("OpenAI-compatible LLM stream returned malformed SSE data");
  }
  const content = parsed.choices?.[0]?.delta?.content;
  return typeof content === "string" ? content : "";
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
      controller.abort(new Error(`OpenAI-compatible LLM request timed out after ${timeoutMs}ms`));
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
