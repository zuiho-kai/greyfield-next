// Embedding API Client - SiliconFlow-compatible

const defaultBaseURL = "https://api.siliconflow.cn/v1";
const defaultModel = "BAAI/bge-m3";
const fallbackDimensions = 1024;

export interface EmbeddingOptions {
  model?: string;
  apiKey?: string;
  baseURL?: string;
  fetch?: typeof fetch;
  allowDeterministicFallback?: boolean;
  timeoutMs?: number;
}

export class EmbeddingService {
  private readonly model: string;
  private readonly apiKey: string | undefined;
  private readonly baseURL: string;
  private readonly fetchImpl: typeof fetch;
  private readonly allowDeterministicFallback: boolean;
  private readonly timeoutMs: number;
  private hasWarnedDeterministicFallback = false;

  constructor(options: EmbeddingOptions = {}) {
    this.model = options.model ?? defaultModel;
    this.apiKey = options.apiKey ?? process.env.SILICONFLOW_API_KEY ?? process.env.GREYFIELD_EMBEDDING_API_KEY;
    this.baseURL = (options.baseURL ?? process.env.SILICONFLOW_BASE_URL ?? defaultBaseURL).replace(/\/$/, "");
    this.fetchImpl = options.fetch ?? fetch;
    this.allowDeterministicFallback = options.allowDeterministicFallback ?? true;
    this.timeoutMs = options.timeoutMs ?? 15_000;
  }

  async embed(text: string): Promise<number[]> {
    if (!this.apiKey) {
      if (this.allowDeterministicFallback) {
        return this.fallbackEmbedding(text);
      }
      throw new Error("Embedding API key is not configured.");
    }

    const response = await this.callEmbeddingsApi(text);

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Embedding API failed (${response.status}): ${errorText}`);
    }

    const data: EmbeddingResponse = await response.json();
    const embedding = data.data?.[0]?.embedding;
    if (!Array.isArray(embedding)) {
      throw new Error("Invalid embedding response format");
    }
    return embedding;
  }

  async embedBatch(texts: string[]): Promise<number[][]> {
    if (!this.apiKey) {
      if (this.allowDeterministicFallback) {
        return texts.map((text) => this.fallbackEmbedding(text));
      }
      throw new Error("Embedding API key is not configured.");
    }

    const response = await this.callEmbeddingsApi(texts);

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Batch embedding API failed (${response.status}): ${errorText}`);
    }

    const data: EmbeddingResponse = await response.json();
    if (!Array.isArray(data.data)) {
      throw new Error("Invalid batch embedding response format");
    }
    return data.data.map((item) => {
      if (!Array.isArray(item.embedding)) {
        throw new Error("Invalid embedding entry in batch response");
      }
      return item.embedding;
    });
  }

  private fallbackEmbedding(text: string): number[] {
    if (!this.hasWarnedDeterministicFallback) {
      console.warn("[Memory] No embedding API key configured; using deterministic fallback embedding.");
      this.hasWarnedDeterministicFallback = true;
    }
    return deterministicEmbedding(text);
  }

  private async callEmbeddingsApi(input: string | string[]): Promise<Response> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      return await this.fetchImpl(`${this.baseURL}/embeddings`, {
        method: "POST",
        signal: controller.signal,
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          model: this.model,
          input
        })
      });
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") {
        throw new Error(`Embedding API timed out after ${this.timeoutMs}ms`);
      }
      throw error;
    } finally {
      clearTimeout(timeout);
    }
  }
}

export async function embed(text: string, options: EmbeddingOptions = {}): Promise<number[]> {
  return new EmbeddingService(options).embed(text);
}

export async function embedBatch(texts: string[], options: EmbeddingOptions = {}): Promise<number[][]> {
  return new EmbeddingService(options).embedBatch(texts);
}

interface EmbeddingResponse {
  data?: Array<{
    embedding: number[];
  }>;
}

export function deterministicEmbedding(text: string): number[] {
  const vector = new Array<number>(fallbackDimensions).fill(0);
  const tokens = text.toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? [text.toLowerCase()];
  for (const token of tokens) {
    const index = stableHash(token) % fallbackDimensions;
    vector[index] += 1;
  }
  const norm = Math.sqrt(vector.reduce((total, value) => total + value * value, 0));
  return norm === 0 ? vector : vector.map((value) => value / norm);
}

export function stableHash(value: string): number {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}
