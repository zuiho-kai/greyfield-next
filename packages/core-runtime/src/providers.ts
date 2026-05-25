export type MessageRole = "system" | "user" | "assistant" | "tool";

export interface ChatMessage {
  role: MessageRole;
  content: string;
}

export interface ToolDefinition {
  name: string;
  description?: string;
  parameters?: unknown;
}

export interface LLMStreamOptions {
  signal?: AbortSignal;
}

export interface LLMProvider {
  stream(messages: ChatMessage[], tools?: ToolDefinition[], options?: LLMStreamOptions): AsyncIterable<string>;
}

export interface ASRProvider {
  transcribe(audio: Uint8Array): Promise<string>;
}

export interface TTSProvider {
  synthesize(text: string, voice: string): Promise<Uint8Array>;
}

export interface MemoryStore {
  load(): Promise<string>;
  save(memory: string): Promise<void>;
  consolidate(messages: ChatMessage[]): Promise<string>;
}
