export type MessageRole = "system" | "user" | "assistant" | "tool";

export type ChatMessageContent = string | ChatContentPart[];

export type ChatContentPart =
  | { type: "text"; text: string }
  | { type: "image_url"; image_url: { url: string; detail?: "low" | "high" | "auto" } };

export interface ChatMessage {
  role: MessageRole;
  content: ChatMessageContent;
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
  readonly supportsVision?: boolean;
  stream(messages: ChatMessage[], tools?: ToolDefinition[], options?: LLMStreamOptions): AsyncIterable<string>;
}

export interface ASRTranscribeOptions {
  signal?: AbortSignal;
}

export interface ASRProvider {
  transcribe(audio: Uint8Array, options?: ASRTranscribeOptions): Promise<string>;
}

export interface TTSStreamOptions {
  signal?: AbortSignal;
}

export interface TTSProvider {
  synthesize(text: string, voice: string, options?: TTSStreamOptions): Promise<Uint8Array>;
}

export interface MemoryStore {
  load(): Promise<string>;
  save(memory: string): Promise<void>;
  consolidate(messages: ChatMessage[]): Promise<string>;
}
