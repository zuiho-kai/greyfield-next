export type GreyfieldLocale = "en-US" | "zh-CN";
export type GreyfieldWindowLayerMode = "follow-click" | "controls-front" | "pet-front";
export type GreyfieldTaskModelSlot =
  | "chat"
  | "planner"
  | "utility"
  | "memory"
  | "vision"
  | "multimodal"
  | "voiceAsr"
  | "voiceTts";

export type GreyfieldTaskModelConfig = Record<GreyfieldTaskModelSlot, string>;

export function normalizeGreyfieldLocale(locale: unknown): GreyfieldLocale {
  return locale === "en-US" ? "en-US" : "zh-CN";
}

export interface GreyfieldConfig {
  provider: {
    llm: string;
    asr: string;
    tts: string;
    model: string;
    visionModel: string;
    asrModel: string;
    ttsModel: string;
    taskModels: GreyfieldTaskModelConfig;
    baseUrl: string;
    apiKey: string;
  };
  voice: {
    id: string;
    volume: number;
    speechEnabled: boolean;
  };
  audio: {
    microphoneId: string;
  };
  window: {
    alwaysOnTop: boolean;
    clickThrough: boolean;
    modelPassThrough: boolean;
    layerMode: GreyfieldWindowLayerMode;
    width: number;
    height: number;
    x?: number;
    y?: number;
  };
  live2d: {
    modelPath: string;
    scale: number;
    x: number;
    y: number;
  };
  hotkeys: {
    interrupt: string;
    toggleClickThrough: string;
  };
  ui: {
    speechBubbleEnabled: boolean;
    proactiveMemoryEnabled: boolean;
    locale: GreyfieldLocale;
    proactivityLevel: number;
  };
  memory: {
    llmAtomExtractionEnabled: boolean;
  };
  characterFile: string;
}

type GreyfieldConfigValuePatch<Value> = Value extends object
  ? { [Key in keyof Value]?: GreyfieldConfigValuePatch<Value[Key]> }
  : Value;

export type GreyfieldConfigPatch = {
  [Key in keyof GreyfieldConfig]?: GreyfieldConfigValuePatch<GreyfieldConfig[Key]>;
};

export const defaultGreyfieldConfig: GreyfieldConfig = {
  provider: {
    llm: "fake",
    asr: "fake",
    tts: "openai-compatible",
    model: "greyfield-fake-v1",
    visionModel: "",
    asrModel: "whisper-1",
    ttsModel: "FunAudioLLM/CosyVoice2-0.5B",
    taskModels: {
      chat: "greyfield-fake-v1",
      planner: "greyfield-fake-v1",
      utility: "greyfield-fake-v1",
      memory: "greyfield-fake-v1",
      vision: "",
      multimodal: "",
      voiceAsr: "whisper-1",
      voiceTts: "FunAudioLLM/CosyVoice2-0.5B"
    },
    baseUrl: "https://api.openai.com/v1",
    apiKey: ""
  },
  voice: {
    id: "FunAudioLLM/CosyVoice2-0.5B:anna",
    volume: 0.85,
    speechEnabled: false
  },
  audio: {
    microphoneId: "default"
  },
  window: {
    alwaysOnTop: true,
    clickThrough: false,
    modelPassThrough: false,
    layerMode: "follow-click",
    width: 420,
    height: 620
  },
  live2d: {
    modelPath: "assets/live2d/momose-hiyori/runtime/hiyori_free_t08.model3.json",
    scale: 1,
    x: 0,
    y: 0
  },
  hotkeys: {
    interrupt: "CommandOrControl+Shift+Space",
    toggleClickThrough: "CommandOrControl+Shift+P"
  },
  ui: {
    speechBubbleEnabled: true,
    proactiveMemoryEnabled: true,
    locale: "zh-CN",
    proactivityLevel: 50
  },
  memory: {
    llmAtomExtractionEnabled: false
  },
  characterFile: "characters/greyfield.yaml"
};

export function mergeConfig(partial: GreyfieldConfigPatch): GreyfieldConfig {
  const ui = { ...defaultGreyfieldConfig.ui, ...partial.ui };
  const provider = normalizeProviderConfig(partial.provider);
  return {
    ...defaultGreyfieldConfig,
    ...partial,
    provider,
    voice: { ...defaultGreyfieldConfig.voice, ...partial.voice },
    audio: { ...defaultGreyfieldConfig.audio, ...partial.audio },
    window: { ...defaultGreyfieldConfig.window, ...partial.window },
    live2d: { ...defaultGreyfieldConfig.live2d, ...partial.live2d },
    hotkeys: { ...defaultGreyfieldConfig.hotkeys, ...partial.hotkeys },
    ui: {
      ...ui,
      locale: normalizeGreyfieldLocale(ui.locale),
      proactivityLevel: normalizeProactivityLevel(ui.proactivityLevel)
    },
    memory: { ...defaultGreyfieldConfig.memory, ...partial.memory }
  };
}

function normalizeProviderConfig(partial: GreyfieldConfigPatch["provider"] | undefined): GreyfieldConfig["provider"] {
  const input = partial ?? {};
  const taskModels = input.taskModels ?? {};
  const chatModel = normalizePairedTaskModelSlot({
    taskModels,
    slot: "chat",
    legacyValue: input.model,
    defaultSlotValue: defaultGreyfieldConfig.provider.taskModels.chat,
    defaultLegacyValue: defaultGreyfieldConfig.provider.model
  });
  const visionModel = normalizePairedTaskModelSlot({
    taskModels,
    slot: "vision",
    legacyValue: input.visionModel,
    defaultSlotValue: defaultGreyfieldConfig.provider.taskModels.vision,
    defaultLegacyValue: defaultGreyfieldConfig.provider.visionModel
  });
  const voiceAsrModel = normalizePairedTaskModelSlot({
    taskModels,
    slot: "voiceAsr",
    legacyValue: input.asrModel,
    defaultSlotValue: defaultGreyfieldConfig.provider.taskModels.voiceAsr,
    defaultLegacyValue: defaultGreyfieldConfig.provider.asrModel
  });
  const voiceTtsModel = normalizePairedTaskModelSlot({
    taskModels,
    slot: "voiceTts",
    legacyValue: input.ttsModel,
    defaultSlotValue: defaultGreyfieldConfig.provider.taskModels.voiceTts,
    defaultLegacyValue: defaultGreyfieldConfig.provider.ttsModel
  });
  const normalizedTaskModels: GreyfieldTaskModelConfig = {
    chat: chatModel,
    planner: normalizeModelSlot(taskModels.planner, chatModel),
    utility: normalizeModelSlot(taskModels.utility, chatModel),
    memory: normalizeModelSlot(taskModels.memory, chatModel),
    vision: visionModel,
    multimodal: normalizeModelSlot(taskModels.multimodal, visionModel),
    voiceAsr: voiceAsrModel,
    voiceTts: voiceTtsModel
  };
  return {
    ...defaultGreyfieldConfig.provider,
    ...input,
    model: normalizedTaskModels.chat,
    visionModel: normalizedTaskModels.vision,
    asrModel: normalizedTaskModels.voiceAsr,
    ttsModel: normalizedTaskModels.voiceTts,
    taskModels: normalizedTaskModels
  };
}

function normalizeModelSlot(value: string | undefined, fallback: string): string {
  return typeof value === "string" ? value.trim() : fallback;
}

function normalizePairedTaskModelSlot(input: {
  taskModels: Partial<GreyfieldTaskModelConfig>;
  slot: GreyfieldTaskModelSlot;
  legacyValue: string | undefined;
  defaultSlotValue: string;
  defaultLegacyValue: string;
}): string {
  const slotValue = taskModelSlotIsPresent(input.taskModels, input.slot) ? input.taskModels[input.slot] : undefined;
  const normalizedSlotValue = typeof slotValue === "string" ? slotValue.trim() : undefined;
  if (normalizedSlotValue !== undefined && normalizedSlotValue !== input.defaultSlotValue) {
    return normalizedSlotValue;
  }
  if (modelFieldOverridesDefault(input.legacyValue, input.defaultLegacyValue)) {
    return input.legacyValue?.trim() ?? "";
  }
  return normalizedSlotValue ?? input.defaultSlotValue;
}

function taskModelSlotIsPresent(
  taskModels: Partial<GreyfieldTaskModelConfig>,
  slot: GreyfieldTaskModelSlot
): boolean {
  return Object.prototype.hasOwnProperty.call(taskModels, slot);
}

function modelFieldOverridesDefault(value: string | undefined, defaultValue: string): boolean {
  return value !== undefined && value.trim() !== defaultValue;
}

function normalizeProactivityLevel(value: number): number {
  if (!Number.isFinite(value)) {
    return defaultGreyfieldConfig.ui.proactivityLevel;
  }
  return Math.min(100, Math.max(0, Math.round(value)));
}
