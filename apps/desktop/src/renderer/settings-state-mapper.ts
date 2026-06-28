import { defaultGreyfieldConfig, type GreyfieldConfig, type GreyfieldConfigPatch } from "@greyfield/persistence/config-schema";
import type { RendererGreyfieldConfig } from "../shared/renderer-config";
import { isMaskedApiKey } from "../shared/secrets";
import type { DesktopSettingsPatch, DesktopSettingsState } from "./desktop-runtime-bridge";

export function settingsFromConfig(config: RendererGreyfieldConfig | GreyfieldConfig): DesktopSettingsState {
  const hasApiKey = "hasApiKey" in config.provider ? config.provider.hasApiKey : config.provider.apiKey.length > 0;
  return {
    providerLLM: config.provider.llm,
    providerASR: config.provider.asr,
    providerBaseUrl: config.provider.baseUrl,
    providerApiKey: isMaskedApiKey(config.provider.apiKey) ? "" : config.provider.apiKey,
    providerHasApiKey: hasApiKey,
    providerModel: config.provider.model,
    providerASRModel: config.provider.asrModel,
    providerTTS: config.provider.tts,
    providerTTSModel: config.provider.ttsModel,
    voiceId: config.voice.id,
    voiceVolume: config.voice.volume,
    voiceSpeechEnabled: config.voice.speechEnabled,
    microphoneId: config.audio.microphoneId,
    characterFile: config.characterFile,
    modelPath: config.live2d.modelPath,
    modelScale: config.live2d.scale,
    modelX: config.live2d.x,
    modelY: config.live2d.y,
    speechBubbleEnabled: config.ui.speechBubbleEnabled,
    proactiveMemoryEnabled: config.ui.proactiveMemoryEnabled
  };
}

export function configFromSettings(settings: DesktopSettingsState): GreyfieldConfig {
  return {
    ...defaultGreyfieldConfig,
    provider: {
      ...defaultGreyfieldConfig.provider,
      llm: settings.providerLLM,
      asr: settings.providerASR,
      baseUrl: settings.providerBaseUrl,
      apiKey: settings.providerApiKey,
      model: settings.providerModel,
      asrModel: settings.providerASRModel,
      tts: settings.providerTTS,
      ttsModel: settings.providerTTSModel
    },
    voice: {
      ...defaultGreyfieldConfig.voice,
      id: settings.voiceId,
      volume: settings.voiceVolume,
      speechEnabled: settings.voiceSpeechEnabled
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
      speechBubbleEnabled: settings.speechBubbleEnabled,
      proactiveMemoryEnabled: settings.proactiveMemoryEnabled
    },
    characterFile: settings.characterFile
  };
}

export function settingsPatchToConfigPatch(patch: DesktopSettingsPatch): GreyfieldConfigPatch {
  const configPatch: GreyfieldConfigPatch = {};
  if (patch.providerModel !== undefined) {
    configPatch.provider = { ...configPatch.provider, model: patch.providerModel };
  }
  if (patch.providerTTS !== undefined) {
    configPatch.provider = { ...configPatch.provider, tts: patch.providerTTS };
  }
  if (patch.providerASR !== undefined) {
    configPatch.provider = { ...configPatch.provider, asr: patch.providerASR };
  }
  if (patch.providerTTSModel !== undefined) {
    configPatch.provider = { ...configPatch.provider, ttsModel: patch.providerTTSModel };
  }
  if (patch.providerASRModel !== undefined) {
    configPatch.provider = { ...configPatch.provider, asrModel: patch.providerASRModel };
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
    configPatch.voice = { ...configPatch.voice, id: patch.voiceId };
  }
  if (patch.voiceVolume !== undefined) {
    configPatch.voice = { ...configPatch.voice, volume: patch.voiceVolume };
  }
  if (patch.voiceSpeechEnabled !== undefined) {
    configPatch.voice = { ...configPatch.voice, speechEnabled: patch.voiceSpeechEnabled };
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
    configPatch.ui = { ...configPatch.ui, speechBubbleEnabled: patch.speechBubbleEnabled };
  }
  if (patch.proactiveMemoryEnabled !== undefined) {
    configPatch.ui = { ...configPatch.ui, proactiveMemoryEnabled: patch.proactiveMemoryEnabled };
  }
  return configPatch;
}
