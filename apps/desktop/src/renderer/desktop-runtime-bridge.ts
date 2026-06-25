import { defaultGreyfieldConfig, type GreyfieldConfig } from "@greyfield/persistence/config-schema";
import type { SpeechOutput } from "@greyfield/audio-runtime";
import type { DesktopIpcEventChannel, DesktopIpcEventMap, DesktopIpcRequestChannel, DesktopIpcRequestMap } from "../shared/ipc";
import { isMaskedApiKey } from "../shared/secrets";
import { createDefaultInteractionProfile } from "@greyfield/stage-live2d";
import { createRendererPreviewRuntimeEvents } from "./preview-runtime-events";
import { reduceRuntimeEvent } from "./runtime-event-reducer";
import { configFromSettings, settingsFromConfig, settingsPatchToConfigPatch } from "./settings-state-mapper";

export interface DesktopMessage {
  role: "user" | "assistant";
  text: string;
}

export interface DesktopRendererState {
  status: string;
  errorMessage: string;
  voiceErrorMessage: string;
  providerTest: {
    status: "idle" | "testing" | "success" | "error";
    message: string;
    firstToken?: string;
  };
  inputDraft: string;
  messages: DesktopMessage[];
  assistantDraft: string;
  audioQueue: string[];
  settings: DesktopSettingsState;
  window: {
    modelPassThrough: boolean;
    locked: boolean;
  };
  stage: {
    mouthOpen: number;
    expression?: string;
    motion?: {
      group: string;
      index?: number;
    };
  };
}

export interface DesktopSettingsState {
  providerLLM: string;
  providerBaseUrl: string;
  providerApiKey: string;
  providerHasApiKey: boolean;
  providerModel: string;
  providerTTS: string;
  providerTTSModel: string;
  voiceId: string;
  voiceVolume: number;
  voiceSpeechEnabled: boolean;
  microphoneId: string;
  characterFile: string;
  modelPath: string;
  modelScale: number;
  modelX: number;
  modelY: number;
  speechBubbleEnabled: boolean;
}

export type DesktopSettingsPatch = Partial<DesktopSettingsState>;
export type DesktopStateChangeHandler = (state: DesktopRendererState) => void;

export interface DesktopHostApi {
  send<Channel extends DesktopIpcRequestChannel>(channel: Channel, payload: DesktopIpcRequestMap[Channel]): void;
  on<Channel extends DesktopIpcEventChannel>(
    channel: Channel,
    handler: (payload: DesktopIpcEventMap[Channel]) => void
  ): () => void;
}

export interface WindowStatePatch {
  modelPassThrough?: boolean;
  locked?: boolean;
}

export class DesktopRuntimeBridge {
  private state: DesktopRendererState = createInitialDesktopRendererState();
  private readonly stateChangeHandlers = new Set<DesktopStateChangeHandler>();
  private readonly interactionProfile = createDefaultInteractionProfile();
  private speechPlaybackEpoch = 0;

  constructor(private readonly host?: DesktopHostApi, private readonly speechOutput?: SpeechOutput) {
    this.host?.on("settings:changed", (config) => {
      const settings = settingsFromConfig(config);
      if (isMaskedApiKey(config.provider.apiKey) && this.state.settings.providerApiKey.length > 0) {
        settings.providerApiKey = this.state.settings.providerApiKey;
      } else if (config.provider.apiKey.length === 0 && this.state.settings.providerApiKey.length > 0) {
        settings.providerApiKey = this.state.settings.providerApiKey;
      }
      this.state = {
        ...this.state,
        settings,
        window: {
          ...this.state.window,
          modelPassThrough: config.window.modelPassThrough
        }
      };
      this.emitStateChange();
    });
    this.host?.on("window:state", (windowState) => {
      this.state = {
        ...this.state,
        window: {
          ...this.state.window,
          ...windowState
        }
      };
      this.emitStateChange();
    });
    this.host?.on("runtime:event", (event) => {
      this.state = reduceRuntimeEvent(this.state, event, this.interactionProfile);
      if (event.type === "assistant.audio.chunk") {
        this.playSpeech(event.text, event.data);
      }
      if (event.type === "runtime.status" && event.status === "interrupted") {
        this.speechOutput?.cancel();
      }
      this.emitStateChange();
    });
    this.host?.on("runtime:speech-playback", (event) => {
      const removed = this.removeQueuedSpeech(event.text);
      if (event.type === "error" && event.message) {
        this.state = {
          ...this.state,
          voiceErrorMessage: event.message
        };
        this.emitStateChange();
        return;
      }
      if (removed) {
        this.emitStateChange();
      }
    });
    this.host?.on("provider:test-llm-result", (result) => {
      this.state = {
        ...this.state,
        providerTest: {
          status: result.ok ? "success" : "error",
          message: formatProviderTestMessage(result.message, result.ok),
          ...(result.firstToken ? { firstToken: result.firstToken } : {})
        }
      };
      this.emitStateChange();
    });
  }

  onStateChange(handler: DesktopStateChangeHandler): () => void {
    this.stateChangeHandlers.add(handler);
    return () => this.stateChangeHandlers.delete(handler);
  }

  async sendText(text: string): Promise<DesktopRendererState> {
    const trimmed = text.trim();
    if (trimmed.length === 0) {
      return this.getState();
    }

    this.state = {
      ...this.state,
      status: "thinking",
      errorMessage: "",
      voiceErrorMessage: "",
      inputDraft: "",
      assistantDraft: "",
      messages: [...this.state.messages, { role: "user", text: trimmed }]
    };

    if (this.host) {
      this.host.send("runtime:input", { type: "text.input", text: trimmed });
      return this.getState();
    }

    for (const event of createRendererPreviewRuntimeEvents()) {
      this.state = reduceRuntimeEvent(this.state, event, this.interactionProfile);
    }

    return this.getState();
  }

  async interrupt(): Promise<DesktopRendererState> {
    this.speechPlaybackEpoch += 1;
    this.speechOutput?.cancel();
    if (this.host) {
      this.host.send("runtime:input", { type: "runtime.interrupt" });
      this.state = {
        ...this.state,
        status: "interrupted",
        errorMessage: "",
        voiceErrorMessage: "",
        assistantDraft: "",
        audioQueue: [],
        stage: {
          ...this.state.stage,
          mouthOpen: 0
        }
      };
      return this.getState();
    }

    this.state = {
      ...this.state,
      status: "interrupted",
      errorMessage: "",
      voiceErrorMessage: "",
      assistantDraft: "",
      audioQueue: [],
      stage: {
        ...this.state.stage,
        mouthOpen: 0
      }
    };

    return this.getState();
  }

  setWindowState(patch: WindowStatePatch): DesktopRendererState {
    this.state = {
      ...this.state,
      window: {
        ...this.state.window,
        ...patch
      }
    };
    return this.getState();
  }

  updateSettings(patch: DesktopSettingsPatch): DesktopRendererState {
    this.state = {
      ...this.state,
      settings: {
        ...this.state.settings,
        ...patch,
        ...(patch.providerApiKey !== undefined
          ? {
              providerHasApiKey: isMaskedApiKey(patch.providerApiKey)
                ? this.state.settings.providerHasApiKey
                : patch.providerApiKey.length > 0
            }
          : {})
      }
    };
    this.host?.send("settings:update", settingsPatchToConfigPatch(patch));
    return this.getState();
  }

  testLLMProvider(): DesktopRendererState {
    this.state = {
      ...this.state,
      providerTest: {
        status: "testing",
        message: "Testing LLM provider..."
      }
    };
    this.host?.send("provider:test-llm", {});
    if (!this.host) {
      this.state = {
        ...this.state,
        providerTest: {
          status: "success",
          message: "LLM test succeeded: fake-preview",
          firstToken: "fake-preview"
        }
      };
    }
    return this.getState();
  }

  getState(): DesktopRendererState {
    return structuredClone(this.state);
  }

  getConfigSnapshot(): GreyfieldConfig {
    return configFromSettings(this.state.settings);
  }

  private playSpeech(text: string, audio: Uint8Array): void {
    if (!this.speechOutput || !this.state.settings.voiceSpeechEnabled) {
      return;
    }
    const playbackEpoch = this.speechPlaybackEpoch;
    void this.speechOutput
      .speak(text, {
        audio,
        voiceId: this.state.settings.voiceId,
        volume: this.state.settings.voiceVolume
      })
      .then(() => {
        if (this.completeSpeechPlayback(text, playbackEpoch)) {
          this.host?.send("runtime:speech-playback", { type: "finished", text });
        }
      })
      .catch((error) => {
        if (playbackEpoch !== this.speechPlaybackEpoch || this.state.status === "interrupted") {
          return;
        }
        this.completeSpeechPlayback(text, playbackEpoch);
        const message = `Voice playback failed: ${error instanceof Error ? error.message : String(error)}`;
        this.host?.send("runtime:speech-playback", { type: "error", text, message });
        this.state = {
          ...this.state,
          voiceErrorMessage: message
        };
        this.emitStateChange();
      });
  }

  private completeSpeechPlayback(text: string, playbackEpoch: number): boolean {
    if (playbackEpoch !== this.speechPlaybackEpoch) {
      return false;
    }
    const removed = this.removeQueuedSpeech(text);
    if (removed) {
      this.emitStateChange();
    }
    return removed;
  }

  private removeQueuedSpeech(text: string): boolean {
    const index = this.state.audioQueue.indexOf(text);
    if (index < 0) {
      return false;
    }
    this.state = {
      ...this.state,
      audioQueue: [...this.state.audioQueue.slice(0, index), ...this.state.audioQueue.slice(index + 1)]
    };
    return true;
  }

  private emitStateChange(): void {
    const snapshot = this.getState();
    for (const handler of this.stateChangeHandlers) {
      handler(snapshot);
    }
  }
}

function formatProviderTestMessage(message: string, ok: boolean): string {
  if (ok) {
    return message;
  }
  if (isActiveChatTestRejection(message)) {
    return `${message} Stop the current reply or wait for it to finish, then retry.`;
  }
  if (!isProviderConfigurationFailure(message)) {
    return message;
  }
  return `${message.replace(/[.。]+$/g, "")}. Check API key, Base URL, and Model, then retry.`;
}

function isActiveChatTestRejection(message: string): boolean {
  return message.includes("LLM test is unavailable while a chat response is running.");
}

function isProviderConfigurationFailure(message: string): boolean {
  return (
    message.includes("OpenAI-compatible provider needs a Base URL before testing.") ||
    message.includes("OpenAI-compatible provider needs an API key") ||
    message.includes("OpenAI-compatible provider needs a model before testing.") ||
    message.includes("OpenAI-compatible LLM request failed:") ||
    message.includes("OpenAI-compatible LLM request timed out") ||
    message.includes("OpenAI-compatible LLM stream returned malformed SSE data")
  );
}

export function createDesktopRuntimeBridge(host?: DesktopHostApi): DesktopRuntimeBridge {
  return new DesktopRuntimeBridge(host);
}

export function createDesktopRuntimeBridgeWithSpeech(host: DesktopHostApi | undefined, speechOutput: SpeechOutput | undefined): DesktopRuntimeBridge {
  return new DesktopRuntimeBridge(host, speechOutput);
}

export function createInitialDesktopRendererState(): DesktopRendererState {
  return {
    status: "idle",
    errorMessage: "",
    voiceErrorMessage: "",
    providerTest: {
      status: "idle",
      message: ""
    },
    inputDraft: "",
    messages: [],
    assistantDraft: "",
    audioQueue: [],
    settings: {
      providerLLM: defaultGreyfieldConfig.provider.llm,
      providerBaseUrl: defaultGreyfieldConfig.provider.baseUrl,
      providerApiKey: defaultGreyfieldConfig.provider.apiKey,
      providerHasApiKey: defaultGreyfieldConfig.provider.apiKey.length > 0,
      providerModel: defaultGreyfieldConfig.provider.model,
      providerTTS: defaultGreyfieldConfig.provider.tts,
      providerTTSModel: defaultGreyfieldConfig.provider.ttsModel,
      voiceId: defaultGreyfieldConfig.voice.id,
      voiceVolume: defaultGreyfieldConfig.voice.volume,
      voiceSpeechEnabled: defaultGreyfieldConfig.voice.speechEnabled,
      microphoneId: defaultGreyfieldConfig.audio.microphoneId,
      characterFile: defaultGreyfieldConfig.characterFile,
      modelPath: defaultGreyfieldConfig.live2d.modelPath,
      modelScale: defaultGreyfieldConfig.live2d.scale,
      modelX: defaultGreyfieldConfig.live2d.x,
      modelY: defaultGreyfieldConfig.live2d.y,
      speechBubbleEnabled: defaultGreyfieldConfig.ui.speechBubbleEnabled
    },
    window: {
      modelPassThrough: defaultGreyfieldConfig.window.modelPassThrough,
      locked: false
    },
    stage: {
      mouthOpen: 0
    }
  };
}
