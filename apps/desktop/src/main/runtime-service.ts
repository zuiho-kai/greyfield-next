import {
  GreyfieldRuntime,
  InMemorySessionStore,
  OpenAICompatibleASRProvider,
  OpenAICompatibleLLMProvider,
  OpenAICompatibleTTSProvider,
  type ASRProvider,
  type CharacterPersona,
  type LLMProvider,
  type MemoryStore,
  type SessionStore,
  type SummarySegment,
  type SummarySegmentStore,
  type RuntimeEventHandler,
  type RuntimeInputEvent,
  type TTSProvider,
  type ChatMessage
} from "@greyfield/core-runtime";
import { createDefaultInteractionProfile, FakeStageDriver } from "@greyfield/stage-live2d";
import type { GreyfieldConfig } from "@greyfield/persistence/config-schema";

export interface RuntimeServiceOptions {
  fetch?: typeof fetch;
  loadPersona?: (config: GreyfieldConfig) => Promise<CharacterPersona>;
  memoryStore?: MemoryStore;
  sessionStore?: SessionStore;
  summarySegmentStore?: SummarySegmentStore;
  threadId?: string;
  recentTurnLimit?: number;
  recallMaxItems?: number;
  recallMaxCharacters?: number;
  summaryBatchTurnLimit?: number;
  summaryMinTurns?: number;
  llmTimeoutMs?: number;
  asrTimeoutMs?: number;
  ttsTimeoutMs?: number;
}

export interface LLMTestResult {
  ok: boolean;
  message: string;
  firstToken?: string;
}

export interface VoiceTestResult {
  ok: boolean;
  message: string;
  text?: string;
  data?: Uint8Array;
}

export class RuntimeService {
  private config: GreyfieldConfig;
  private readonly stage = new FakeStageDriver();
  private readonly memoryStore: MemoryStore;
  private readonly sessionStore: SessionStore;
  private readonly summarySegmentStore: SummarySegmentStore | undefined;
  private readonly interactionProfile = createDefaultInteractionProfile();
  private readonly threadId: string;
  private activeRuntime: GreyfieldRuntime | undefined;
  private testingLLM = false;
  private testingVoice = false;

  constructor(config: GreyfieldConfig, private readonly options: RuntimeServiceOptions = {}) {
    this.config = config;
    this.memoryStore = options.memoryStore ?? new MainFakeMemoryStore();
    this.sessionStore = options.sessionStore ?? new InMemorySessionStore("desktop-main-session");
    this.summarySegmentStore = options.summarySegmentStore;
    this.threadId = options.threadId ?? "local-desktop-thread";
  }

  updateConfig(config: GreyfieldConfig): void {
    this.config = config;
  }

  async handle(input: RuntimeInputEvent, emit: RuntimeEventHandler): Promise<void> {
    if (input.type === "runtime.interrupt" && this.activeRuntime) {
      const runtime = this.activeRuntime;
      try {
        await runtime.handle(input, emit);
      } finally {
        if (this.activeRuntime === runtime) {
          this.activeRuntime = undefined;
        }
      }
      return;
    }

    if (input.type === "text.input" && this.activeRuntime) {
      await this.activeRuntime.handle({ type: "runtime.interrupt" }, emit);
    }

    if (input.type === "audio.chunk" && this.activeRuntime) {
      await this.activeRuntime.handle(input, emit);
      return;
    }

    if (input.type === "audio.end" && this.activeRuntime) {
      const runtime = this.activeRuntime;
      try {
        await runtime.handle(input, emit);
      } finally {
        if (this.activeRuntime === runtime) {
          this.activeRuntime = undefined;
        }
      }
      return;
    }

    const runtime = await this.createRuntime();
    if (input.type === "text.input" || input.type === "audio.chunk") {
      this.activeRuntime = runtime;
    }
    try {
      await runtime.handle(input, emit);
    } finally {
      if (this.activeRuntime === runtime && input.type !== "audio.chunk") {
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

  async getMemoryDebugSnapshot(limit = 20): Promise<{
    threadId: string;
    sessionId: string;
    recentTurns: Awaited<ReturnType<SessionStore["getRecent"]>>;
    summarySegments: SummarySegment[];
  }> {
    return {
      threadId: this.threadId,
      sessionId: this.sessionStore.sessionId,
      recentTurns: await this.sessionStore.getRecent(limit),
      summarySegments: (await this.summarySegmentStore?.list(this.threadId)) ?? []
    };
  }

  async testLLM(): Promise<LLMTestResult> {
    if (this.activeRuntime) {
      return {
        ok: false,
        message: "LLM test is unavailable while a chat response is running."
      };
    }
    if (this.testingLLM) {
      return {
        ok: false,
        message: "LLM test is already running."
      };
    }
    const providerConfigError = this.validateOpenAICompatibleProviderConfig("testing");
    if (providerConfigError) {
      return { ok: false, message: providerConfigError };
    }

    this.testingLLM = true;
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
    } finally {
      this.testingLLM = false;
    }
  }

  async testVoice(): Promise<VoiceTestResult> {
    if (this.activeRuntime) {
      return {
        ok: false,
        message: "Voice test is unavailable while a chat response is running."
      };
    }
    if (this.testingVoice) {
      return {
        ok: false,
        message: "Voice test is already running."
      };
    }
    const providerConfigError = this.validateTTSProviderConfig();
    if (providerConfigError) {
      return { ok: false, message: providerConfigError };
    }

    this.testingVoice = true;
    const text = "你好，这是 Greyfield 的语音测试。";
    try {
      const data = await this.createTTSProvider().synthesize(text, this.config.voice.id);
      return {
        ok: true,
        message: "Voice test succeeded.",
        text,
        data
      };
    } catch (error) {
      return {
        ok: false,
        message: error instanceof Error ? error.message : String(error)
      };
    } finally {
      this.testingVoice = false;
    }
  }

  private async createRuntime(): Promise<GreyfieldRuntime> {
    const persona = await this.loadPersona();
    return new GreyfieldRuntime({
      llm: this.createLLMProvider(),
      asr: this.createASRProvider(),
      tts: this.createTTSProvider(),
      memoryStore: this.memoryStore,
      summarySegmentStore: this.summarySegmentStore,
      sessionStore: this.sessionStore,
      persona,
      voice: this.config.voice.id,
      stage: this.stage,
      threadId: this.threadId,
      recentTurnLimit: this.options.recentTurnLimit,
      recallMaxItems: this.options.recallMaxItems,
      recallMaxCharacters: this.options.recallMaxCharacters,
      summaryBatchTurnLimit: this.options.summaryBatchTurnLimit,
      summaryMinTurns: this.options.summaryMinTurns,
      ttsEnabled: this.config.voice.speechEnabled
    });
  }

  private async loadPersona(): Promise<CharacterPersona> {
    return this.options.loadPersona?.(this.config) ?? this.createDefaultPersona();
  }

  private createDefaultPersona(): CharacterPersona {
    return {
      name: "Greyfield",
      tone: "warm, concise, slightly playful",
      boundaries: ["V1 cannot control the desktop", "V1 cannot browse the web on its own"],
      expressionMap: Object.fromEntries(
        Object.entries(this.interactionProfile.emotionReactions).map(([status, reaction]) => [
          status,
          reaction.expression ?? "default"
        ])
      )
    };
  }

  private createLLMProvider(): LLMProvider {
    if (this.config.provider.llm === "openai-compatible") {
      const providerConfigError = this.validateOpenAICompatibleProviderConfig("chatting");
      if (providerConfigError) {
        throw new Error(providerConfigError);
      }
      return new OpenAICompatibleLLMProvider({
        baseUrl: this.config.provider.baseUrl,
        apiKey: this.config.provider.apiKey,
        model: this.config.provider.model,
        fetch: this.options.fetch,
        timeoutMs: this.options.llmTimeoutMs
      });
    }
    return new MainFakeLLMProvider();
  }

  private createASRProvider(): ASRProvider {
    if (this.config.provider.asr === "openai-compatible") {
      const providerConfigError = this.validateASRProviderConfig("transcribing");
      if (providerConfigError) {
        throw new Error(providerConfigError);
      }
      return new OpenAICompatibleASRProvider({
        baseUrl: this.config.provider.baseUrl,
        apiKey: this.config.provider.apiKey,
        model: this.config.provider.asrModel,
        fetch: this.options.fetch,
        timeoutMs: this.options.asrTimeoutMs
      });
    }
    return new MainFakeASRProvider();
  }

  private createTTSProvider(): TTSProvider {
    if (this.config.provider.tts === "openai-compatible") {
      return new OpenAICompatibleTTSProvider({
        baseUrl: this.config.provider.baseUrl,
        apiKey: this.config.provider.apiKey,
        model: this.config.provider.ttsModel,
        fetch: this.options.fetch,
        timeoutMs: this.options.ttsTimeoutMs
      });
    }
    return new MainFakeTTSProvider();
  }

  private validateOpenAICompatibleProviderConfig(action: "testing" | "chatting"): string {
    if (this.config.provider.llm !== "openai-compatible") {
      return "";
    }
    if (this.config.provider.baseUrl.trim().length === 0) {
      return `OpenAI-compatible provider needs a Base URL before ${action}.`;
    }
    if (this.config.provider.apiKey.trim().length === 0) {
      return `OpenAI-compatible provider needs an API key before ${action}.`;
    }
    if (this.config.provider.model.trim().length === 0) {
      return `OpenAI-compatible provider needs a model before ${action}.`;
    }
    return "";
  }

  private validateTTSProviderConfig(): string {
    if (this.config.provider.tts !== "openai-compatible") {
      return "";
    }
    if (this.config.provider.baseUrl.trim().length === 0) {
      return "OpenAI-compatible TTS needs a Base URL before testing voice.";
    }
    if (this.config.provider.apiKey.trim().length === 0) {
      return "OpenAI-compatible TTS needs an API key before testing voice.";
    }
    if (this.config.provider.ttsModel.trim().length === 0) {
      return "OpenAI-compatible TTS needs a TTS model before testing voice.";
    }
    if (this.config.voice.id.trim().length === 0) {
      return "OpenAI-compatible TTS needs a voice before testing voice.";
    }
    return "";
  }

  private validateASRProviderConfig(action: "transcribing"): string {
    if (this.config.provider.asr !== "openai-compatible") {
      return "";
    }
    if (this.config.provider.baseUrl.trim().length === 0) {
      return `OpenAI-compatible ASR needs a Base URL before ${action}.`;
    }
    if (this.config.provider.apiKey.trim().length === 0) {
      return `OpenAI-compatible ASR needs an API key before ${action}.`;
    }
    if (this.config.provider.asrModel.trim().length === 0) {
      return `OpenAI-compatible ASR needs an ASR model before ${action}.`;
    }
    return "";
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

class MainFakeASRProvider implements ASRProvider {
  async transcribe(audio: Uint8Array): Promise<string> {
    if (audio.length === 0) {
      return "";
    }
    return "这是麦克风语音输入。";
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
