import { defaultGreyfieldConfig, type GreyfieldConfig } from "@greyfield/persistence/config-schema";
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
  voiceId: string;
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

  constructor(private readonly host?: DesktopHostApi) {
    this.host?.on("settings:changed", (config) => {
      this.state = {
        ...this.state,
        settings: settingsFromConfig(config),
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
      this.emitStateChange();
    });
    this.host?.on("provider:test-llm-result", (result) => {
      this.state = {
        ...this.state,
        providerTest: {
          status: result.ok ? "success" : "error",
          message: result.message,
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
      errorMessage: "",
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
    if (this.host) {
      this.host.send("runtime:input", { type: "runtime.interrupt" });
      this.state = {
        ...this.state,
        errorMessage: "",
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

  private emitStateChange(): void {
    const snapshot = this.getState();
    for (const handler of this.stateChangeHandlers) {
      handler(snapshot);
    }
  }
}

export function createDesktopRuntimeBridge(host?: DesktopHostApi): DesktopRuntimeBridge {
  return new DesktopRuntimeBridge(host);
}

export function createInitialDesktopRendererState(): DesktopRendererState {
  return {
    status: "idle",
    errorMessage: "",
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
      voiceId: defaultGreyfieldConfig.voice.id,
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
