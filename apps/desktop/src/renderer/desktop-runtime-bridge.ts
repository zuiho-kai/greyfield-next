import {
  type RuntimeOutputEvent,
} from "@greyfield/core-runtime";
import { defaultGreyfieldConfig, type GreyfieldConfig, type GreyfieldConfigPatch } from "@greyfield/persistence/config-schema";
import type { DesktopIpcEventChannel, DesktopIpcEventMap, DesktopIpcRequestChannel, DesktopIpcRequestMap } from "../shared/ipc";
import type { RendererGreyfieldConfig } from "../shared/renderer-config";
import { isMaskedApiKey } from "../shared/secrets";
import { createDefaultInteractionProfile, resolveEmotionReaction } from "@greyfield/stage-live2d";

export interface DesktopMessage {
  role: "user" | "assistant";
  text: string;
}

export interface DesktopRendererState {
  status: string;
  errorMessage: string;
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
      this.applyRuntimeEvent(event);
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
      this.applyRuntimeEvent(event);
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

  getState(): DesktopRendererState {
    return structuredClone(this.state);
  }

  getConfigSnapshot(): GreyfieldConfig {
    return configFromSettings(this.state.settings);
  }

  private applyRuntimeEvent(event: RuntimeOutputEvent): void {
    if (event.type === "runtime.status") {
      this.state = {
        ...this.state,
        status: event.status,
        stage: {
          ...this.state.stage,
          ...stageReactionForStatus(event.status, this.interactionProfile)
        }
      };
      return;
    }

    if (event.type === "error") {
      this.state = {
        ...this.state,
        status: "error",
        errorMessage: event.message,
        assistantDraft: "",
        audioQueue: [],
        stage: {
          ...this.state.stage,
          mouthOpen: 0
        }
      };
      return;
    }

    if (event.type === "assistant.text.delta") {
      this.state = {
        ...this.state,
        assistantDraft: `${this.state.assistantDraft}${event.text}`
      };
      return;
    }

    if (event.type === "assistant.text.final") {
      this.state = {
        ...this.state,
        assistantDraft: "",
        messages: [...this.state.messages, { role: "assistant", text: event.text }]
      };
      return;
    }

    if (event.type === "assistant.audio.chunk") {
      this.state = {
        ...this.state,
        audioQueue: [...this.state.audioQueue, event.text],
        stage: {
          ...this.state.stage,
          mouthOpen: 0
        }
      };
      return;
    }

    if (event.type === "assistant.audio.end") {
      this.state = {
        ...this.state,
        stage: {
          ...this.state.stage,
          mouthOpen: 0
        }
      };
    }
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

function stageReactionForStatus(
  status: string,
  profile: ReturnType<typeof createDefaultInteractionProfile>
): Partial<DesktopRendererState["stage"]> {
  if (status === "idle") {
    return {};
  }
  const reaction = resolveEmotionReaction(profile, status);
  return {
    ...(reaction.expression ? { expression: reaction.expression } : {}),
    ...(reaction.motion ? { motion: reaction.motion } : {})
  };
}

function settingsFromConfig(config: RendererGreyfieldConfig | GreyfieldConfig): DesktopSettingsState {
  const hasApiKey = "hasApiKey" in config.provider ? config.provider.hasApiKey : config.provider.apiKey.length > 0;
  return {
    providerLLM: config.provider.llm,
    providerBaseUrl: config.provider.baseUrl,
    providerApiKey: isMaskedApiKey(config.provider.apiKey) ? "" : config.provider.apiKey,
    providerHasApiKey: hasApiKey,
    providerModel: config.provider.model,
    voiceId: config.voice.id,
    microphoneId: config.audio.microphoneId,
    characterFile: config.characterFile,
    modelPath: config.live2d.modelPath,
    modelScale: config.live2d.scale,
    modelX: config.live2d.x,
    modelY: config.live2d.y,
    speechBubbleEnabled: config.ui.speechBubbleEnabled
  };
}

function configFromSettings(settings: DesktopSettingsState): GreyfieldConfig {
  return {
    ...defaultGreyfieldConfig,
    provider: {
      ...defaultGreyfieldConfig.provider,
      llm: settings.providerLLM,
      baseUrl: settings.providerBaseUrl,
      apiKey: settings.providerApiKey,
      model: settings.providerModel
    },
    voice: {
      ...defaultGreyfieldConfig.voice,
      id: settings.voiceId
    },
    audio: {
      ...defaultGreyfieldConfig.audio,
      microphoneId: settings.microphoneId
    },
    live2d: {
      ...defaultGreyfieldConfig.live2d,
      modelPath: settings.modelPath,
      scale: settings.modelScale,
      x: settings.modelX,
      y: settings.modelY
    },
    ui: {
      ...defaultGreyfieldConfig.ui,
      speechBubbleEnabled: settings.speechBubbleEnabled
    },
    characterFile: settings.characterFile
  };
}

function settingsPatchToConfigPatch(patch: DesktopSettingsPatch): GreyfieldConfigPatch {
  const configPatch: GreyfieldConfigPatch = {};
  if (patch.providerModel !== undefined) {
    configPatch.provider = { ...configPatch.provider, model: patch.providerModel };
  }
  if (patch.providerLLM !== undefined) {
    configPatch.provider = { ...configPatch.provider, llm: patch.providerLLM };
  }
  if (patch.providerBaseUrl !== undefined) {
    configPatch.provider = { ...configPatch.provider, baseUrl: patch.providerBaseUrl };
  }
  if (patch.providerApiKey !== undefined && !isMaskedApiKey(patch.providerApiKey)) {
    configPatch.provider = { ...configPatch.provider, apiKey: patch.providerApiKey };
  }
  if (patch.voiceId !== undefined) {
    configPatch.voice = { id: patch.voiceId };
  }
  if (patch.microphoneId !== undefined) {
    configPatch.audio = { microphoneId: patch.microphoneId };
  }
  if (
    patch.modelPath !== undefined ||
    patch.modelScale !== undefined ||
    patch.modelX !== undefined ||
    patch.modelY !== undefined
  ) {
    configPatch.live2d = {
      ...(patch.modelPath !== undefined ? { modelPath: patch.modelPath } : {}),
      ...(patch.modelScale !== undefined ? { scale: patch.modelScale } : {}),
      ...(patch.modelX !== undefined ? { x: patch.modelX } : {}),
      ...(patch.modelY !== undefined ? { y: patch.modelY } : {})
    };
  }
  if (patch.characterFile !== undefined) {
    configPatch.characterFile = patch.characterFile;
  }
  if (patch.speechBubbleEnabled !== undefined) {
    configPatch.ui = { speechBubbleEnabled: patch.speechBubbleEnabled };
  }
  return configPatch;
}

function createRendererPreviewRuntimeEvents(): RuntimeOutputEvent[] {
  return [
    { type: "runtime.status", status: "thinking" },
    { type: "assistant.text.delta", text: "你好，我醒着。" },
    { type: "runtime.status", status: "speaking" },
    { type: "assistant.audio.chunk", text: "你好，我醒着。", data: new TextEncoder().encode("fake-audio:你好，我醒着。") },
    { type: "assistant.text.delta", text: "现在可以继续做桌宠了。" },
    { type: "runtime.status", status: "speaking" },
    {
      type: "assistant.audio.chunk",
      text: "现在可以继续做桌宠了。",
      data: new TextEncoder().encode("fake-audio:现在可以继续做桌宠了。")
    },
    { type: "assistant.text.final", text: "你好，我醒着。现在可以继续做桌宠了。" },
    { type: "assistant.audio.end" },
    { type: "runtime.status", status: "idle" }
  ];
}
