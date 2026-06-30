import type { ASRProvider, LLMProvider, MemoryStore, TTSProvider } from "@greyfield/core-runtime";

export class FakeLLMProvider implements LLMProvider {
  readonly supportsVision = true;
  readonly visionAttachmentCounts: number[] = [];

  constructor(private readonly chunks = ["你好，我醒着。", " 现在可以继续做桌宠了。"]) {}

  async *stream(messages: Parameters<LLMProvider["stream"]>[0]): AsyncIterable<string> {
    const last = messages.at(-1);
    const imageCount = Array.isArray(last?.content)
      ? last.content.filter((part) => part.type === "image_url").length
      : 0;
    this.visionAttachmentCounts.push(imageCount);
    if (imageCount > 0) {
      yield `Fake vision saw ${imageCount} temporary frame${imageCount === 1 ? "" : "s"}.`;
      return;
    }
    for (const chunk of this.chunks) {
      yield chunk;
    }
  }
}

export class FakeTTSProvider implements TTSProvider {
  readonly synthesized: string[] = [];

  async synthesize(text: string): Promise<Uint8Array> {
    this.synthesized.push(text);
    return new TextEncoder().encode(`audio:${text}`);
  }
}

export class FakeASRProvider implements ASRProvider {
  readonly transcribed: number[] = [];

  async transcribe(audio: Uint8Array): Promise<string> {
    this.transcribed.push(audio.length);
    return "这是麦克风语音输入。";
  }
}

export class FakeMemoryStore implements MemoryStore {
  private memory = "- Fake harness memory is available.";

  async load(): Promise<string> {
    return this.memory;
  }

  async save(memory: string): Promise<void> {
    this.memory = memory;
  }

  async consolidate(): Promise<string> {
    return this.memory;
  }
}
