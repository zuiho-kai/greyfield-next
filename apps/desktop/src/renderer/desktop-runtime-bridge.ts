import { defaultGreyfieldConfig, type GreyfieldConfig } from "@greyfield/persistence/config-schema";
import type { SpeechOutput } from "@greyfield/audio-runtime";
import type {
  DesktopIpcEventChannel,
  DesktopIpcEventMap,
  DesktopIpcRequestChannel,
  DesktopIpcRequestMap,
  DesktopMemoryDebugSnapshot
} from "../shared/ipc";
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
  voiceTest: {
    status: "idle" | "testing" | "success" | "error";
    message: string;
  };
  memoryDebug: {
    status: "idle" | "loading" | "ready";
    snapshot: DesktopMemoryDebugSnapshot | null;
  };
  inputDraft: string;
  messages: DesktopMessage[];
  assistantDraft: string;
  audioQueue: string[];
  settings: DesktopSettingsState;
  voiceInput: {
    status: "idle" | "listening" | "transcribing" | "error";
    message: string;
  };
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
  providerASR: string;
  providerBaseUrl: string;
  providerApiKey: string;
  providerHasApiKey: boolean;
  providerModel: string;
  providerASRModel: string;
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
  private speechPlaybackChain: Promise<void> = Promise.resolve();

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
      if (event.type === "memory.recall.context" && this.state.memoryDebug.snapshot) {
        this.state = {
          ...this.state,
          memoryDebug: {
            status: "ready",
            snapshot: {
              ...this.state.memoryDebug.snapshot,
              lastRecallContext: event.context,
              updatedAt: new Date().toISOString()
            }
          }
        };
      }
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
    this.host?.on("provider:test-voice-result", (result) => {
      const text = result.text ?? "Voice test";
      this.state = {
        ...this.state,
        voiceTest: {
          status: result.ok ? "success" : "error",
          message: formatVoiceTestMessage(result.message, result.ok)
        },
        voiceErrorMessage: result.ok ? "" : result.message,
        audioQueue: result.ok && result.data ? [...this.state.audioQueue, text] : this.state.audioQueue
      };
      if (result.ok && result.data) {
        this.playSpeech(text, result.data, { force: true });
      }
      this.emitStateChange();
    });
    this.host?.on("memory:debug-snapshot", (snapshot) => {
      this.state = {
        ...this.state,
        memoryDebug: {
          status: "ready",
          snapshot
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

  startVoiceInput(): DesktopRendererState {
    this.state = {
      ...this.state,
      status: "listening",
      errorMessage: "",
      voiceInput: {
        status: "listening",
        message: "Listening..."
      }
    };
    this.host?.send("runtime:input", { type: "audio.chunk", data: new Uint8Array() });
    return this.getState();
  }

  finishVoiceInput(audio: Uint8Array): DesktopRendererState {
    if (audio.length > 0) {
      this.host?.send("runtime:input", { type: "audio.chunk", data: audio });
    }
    this.host?.send("runtime:input", { type: "audio.end" });
    this.state = {
      ...this.state,
      status: "listening",
      voiceInput: {
        status: "transcribing",
        message: "Transcribing voice..."
      }
    };
    if (!this.host) {
      this.state = {
        ...this.state,
        voiceInput: {
          status: "idle",
          message: ""
        }
      };
    }
    return this.getState();
  }

  failVoiceInput(message: string): DesktopRendererState {
    this.state = {
      ...this.state,
      status: "error",
      errorMessage: message,
      voiceInput: {
        status: "error",
        message
      }
    };
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

  testVoiceProvider(): DesktopRendererState {
    this.state = {
      ...this.state,
      voiceTest: {
        status: "testing",
        message: "Testing voice playback..."
      },
      voiceErrorMessage: ""
    };
    this.host?.send("provider:test-voice", {});
    if (!this.host) {
      this.state = {
        ...this.state,
        voiceTest: {
          status: "success",
          message: "Voice test succeeded."
        },
        audioQueue: [...this.state.audioQueue, "你好，这是 Greyfield 的语音测试。"]
      };
    }
    return this.getState();
  }

  requestMemoryDebugSnapshot(): DesktopRendererState {
    this.state = {
      ...this.state,
      memoryDebug: {
        ...this.state.memoryDebug,
        status: "loading"
      }
    };
    this.host?.send("memory:debug-request", {});
    if (!this.host) {
      this.state = {
        ...this.state,
        memoryDebug: {
          status: "ready",
          snapshot: {
            threadId: "preview-thread",
            sessionId: "preview-session",
            recentTurns: [],
            summarySegments: [],
            updatedAt: new Date().toISOString()
          }
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

  private playSpeech(text: string, audio: Uint8Array, options: { force?: boolean } = {}): void {
    if (!this.speechOutput || (!this.state.settings.voiceSpeechEnabled && !options.force)) {
      return;
    }
    const playbackEpoch = this.speechPlaybackEpoch;
    const voiceId = this.state.settings.voiceId;
    const volume = this.state.settings.voiceVolume;
    this.speechPlaybackChain = this.speechPlaybackChain
      .catch(() => undefined)
      .then(async () => {
        if (playbackEpoch !== this.speechPlaybackEpoch || this.state.status === "interrupted") {
          return;
        }
        if (!options.force && !this.state.settings.voiceSpeechEnabled) {
          this.completeSpeechPlayback(text, playbackEpoch);
          return;
        }

        try {
          await this.speechOutput?.speak(text, {
            audio,
            voiceId,
            volume,
            onMouthOpen: (mouthOpen) => {
              if (playbackEpoch !== this.speechPlaybackEpoch) {
                return;
              }
              this.state = {
                ...this.state,
                stage: {
                  ...this.state.stage,
                  mouthOpen
                }
              };
              this.emitStateChange();
            }
          });
          if (this.completeSpeechPlayback(text, playbackEpoch)) {
            this.host?.send("runtime:speech-playback", { type: "finished", text });
          }
        } catch (error) {
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
        }
      });
    void this.speechPlaybackChain;
  }

  private completeSpeechPlayback(text: string, playbackEpoch: number): boolean {
    if (playbackEpoch !== this.speechPlaybackEpoch) {
      return false;
    }
    this.state = {
      ...this.state,
      stage: {
        ...this.state.stage,
        mouthOpen: 0
      }
    };
    const removed = this.removeQueuedSpeech(text);
    this.emitStateChange();
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

function formatVoiceTestMessage(message: string, ok: boolean): string {
  if (ok) {
    return message;
  }
  if (message.includes("Voice test is unavailable while a chat response is running.")) {
    return `${message} Stop the current reply or wait for it to finish, then retry.`;
  }
  if (!isVoiceConfigurationFailure(message)) {
    return message;
  }
  return `${message.replace(/[.。]+$/g, "")}. Check API key, Base URL, TTS model, and Voice, then retry.`;
}

function isVoiceConfigurationFailure(message: string): boolean {
  return (
    message.includes("OpenAI-compatible TTS needs a Base URL") ||
    message.includes("OpenAI-compatible TTS needs an API key") ||
    message.includes("OpenAI-compatible TTS needs a TTS model") ||
    message.includes("OpenAI-compatible TTS needs a voice") ||
    message.includes("OpenAI-compatible TTS request failed:") ||
    message.includes("OpenAI-compatible TTS request timed out")
  );
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
    voiceTest: {
      status: "idle",
      message: ""
    },
    memoryDebug: {
      status: "idle",
      snapshot: null
    },
    voiceInput: {
      status: "idle",
      message: ""
    },
    inputDraft: "",
    messages: [],
    assistantDraft: "",
    audioQueue: [],
    settings: {
      providerLLM: defaultGreyfieldConfig.provider.llm,
      providerASR: defaultGreyfieldConfig.provider.asr,
      providerBaseUrl: defaultGreyfieldConfig.provider.baseUrl,
      providerApiKey: defaultGreyfieldConfig.provider.apiKey,
      providerHasApiKey: defaultGreyfieldConfig.provider.apiKey.length > 0,
      providerModel: defaultGreyfieldConfig.provider.model,
      providerASRModel: defaultGreyfieldConfig.provider.asrModel,
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
