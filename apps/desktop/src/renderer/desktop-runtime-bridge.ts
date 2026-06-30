import { defaultGreyfieldConfig, type GreyfieldConfig } from "@greyfield/persistence/config-schema";
import type { SpeechOutput } from "@greyfield/audio-runtime";
import type {
  DesktopIpcEventChannel,
  DesktopIpcEventMap,
  DesktopIpcRequestChannel,
  DesktopIpcRequestMap,
  DesktopObservationState,
  DesktopMemoryAtomUpdate,
  DesktopMemoryDebugSnapshot,
  DesktopProactiveMessage,
  DesktopMemorySummaryUpdate
} from "../shared/ipc";
import type { MemoryAtomExtractionStatus } from "@greyfield/core-runtime";
import { summarizeObservationForTranscript, type RuntimeObservationMetadata, type RuntimeObservationMode } from "@greyfield/core-runtime";
import { isMaskedApiKey } from "../shared/secrets";
import { createDefaultInteractionProfile } from "@greyfield/stage-live2d";
import { createRendererPreviewRuntimeEvents } from "./preview-runtime-events";
import { reduceRuntimeEvent } from "./runtime-event-reducer";
import {
  configFromSettings,
  personaFormFromPersona,
  personaFromForm,
  settingsFromConfig,
  settingsPatchToConfigPatch
} from "./settings-state-mapper";

export interface DesktopMessage {
  role: "user" | "assistant";
  text: string;
  observationSummary?: string;
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
    actionStatus: "idle" | "working" | "success" | "error";
    actionMessage: string;
    exportText: string;
    snapshot: DesktopMemoryDebugSnapshot | null;
  };
  memoryExtraction: MemoryAtomExtractionStatus | null;
  inputDraft: string;
  messages: DesktopMessage[];
  observation: DesktopObservationState & { highFrequencyConfirmation: boolean };
  assistantDraft: string;
  proactiveMessage: {
    text: string;
    createdAt: string;
  } | null;
  persona: DesktopPersonaSettingsState;
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
  proactiveMemoryEnabled: boolean;
  settingsLocale: GreyfieldConfig["ui"]["locale"];
  proactivityLevel: number;
  llmAtomExtractionEnabled: boolean;
}

export type DesktopSettingsPatch = Partial<DesktopSettingsState>;

export interface DesktopPersonaFormState {
  name: string;
  userAddress: string;
  background: string;
  personality: string;
  speakingStyle: string;
  boundariesText: string;
  greeting: string;
  tone: string;
  expressionMap: Record<string, string>;
}

export interface DesktopPersonaSettingsState {
  status: "idle" | "loading" | "ready" | "saving" | "saved" | "error";
  path: string;
  message: string;
  form: DesktopPersonaFormState;
}

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
  private personaCharacterFile = defaultGreyfieldConfig.characterFile;
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
        proactiveMessage: settings.proactiveMemoryEnabled && settings.proactivityLevel > 0 ? this.state.proactiveMessage : null,
        window: {
          ...this.state.window,
          modelPassThrough: config.window.modelPassThrough
        }
      };
      if (
        settings.characterFile !== this.personaCharacterFile &&
        this.state.persona.status !== "idle"
      ) {
        this.requestPersona();
      }
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
            ...this.state.memoryDebug,
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
    this.host?.on("proactive:message", (message) => {
      this.showProactiveMessage(message);
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
      const returnedAudio = result.ok ? result.data : undefined;
      const canPlayReturnedAudio = returnedAudio !== undefined && this.speechOutput !== undefined;
      this.state = {
        ...this.state,
        voiceTest: {
          status: result.ok ? "success" : "error",
          message: formatVoiceTestMessage(result.message, result.ok)
        },
        voiceErrorMessage: result.ok ? "" : result.message,
        audioQueue: canPlayReturnedAudio ? [...this.state.audioQueue, text] : this.state.audioQueue
      };
      if (returnedAudio && this.speechOutput) {
        this.playSpeech(text, returnedAudio, { force: true });
      }
      this.emitStateChange();
    });
    this.host?.on("memory:debug-snapshot", (snapshot) => {
      this.state = {
        ...this.state,
        memoryDebug: {
          ...this.state.memoryDebug,
          status: "ready",
          snapshot
        }
      };
      this.emitStateChange();
    });
    this.host?.on("memory:action-result", (result) => {
      this.state = {
        ...this.state,
        memoryDebug: {
          ...this.state.memoryDebug,
          actionStatus: result.ok ? "success" : "error",
          actionMessage: result.message
        }
      };
      this.emitStateChange();
    });
    this.host?.on("memory:export-result", (result) => {
      this.state = {
        ...this.state,
        memoryDebug: {
          ...this.state.memoryDebug,
          actionStatus: result.ok ? "success" : "error",
          actionMessage: result.message,
          exportText: result.export ? JSON.stringify(result.export, null, 2) : this.state.memoryDebug.exportText
        }
      };
      this.emitStateChange();
    });
    this.host?.on("observation:state", (observation) => {
      this.state = {
        ...this.state,
        observation: {
          ...observation,
          highFrequencyConfirmation:
            observation.status === "observing" || observation.mode !== "high"
              ? false
              : this.state.observation.highFrequencyConfirmation
        }
      };
      this.emitStateChange();
    });
    this.host?.on("persona:state", (result) => {
      const previousPersonaPath = this.state.persona.path;
      this.state = {
        ...this.state,
        persona: {
          status: result.status,
          path: result.path,
          message: result.message,
          form: result.persona
            ? personaFormFromPersona(result.persona)
            : result.path === previousPersonaPath
              ? this.state.persona.form
              : createDefaultPersonaForm()
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

    const observationPayload = createObservationRuntimePayload(this.state.observation);
    this.state = {
      ...this.state,
      status: "thinking",
      errorMessage: "",
      voiceErrorMessage: "",
      inputDraft: "",
      assistantDraft: "",
      proactiveMessage: null,
      messages: [
        ...this.state.messages,
        {
          role: "user",
          text: trimmed,
          ...(observationPayload.metadata ? { observationSummary: summarizeObservationForTranscript(observationPayload.metadata) } : {})
        }
      ],
      observation: observationPayload.metadata ? createIdleObservationState() : this.state.observation
    };

    if (this.host) {
      this.host.send("runtime:input", {
        type: "text.input",
        text: trimmed,
        ...(observationPayload.attachments.length > 0 ? { attachments: observationPayload.attachments } : {}),
        ...(observationPayload.observation ? { observation: observationPayload.observation } : {})
      });
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
      proactiveMessage: null,
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
        proactiveMessage: null,
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
      proactiveMessage: null,
      audioQueue: [],
      stage: {
        ...this.state.stage,
        mouthOpen: 0
      }
    };

    return this.getState();
  }

  captureScreenshot(): DesktopRendererState {
    this.state = {
      ...this.state,
      observation: {
        ...this.state.observation,
        status: "capturing",
        mode: "single",
        message: "Capturing one temporary screenshot...",
        highFrequencyConfirmation: false
      }
    };
    this.host?.send("observation:capture", { mode: "single" });
    if (!this.host) {
      this.state = {
        ...this.state,
        observation: {
          ...createIdleObservationState(),
          status: "ready",
          mode: "single",
          observationId: "preview-observation",
          frames: [createPreviewObservationFrame()],
          message: "Screenshot ready. Confirm to send it with this chat turn, or delete it."
        }
      };
    }
    return this.getState();
  }

  startObservation(mode: Exclude<RuntimeObservationMode, "single">): DesktopRendererState {
    if (mode === "high" && !this.state.observation.highFrequencyConfirmation) {
      this.state = {
        ...this.state,
        observation: {
          ...this.state.observation,
          mode,
          highFrequencyConfirmation: true,
          highFrequencyWarning: "High frequency observation is short-lived and stops automatically after 5 seconds or 8 frames.",
          message: "High frequency captures more frames. Click High again to start."
        }
      };
      return this.getState();
    }
    this.state = {
      ...this.state,
      observation: {
        ...this.state.observation,
        status: "observing",
        mode,
        frames: [],
        highFrequencyConfirmation: false,
        message: `${mode} observation is starting...`
      }
    };
    this.host?.send("observation:start", { mode });
    return this.getState();
  }

  stopObservation(): DesktopRendererState {
    this.host?.send("observation:stop", {});
    this.state = {
      ...this.state,
      observation: {
        ...this.state.observation,
        status: this.state.observation.frames.length > 0 ? "stopped" : "idle",
        highFrequencyConfirmation: false,
        message:
          this.state.observation.frames.length > 0
            ? "Observation stopped. Confirm to send the temporary frames, or delete them."
            : "Observation stopped."
      }
    };
    return this.getState();
  }

  deleteObservation(): DesktopRendererState {
    this.host?.send("observation:delete", {});
    this.state = {
      ...this.state,
      observation: createIdleObservationState()
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
      },
      proactiveMessage:
        patch.proactiveMemoryEnabled === false || patch.proactivityLevel === 0 ? null : this.state.proactiveMessage
    };
    this.host?.send("settings:update", settingsPatchToConfigPatch(patch));
    return this.getState();
  }

  requestPersona(): DesktopRendererState {
    this.personaCharacterFile = this.state.settings.characterFile;
    this.state = {
      ...this.state,
      persona: {
        path: this.state.settings.characterFile,
        status: "loading",
        message: "Loading persona...",
        form: createDefaultPersonaForm()
      }
    };
    this.host?.send("persona:load", {});
    if (!this.host) {
      this.state = {
        ...this.state,
        persona: {
          status: "ready",
          path: this.state.settings.characterFile,
          message: "Persona loaded in preview.",
          form: createDefaultPersonaForm()
        }
      };
    }
    return this.getState();
  }

  savePersona(form: DesktopPersonaFormState): DesktopRendererState {
    this.state = {
      ...this.state,
      persona: {
        ...this.state.persona,
        status: "saving",
        message: "Saving persona...",
        form
      }
    };
    this.host?.send("persona:save", { persona: personaFromForm(form) });
    if (!this.host) {
      this.state = {
        ...this.state,
        persona: {
          ...this.state.persona,
          status: "saved",
          message: "Persona saved in preview."
        }
      };
    }
    return this.getState();
  }

  updatePersonaDraft(form: DesktopPersonaFormState): DesktopRendererState {
    this.state = {
      ...this.state,
      persona: {
        ...this.state.persona,
        form,
        message: this.state.persona.status === "error" ? "" : this.state.persona.message,
        status: this.state.persona.status === "saved" ? "ready" : this.state.persona.status
      }
    };
    return this.getState();
  }

  showProactiveMessage(message: DesktopProactiveMessage): DesktopRendererState {
    const text = message.text.trim();
    if (text.length === 0 || !this.state.settings.proactiveMemoryEnabled || this.state.settings.proactivityLevel <= 0) {
      return this.getState();
    }
    this.state = {
      ...this.state,
      proactiveMessage: {
        text,
        createdAt: message.createdAt
      }
    };
    this.emitStateChange();
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
      const canPlayPreviewAudio = Boolean(this.speechOutput);
      this.state = {
        ...this.state,
        voiceTest: {
          status: "success",
          message: "Voice test succeeded."
        },
        audioQueue: canPlayPreviewAudio ? [...this.state.audioQueue, "你好，这是 Greyfield 的语音测试。"] : this.state.audioQueue
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
          ...this.state.memoryDebug,
          status: "ready",
          snapshot: {
            threadId: "preview-thread",
            sessionId: "preview-session",
            recentTurns: [],
            summarySegments: [],
            memoryAtoms: [],
            updatedAt: new Date().toISOString()
          }
        }
      };
    }
    return this.getState();
  }

  updateMemorySummary(payload: DesktopMemorySummaryUpdate): DesktopRendererState {
    this.state = {
      ...this.state,
      memoryDebug: {
        ...this.state.memoryDebug,
        actionStatus: "working",
        actionMessage: "Saving memory...",
        exportText: ""
      }
    };
    this.host?.send("memory:summary-update", payload);
    if (!this.host) {
      this.state = {
        ...this.state,
        memoryDebug: {
          ...this.state.memoryDebug,
          actionStatus: "success",
          actionMessage: "Memory saved in preview."
        }
      };
    }
    return this.getState();
  }

  deleteMemorySummary(id: string): DesktopRendererState {
    this.state = {
      ...this.state,
      memoryDebug: {
        ...this.state.memoryDebug,
        actionStatus: "working",
        actionMessage: "Deleting memory...",
        exportText: ""
      }
    };
    this.host?.send("memory:summary-delete", { id });
    if (!this.host) {
      this.state = {
        ...this.state,
        memoryDebug: {
          ...this.state.memoryDebug,
          actionStatus: "success",
          actionMessage: "Memory deleted in preview."
        }
      };
    }
    return this.getState();
  }

  clearMemorySummaries(): DesktopRendererState {
    this.state = {
      ...this.state,
      memoryDebug: {
        ...this.state.memoryDebug,
        actionStatus: "working",
        actionMessage: "Clearing summary memory...",
        exportText: ""
      }
    };
    this.host?.send("memory:summary-clear", {});
    if (!this.host) {
      this.state = {
        ...this.state,
        memoryDebug: {
          ...this.state.memoryDebug,
          actionStatus: "success",
          actionMessage: "Summary memory cleared in preview."
        }
      };
    }
    return this.getState();
  }

  updateMemoryAtom(payload: DesktopMemoryAtomUpdate): DesktopRendererState {
    this.state = {
      ...this.state,
      memoryDebug: {
        ...this.state.memoryDebug,
        actionStatus: "working",
        actionMessage: "Saving atom memory...",
        exportText: ""
      }
    };
    this.host?.send("memory:atom-update", payload);
    if (!this.host) {
      this.state = {
        ...this.state,
        memoryDebug: {
          ...this.state.memoryDebug,
          actionStatus: "success",
          actionMessage: "Atom memory saved in preview."
        }
      };
    }
    return this.getState();
  }

  deleteMemoryAtom(id: string): DesktopRendererState {
    this.state = {
      ...this.state,
      memoryDebug: {
        ...this.state.memoryDebug,
        actionStatus: "working",
        actionMessage: "Deleting atom memory...",
        exportText: ""
      }
    };
    this.host?.send("memory:atom-delete", { id });
    if (!this.host) {
      this.state = {
        ...this.state,
        memoryDebug: {
          ...this.state.memoryDebug,
          actionStatus: "success",
          actionMessage: "Atom memory deleted in preview."
        }
      };
    }
    return this.getState();
  }

  clearCurrentRoleMemoryAtoms(): DesktopRendererState {
    this.state = {
      ...this.state,
      memoryDebug: {
        ...this.state.memoryDebug,
        actionStatus: "working",
        actionMessage: "Clearing current role atom memory...",
        exportText: ""
      }
    };
    this.host?.send("memory:atom-clear-current-role", {});
    if (!this.host) {
      this.state = {
        ...this.state,
        memoryDebug: {
          ...this.state.memoryDebug,
          actionStatus: "success",
          actionMessage: "Current role atom memory cleared in preview."
        }
      };
    }
    return this.getState();
  }

  exportMemoryAtom(id: string): DesktopRendererState {
    this.state = {
      ...this.state,
      memoryDebug: {
        ...this.state.memoryDebug,
        actionStatus: "working",
        actionMessage: "Preparing atom memory export..."
      }
    };
    this.host?.send("memory:atom-export", { id });
    if (!this.host) {
      const previewExport = {
        threadId: "preview-thread",
        sessionId: "preview-session",
        recentTurns: [],
        summarySegments: [],
        memoryAtoms: [],
        exportedAt: new Date().toISOString()
      };
      this.state = {
        ...this.state,
        memoryDebug: {
          ...this.state.memoryDebug,
          actionStatus: "success",
          actionMessage: "Atom memory export is ready.",
          exportText: JSON.stringify(previewExport, null, 2)
        }
      };
    }
    return this.getState();
  }

  exportMemory(): DesktopRendererState {
    this.state = {
      ...this.state,
      memoryDebug: {
        ...this.state.memoryDebug,
        actionStatus: "working",
        actionMessage: "Preparing memory export..."
      }
    };
    this.host?.send("memory:export-request", {});
    if (!this.host) {
      const previewExport = {
        threadId: "preview-thread",
        sessionId: "preview-session",
        recentTurns: [],
        summarySegments: [],
        memoryAtoms: [],
        exportedAt: new Date().toISOString()
      };
      this.state = {
        ...this.state,
        memoryDebug: {
          ...this.state.memoryDebug,
          actionStatus: "success",
          actionMessage: "Memory export is ready.",
          exportText: JSON.stringify(previewExport, null, 2)
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
      actionStatus: "idle",
      actionMessage: "",
      exportText: "",
      snapshot: null
    },
    memoryExtraction: null,
    observation: createIdleObservationState(),
    voiceInput: {
      status: "idle",
      message: ""
    },
    inputDraft: "",
    messages: [],
    assistantDraft: "",
    proactiveMessage: null,
    persona: {
      status: "idle",
      path: defaultGreyfieldConfig.characterFile,
      message: "",
      form: createDefaultPersonaForm()
    },
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
      speechBubbleEnabled: defaultGreyfieldConfig.ui.speechBubbleEnabled,
      proactiveMemoryEnabled: defaultGreyfieldConfig.ui.proactiveMemoryEnabled,
      settingsLocale: defaultGreyfieldConfig.ui.locale,
      proactivityLevel: defaultGreyfieldConfig.ui.proactivityLevel,
      llmAtomExtractionEnabled: defaultGreyfieldConfig.memory.llmAtomExtractionEnabled
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

function createIdleObservationState(): DesktopRendererState["observation"] {
  return {
    status: "idle",
    mode: "single",
    observationId: "",
    frames: [],
    duplicateCount: 0,
    maxFrames: 1,
    timeoutMs: 0,
    intervalMs: 0,
    message: "",
    highFrequencyConfirmation: false
  };
}

function createObservationRuntimePayload(observation: DesktopRendererState["observation"]): {
  attachments: DesktopRendererState["observation"]["frames"];
  observation?: { id: string; mode: RuntimeObservationMode; frameCount: number; dedupedFrameCount: number; durationMs?: number };
  metadata?: RuntimeObservationMetadata;
} {
  if ((observation.status !== "ready" && observation.status !== "stopped") || observation.frames.length === 0) {
    return { attachments: [] };
  }
  const metadata: RuntimeObservationMetadata = {
    kind: "visual-observation",
    mode: observation.mode,
    frameCount: observation.frames.length + observation.duplicateCount,
    dedupedFrameCount: observation.frames.length,
    source: observation.mode === "single" ? "user-active-screenshot" : "user-active-observation"
  };
  return {
    attachments: observation.frames,
    observation: {
      id: observation.observationId || "renderer-observation",
      mode: observation.mode,
      frameCount: metadata.frameCount,
      dedupedFrameCount: metadata.dedupedFrameCount,
      ...(observation.timeoutMs > 0 ? { durationMs: observation.timeoutMs } : {})
    },
    metadata
  };
}

function createPreviewObservationFrame(): DesktopRendererState["observation"]["frames"][number] {
  const dataUrl =
    "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAIAAAD91JpzAAAAFElEQVR42mP8z8AARLJgwiM3MDAAExABBCfR7P8AAAAASUVORK5CYII=";
  return {
    id: "preview-frame-1",
    index: 0,
    dataUrl,
    mimeType: "image/png",
    createdAt: new Date().toISOString(),
    source: "screenshot",
    hash: "preview"
  };
}

function createDefaultPersonaForm(): DesktopPersonaFormState {
  return {
    name: "Greyfield",
    userAddress: "you",
    background: "A Live2D desktop companion focused on presence, conversation, and continuity.",
    personality: "Warm, steady, observant, and lightly playful without pretending to control the desktop.",
    speakingStyle: "Keep replies short enough to speak naturally and prefer concrete progress over vague planning.",
    boundariesText: [
      "V1 cannot control the desktop.",
      "V1 cannot browse the web or operate external applications by itself."
    ].join("\n"),
    greeting: "你好，我在。",
    tone: "warm, concise, slightly playful",
    expressionMap: {
      neutral: "default",
      thinking: "thinking",
      speaking: "smile"
    }
  };
}
