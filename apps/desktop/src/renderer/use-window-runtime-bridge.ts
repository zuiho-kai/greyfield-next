import { ref } from "vue";
import { BrowserMicrophoneRecorder, BrowserSpeechSynthesisOutput } from "@greyfield/audio-runtime";
import { createDesktopRuntimeBridgeWithSpeech, type DesktopRendererState } from "./desktop-runtime-bridge";
import { isMaskedApiKey } from "../shared/secrets";
import { useNekoAudio } from "./use-neko-audio";

export function useWindowRuntimeBridge(params: {
  isPetWindow: boolean;
  isChatWindow: boolean;
  isControlsWindow: boolean;
  queryModelPath: string | null;
}) {
  const bridge = createDesktopRuntimeBridgeWithSpeech(
    typeof window !== "undefined" ? window.greyfield : undefined,
    params.isPetWindow ? new BrowserSpeechSynthesisOutput() : undefined
  );
  const microphoneRecorder = params.isChatWindow || params.isControlsWindow ? new BrowserMicrophoneRecorder() : undefined;
  const initialState = bridge.getState();
  if (params.queryModelPath) {
    initialState.settings.modelPath = params.queryModelPath;
    bridge.updateSettings({ modelPath: params.queryModelPath });
  }

  const state = ref<DesktopRendererState>(initialState);
  const modelInfo = ref<{ modelPath: string; expressions: string[]; motions: Record<string, number> } | null>(null);
  const detachHostListeners: Array<() => void> = [];
  const detachNekoAudio = useNekoAudio(params.isPetWindow, (value) => { state.value.stage.mouthOpen = value; }, () => state.value.settings.voiceVolume);

  detachHostListeners.push(bridge.onStateChange((nextState) => syncState(nextState)));

  if (typeof window !== "undefined") {
    const detachWindowState = window.greyfield?.on("window:state", (windowState) => {
      Object.assign(state.value.window, windowState);
    });
    const detachSettings = window.greyfield?.on("settings:changed", (config) => {
      Object.assign(state.value.settings, {
        providerModel: config.provider.model,
        providerVisionModel: config.provider.visionModel,
        providerPlannerModel: config.provider.taskModels.planner,
        providerUtilityModel: config.provider.taskModels.utility,
        providerMemoryModel: config.provider.taskModels.memory,
        providerMultimodalModel: config.provider.taskModels.multimodal,
        providerLLM: config.provider.llm,
        providerASR: config.provider.asr,
        providerASRModel: config.provider.asrModel,
        providerTTS: config.provider.tts,
        providerTTSModel: config.provider.ttsModel,
        providerBaseUrl: config.provider.baseUrl,
        providerApiKey: isMaskedApiKey(config.provider.apiKey) ? state.value.settings.providerApiKey : config.provider.apiKey,
        providerHasApiKey: config.provider.hasApiKey,
        voiceId: config.voice.id,
        voiceVolume: config.voice.volume,
        voiceSpeechEnabled: config.voice.speechEnabled,
        microphoneId: config.audio.microphoneId,
        characterFile: config.characterFile,
        modelPath: config.live2d.modelPath,
        modelScale: config.live2d.scale,
        modelX: config.live2d.x,
        modelY: config.live2d.y,
        windowLayerMode: config.window.layerMode,
        speechBubbleEnabled: config.ui.speechBubbleEnabled,
        proactiveMemoryEnabled: config.ui.proactiveMemoryEnabled,
        settingsLocale: config.ui.locale,
        proactivityLevel: config.ui.proactivityLevel,
        llmAtomExtractionEnabled: config.memory.llmAtomExtractionEnabled
      });
      state.value.window.modelPassThrough = config.window.modelPassThrough;
    });
    const detachModelInfo = window.greyfield?.on("stage:model-info", (info) => {
      modelInfo.value = info;
    });
    if (detachWindowState) detachHostListeners.push(detachWindowState);
    if (detachSettings) detachHostListeners.push(detachSettings);
    if (detachModelInfo) detachHostListeners.push(detachModelInfo);
  }

  function syncState(nextState: DesktopRendererState): void {
    state.value = nextState;
  }

  function dispose(): void {
    detachNekoAudio();
    microphoneRecorder?.cancel();
    for (const detach of detachHostListeners) detach();
  }

  return { bridge, microphoneRecorder, state, modelInfo, syncState, dispose };
}
