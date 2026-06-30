export type GreyfieldLocale = "en-US" | "zh-CN";

export function normalizeGreyfieldLocale(locale: unknown): GreyfieldLocale {
  return locale === "zh-CN" ? "zh-CN" : "en-US";
}

export interface GreyfieldConfig {
  provider: {
    llm: string;
    asr: string;
    tts: string;
    model: string;
    asrModel: string;
    ttsModel: string;
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
  };
  memory: {
    llmAtomExtractionEnabled: boolean;
  };
  characterFile: string;
}

export type GreyfieldConfigPatch = {
  [Key in keyof GreyfieldConfig]?: GreyfieldConfig[Key] extends object
    ? Partial<GreyfieldConfig[Key]>
    : GreyfieldConfig[Key];
};

export const defaultGreyfieldConfig: GreyfieldConfig = {
  provider: {
    llm: "fake",
    asr: "fake",
    tts: "openai-compatible",
    model: "greyfield-fake-v1",
    asrModel: "whisper-1",
    ttsModel: "FunAudioLLM/CosyVoice2-0.5B",
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
    locale: "en-US"
  },
  memory: {
    llmAtomExtractionEnabled: false
  },
  characterFile: "characters/greyfield.yaml"
};

export function mergeConfig(partial: GreyfieldConfigPatch): GreyfieldConfig {
  const ui = { ...defaultGreyfieldConfig.ui, ...partial.ui };
  return {
    ...defaultGreyfieldConfig,
    ...partial,
    provider: { ...defaultGreyfieldConfig.provider, ...partial.provider },
    voice: { ...defaultGreyfieldConfig.voice, ...partial.voice },
    audio: { ...defaultGreyfieldConfig.audio, ...partial.audio },
    window: { ...defaultGreyfieldConfig.window, ...partial.window },
    live2d: { ...defaultGreyfieldConfig.live2d, ...partial.live2d },
    hotkeys: { ...defaultGreyfieldConfig.hotkeys, ...partial.hotkeys },
    ui: { ...ui, locale: normalizeGreyfieldLocale(ui.locale) },
    memory: { ...defaultGreyfieldConfig.memory, ...partial.memory }
  };
}
