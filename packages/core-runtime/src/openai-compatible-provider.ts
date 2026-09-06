import type { ChatMessage, LLMProvider, LLMStreamOptions, LLMStreamEvent, ToolCall, ToolDefinition } from "./providers";

export interface OpenAICompatibleLLMProviderOptions {
  baseUrl: string;
  apiKey: string;
  model: string;
  supportsVision?: boolean;
  enableThinking?: boolean;
  fetch?: typeof fetch;
  timeoutMs?: number;
}

export const DEFAULT_OPENAI_COMPATIBLE_TIMEOUT_MS = 30_000;

interface OpenAICompatibleChunk {
  choices?: Array<{
    delta?: {
      content?: unknown;
      tool_calls?: Array<{ index: number; id?: string; function?: { name?: string; arguments?: string } }>;
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
    for await (const event of this.streamEvents(messages, tools, options)) {
      if (event.type === "text") yield event.text;
    }
  }

  async *streamEvents(messages: ChatMessage[], tools?: ToolDefinition[], options: LLMStreamOptions = {}): AsyncIterable<LLMStreamEvent> {
    const timeoutMs = this.options.timeoutMs ?? DEFAULT_OPENAI_COMPATIBLE_TIMEOUT_MS;
    const abortHandle = createRequestAbortHandle(options.signal, timeoutMs);
    let reader: ReadableStreamDefaultReader<Uint8Array> | undefined;
    const calls = new Map<number, ToolCall>();
    const readEvents = (raw: string): LLMStreamEvent[] => {
      let parsed: OpenAICompatibleChunk;
      try { parsed = JSON.parse(raw) as OpenAICompatibleChunk; }
      catch { throw new Error("OpenAI-compatible LLM stream returned malformed SSE data"); }
      const delta = parsed.choices?.[0]?.delta;
      for (const part of delta?.tool_calls ?? []) {
        const call = calls.get(part.index) ?? { id: "", type: "function", function: { name: "", arguments: "" } };
        call.id += part.id ?? "";
        call.function.name += part.function?.name ?? "";
        call.function.arguments += part.function?.arguments ?? "";
        calls.set(part.index, call);
      }
      return typeof delta?.content === "string" && delta.content.length > 0 ? [{ type: "text", text: delta.content }] : [];
    };
    const completedCalls = (): LLMStreamEvent[] => [...calls.entries()].sort(([left], [right]) => left - right).map(([, call]) => {
      if (!call.id || !call.function.name) throw new Error("OpenAI-compatible LLM stream returned an incomplete tool call");
      return { type: "tool_call", call };
    });

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
          ...(this.options.enableThinking === undefined ? {} : { enable_thinking: this.options.enableThinking }),
          ...(tools && tools.length > 0 ? { tools: tools.map((tool) => ({ type: "function", function: tool })) } : {})
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
            yield* completedCalls();
            return;
          }
          yield* readEvents(text);
        }
      }
      const trailing = parseSseLine(buffer + decoder.decode());
      if (trailing && trailing !== "[DONE]") yield* readEvents(trailing);
      yield* completedCalls();
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
      await reader?.cancel().catch(() => {});
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
