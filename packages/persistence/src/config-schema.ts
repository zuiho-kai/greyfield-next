export interface GreyfieldConfig {
  provider: {
    llm: string;
    asr: string;
    tts: string;
    model: string;
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
    tts: "fake",
    model: "greyfield-fake-v1",
    baseUrl: "https://api.openai.com/v1",
    apiKey: ""
  },
  voice: {
    id: "default",
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
    speechBubbleEnabled: true
  },
  characterFile: "characters/greyfield.yaml"
};

export function mergeConfig(partial: GreyfieldConfigPatch): GreyfieldConfig {
  return {
    ...defaultGreyfieldConfig,
    ...partial,
    provider: { ...defaultGreyfieldConfig.provider, ...partial.provider },
    voice: { ...defaultGreyfieldConfig.voice, ...partial.voice },
    audio: { ...defaultGreyfieldConfig.audio, ...partial.audio },
    window: { ...defaultGreyfieldConfig.window, ...partial.window },
    live2d: { ...defaultGreyfieldConfig.live2d, ...partial.live2d },
    hotkeys: { ...defaultGreyfieldConfig.hotkeys, ...partial.hotkeys },
    ui: { ...defaultGreyfieldConfig.ui, ...partial.ui }
  };
}
