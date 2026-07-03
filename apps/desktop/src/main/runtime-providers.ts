import {
  OpenAICompatibleASRProvider,
  OpenAICompatibleLLMProvider,
  OpenAICompatibleTTSProvider,
  type ASRProvider,
  type ChatMessage,
  type LLMProvider,
  type TTSProvider
} from "@greyfield/core-runtime";
import type { GreyfieldConfig } from "@greyfield/persistence/config-schema";

export interface RuntimeProviderFactoryOptions {
  fetch?: typeof fetch;
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

export type RuntimeLLMTaskSlot = "chat" | "planner" | "utility" | "memory";

export class RuntimeProviderFactory {
  constructor(private readonly config: GreyfieldConfig, private readonly options: RuntimeProviderFactoryOptions = {}) {}

  createChatLLMProvider(): LLMProvider {
    return this.createTaskLLMProvider("chat");
  }

  createTaskLLMProvider(slot: RuntimeLLMTaskSlot): LLMProvider {
    if (this.config.provider.llm === "openai-compatible") {
      const providerConfigError =
        slot === "chat"
          ? this.validateOpenAICompatibleProviderConfig("chatting")
          : this.validateOpenAICompatibleTaskModelConfig(slot, "chatting");
      if (providerConfigError) {
        throw new Error(providerConfigError);
      }
      return new OpenAICompatibleLLMProvider({
        baseUrl: this.config.provider.baseUrl,
        apiKey: this.config.provider.apiKey,
        model: this.resolveTaskModel(slot),
        fetch: this.options.fetch,
        timeoutMs: this.options.llmTimeoutMs
      });
    }
    return new MainFakeLLMProvider();
  }

  createVisionLLMProvider(): LLMProvider | undefined {
    const model = this.resolveVisualTaskModel();
    if (model.length === 0) {
      return undefined;
    }
    if (this.config.provider.llm === "openai-compatible") {
      const providerConfigError = this.validateOpenAICompatibleVisionProviderConfig("chatting with screen awareness");
      if (providerConfigError) {
        return undefined;
      }
      return new OpenAICompatibleLLMProvider({
        baseUrl: this.config.provider.baseUrl,
        apiKey: this.config.provider.apiKey,
        model,
        supportsVision: true,
        fetch: this.options.fetch,
        timeoutMs: this.options.llmTimeoutMs
      });
    }
    return new MainFakeVisionLLMProvider();
  }

  createASRProvider(): ASRProvider {
    if (this.config.provider.asr === "openai-compatible") {
      const providerConfigError = this.validateASRProviderConfig("transcribing");
      if (providerConfigError) {
        throw new Error(providerConfigError);
      }
      return new OpenAICompatibleASRProvider({
        baseUrl: this.config.provider.baseUrl,
        apiKey: this.config.provider.apiKey,
        model: this.resolveTaskModel("voiceAsr"),
        fetch: this.options.fetch,
        timeoutMs: this.options.asrTimeoutMs
      });
    }
    return new MainFakeASRProvider();
  }

  createTTSProvider(): TTSProvider {
    if (this.config.provider.tts === "openai-compatible") {
      return new OpenAICompatibleTTSProvider({
        baseUrl: this.config.provider.baseUrl,
        apiKey: this.config.provider.apiKey,
        model: this.resolveTaskModel("voiceTts"),
        fetch: this.options.fetch,
        timeoutMs: this.options.ttsTimeoutMs
      });
    }
    return new MainFakeTTSProvider();
  }

  validateOpenAICompatibleProviderConfig(action: "testing" | "chatting"): string {
    if (this.config.provider.llm !== "openai-compatible") {
      return "";
    }
    if (this.config.provider.baseUrl.trim().length === 0) {
      return `OpenAI-compatible provider needs a Base URL before ${action}.`;
    }
    if (this.config.provider.apiKey.trim().length === 0) {
      return `OpenAI-compatible provider needs an API key before ${action}.`;
    }
    if (this.resolveTaskModel("chat").length === 0) {
      return `OpenAI-compatible provider needs a model before ${action}.`;
    }
    return "";
  }

  validateOpenAICompatibleVisionProviderConfig(action: "chatting with screen awareness"): string {
    if (this.config.provider.llm !== "openai-compatible") {
      return "";
    }
    if (this.config.provider.baseUrl.trim().length === 0) {
      return `OpenAI-compatible Vision model needs a Base URL before ${action}.`;
    }
    if (this.config.provider.apiKey.trim().length === 0) {
      return `OpenAI-compatible Vision model needs an API key before ${action}.`;
    }
    if (this.resolveVisualTaskModel().length === 0) {
      return `OpenAI-compatible Vision model needs a model before ${action}.`;
    }
    return "";
  }

  validateOpenAICompatibleTaskModelConfig(
    slot: Exclude<RuntimeLLMTaskSlot, "chat">,
    action: "chatting" | "memory extraction"
  ): string {
    if (this.config.provider.llm !== "openai-compatible") {
      return "";
    }
    if (this.config.provider.baseUrl.trim().length === 0) {
      return `OpenAI-compatible ${slot} model needs a Base URL before ${action}.`;
    }
    if (this.config.provider.apiKey.trim().length === 0) {
      return `OpenAI-compatible ${slot} model needs an API key before ${action}.`;
    }
    if (this.resolveTaskModel(slot).length === 0) {
      return `OpenAI-compatible ${slot} model needs a model before ${action}.`;
    }
    return "";
  }

  validateTTSProviderConfig(): string {
    if (this.config.provider.tts !== "openai-compatible") {
      return "";
    }
    if (this.config.provider.baseUrl.trim().length === 0) {
      return "OpenAI-compatible TTS needs a Base URL before testing voice.";
    }
    if (this.config.provider.apiKey.trim().length === 0) {
      return "OpenAI-compatible TTS needs an API key before testing voice.";
    }
    if (this.resolveTaskModel("voiceTts").length === 0) {
      return "OpenAI-compatible TTS needs a TTS model before testing voice.";
    }
    if (this.config.voice.id.trim().length === 0) {
      return "OpenAI-compatible TTS needs a voice before testing voice.";
    }
    return "";
  }

  validateASRProviderConfig(action: "transcribing"): string {
    if (this.config.provider.asr !== "openai-compatible") {
      return "";
    }
    if (this.config.provider.baseUrl.trim().length === 0) {
      return `OpenAI-compatible ASR needs a Base URL before ${action}.`;
    }
    if (this.config.provider.apiKey.trim().length === 0) {
      return `OpenAI-compatible ASR needs an API key before ${action}.`;
    }
    if (this.resolveTaskModel("voiceAsr").length === 0) {
      return `OpenAI-compatible ASR needs an ASR model before ${action}.`;
    }
    return "";
  }

  resolveVisualTaskModel(): string {
    return this.resolveTaskModel("vision") || this.resolveTaskModel("multimodal");
  }

  private resolveTaskModel(slot: keyof GreyfieldConfig["provider"]["taskModels"]): string {
    return this.config.provider.taskModels[slot].trim();
  }
}

export async function testLLMProviderConnectivity(provider: LLMProvider): Promise<LLMTestResult> {
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
}

export async function testVoiceProviderConnectivity(provider: TTSProvider, voiceId: string): Promise<VoiceTestResult> {
  const text = "你好，这是 Greyfield 的语音测试。";
  const data = await provider.synthesize(text, voiceId);
  return {
    ok: true,
    message: "Voice test succeeded.",
    text,
    data
  };
}

class MainFakeLLMProvider implements LLMProvider {
  async *stream(): AsyncIterable<string> {
    yield "你好，我醒着。";
    yield "现在可以继续做桌宠了。";
  }
}

class MainFakeVisionLLMProvider implements LLMProvider {
  readonly supportsVision = true;

  async *stream(messages: ChatMessage[]): AsyncIterable<string> {
    const systemText = typeof messages[0]?.content === "string" ? messages[0].content : "";
    const last = messages.at(-1);
    const attachmentCount = Array.isArray(last?.content)
      ? last.content.filter((part) => part.type === "image_url").length
      : 0;
    if (systemText.includes("Screen awareness is enabled") && attachmentCount > 0) {
      yield "我看到桌面上有新的画面，可以陪你一起看。";
      return;
    }
    if (attachmentCount > 0) {
      yield "我看到了最近的桌面画面。";
      yield "可以继续问我画面里的细节。";
      return;
    }
    yield "我现在没有新的画面可看。";
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
