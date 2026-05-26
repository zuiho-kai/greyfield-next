import {
  GreyfieldRuntime,
  InMemorySessionStore,
  OpenAICompatibleLLMProvider,
  type LLMProvider,
  type MemoryStore,
  type RuntimeEventHandler,
  type RuntimeInputEvent,
  type TTSProvider,
  type ChatMessage
} from "@greyfield/core-runtime";
import { createDefaultInteractionProfile, FakeStageDriver } from "@greyfield/stage-live2d";
import type { GreyfieldConfig } from "@greyfield/persistence/config-schema";

export interface RuntimeServiceOptions {
  fetch?: typeof fetch;
}

export interface LLMTestResult {
  ok: boolean;
  message: string;
  firstToken?: string;
}

export class RuntimeService {
  private config: GreyfieldConfig;
  private readonly stage = new FakeStageDriver();
  private readonly memoryStore = new MainFakeMemoryStore();
  private readonly sessionStore = new InMemorySessionStore("desktop-main-session");
  private readonly interactionProfile = createDefaultInteractionProfile();
  private activeRuntime: GreyfieldRuntime | undefined;

  constructor(config: GreyfieldConfig, private readonly options: RuntimeServiceOptions = {}) {
    this.config = config;
  }

  updateConfig(config: GreyfieldConfig): void {
    this.config = config;
  }

  async handle(input: RuntimeInputEvent, emit: RuntimeEventHandler): Promise<void> {
    if (input.type === "runtime.interrupt" && this.activeRuntime) {
      await this.activeRuntime.handle(input, emit);
      return;
    }

    if (input.type === "text.input" && this.activeRuntime) {
      await this.activeRuntime.handle({ type: "runtime.interrupt" }, emit);
    }

    const runtime = this.createRuntime();
    if (input.type === "text.input") {
      this.activeRuntime = runtime;
    }
    try {
      await runtime.handle(input, emit);
    } finally {
      if (this.activeRuntime === runtime) {
        this.activeRuntime = undefined;
      }
    }
  }

  async getRecentTurns(limit: number): Promise<Array<{ role: "user" | "assistant"; content: string }>> {
    const turns = await this.sessionStore.getRecent(limit);
    return turns.flatMap((turn) =>
      turn.role === "user" || turn.role === "assistant" ? [{ role: turn.role, content: turn.content }] : []
    );
  }

  async testLLM(): Promise<LLMTestResult> {
    if (this.config.provider.llm === "openai-compatible" && this.config.provider.apiKey.trim().length === 0) {
      return {
        ok: false,
        message: "OpenAI-compatible provider needs an API key before testing."
      };
    }

    try {
      const provider = this.createLLMProvider();
      const messages: ChatMessage[] = [
        { role: "system", content: "You are testing connectivity. Reply with one short token." },
        { role: "user", content: "ping" }
      ];
      for await (const chunk of provider.stream(messages)) {
        const firstToken = chunk.trim();
        if (firstToken.length > 0) {
          return {
            ok: true,
            message: `LLM test succeeded: ${firstToken}`,
            firstToken
          };
        }
      }
      return {
        ok: false,
        message: "LLM test finished without receiving a token."
      };
    } catch (error) {
      return {
        ok: false,
        message: error instanceof Error ? error.message : String(error)
      };
    }
  }

  private createRuntime(): GreyfieldRuntime {
    return new GreyfieldRuntime({
      llm: this.createLLMProvider(),
      tts: new MainFakeTTSProvider(),
      memoryStore: this.memoryStore,
      sessionStore: this.sessionStore,
      persona: {
        name: "Greyfield",
        tone: "warm, concise, slightly playful",
        boundaries: ["V1 cannot control the desktop", "V1 cannot browse the web on its own"],
        expressionMap: Object.fromEntries(
          Object.entries(this.interactionProfile.emotionReactions).map(([status, reaction]) => [
            status,
            reaction.expression ?? "default"
          ])
        )
      },
      voice: this.config.voice.id,
      stage: this.stage
    });
  }

  private createLLMProvider(): LLMProvider {
    if (this.config.provider.llm === "openai-compatible" && this.config.provider.apiKey.trim().length > 0) {
      return new OpenAICompatibleLLMProvider({
        baseUrl: this.config.provider.baseUrl,
        apiKey: this.config.provider.apiKey,
        model: this.config.provider.model,
        fetch: this.options.fetch
      });
    }
    return new MainFakeLLMProvider();
  }
}

class MainFakeLLMProvider implements LLMProvider {
  async *stream(): AsyncIterable<string> {
    yield "你好，我醒着。";
    yield "现在可以继续做桌宠了。";
  }
}

class MainFakeTTSProvider implements TTSProvider {
  async synthesize(text: string): Promise<Uint8Array> {
    return new TextEncoder().encode(`fake-audio:${text}`);
  }
}

class MainFakeMemoryStore implements MemoryStore {
  async load(): Promise<string> {
    return "- Greyfield Next desktop runtime is using local fake providers.";
  }

  async save(): Promise<void> {
    return undefined;
  }

  async consolidate(): Promise<string> {
    return "- Greyfield Next desktop runtime is using local fake providers.";
  }
}
