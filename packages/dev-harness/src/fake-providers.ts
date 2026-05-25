import type { LLMProvider, MemoryStore, TTSProvider } from "@greyfield/core-runtime";

export class FakeLLMProvider implements LLMProvider {
  constructor(private readonly chunks = ["你好，我醒着。", " 现在可以继续做桌宠了。"]) {}

  async *stream(): AsyncIterable<string> {
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
