import { computed, ref } from "vue";
import type { DesktopPersonaFormState, DesktopRendererState, DesktopSettingsState } from "./desktop-runtime-bridge";
import { createTextSettingPatch } from "./settings-input-patch";
import { useWindowRuntimeBridge } from "./use-window-runtime-bridge";

export function useWindowRuntimeState(params: {
  isPetWindow: boolean;
  isChatWindow: boolean;
  isControlsWindow: boolean;
  queryModelPath: string | null;
}) {
  const { bridge, microphoneRecorder, state, modelInfo, syncState, dispose } = useWindowRuntimeBridge(params);
  const draft = ref("醒了吗？");
  const modelPassThrough = computed(() => state.value.window.modelPassThrough);
  const locked = computed(() => state.value.window.locked);

  function syncDraft(nextState: DesktopRendererState): void {
    if (nextState.inputDraft !== state.value.inputDraft) {
      draft.value = nextState.inputDraft;
    }
    syncState(nextState);
  }

  function sendText(text: string): Promise<DesktopRendererState> {
    return Promise.resolve(bridge.sendText(text));
  }

  function interrupt(): Promise<DesktopRendererState> {
    microphoneRecorder?.cancel();
    return Promise.resolve(bridge.interrupt());
  }

  function startVoiceInput(): Promise<DesktopRendererState> {
    return Promise.resolve(bridge.startVoiceInput());
  }

  function stopVoiceInput(audio?: Uint8Array): Promise<DesktopRendererState> {
    if (!microphoneRecorder) {
      return Promise.resolve(bridge.failVoiceInput("Voice input is available from the pet controls or Chat window."));
    }
    if (audio) {
      return Promise.resolve(bridge.finishVoiceInput(audio));
    }
    return microphoneRecorder.stop().then((nextAudio) => bridge.finishVoiceInput(nextAudio));
  }

  function updateSetting(key: keyof DesktopSettingsState, value: string): Promise<DesktopRendererState> {
    return Promise.resolve(bridge.updateSettings(createTextSettingPatch(state.value.settings, key, value)));
  }

  function updateNumericSetting(
    key: "modelScale" | "modelX" | "modelY" | "voiceVolume" | "proactivityLevel",
    value: string
  ): Promise<DesktopRendererState> | undefined {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) {
      return Promise.resolve(bridge.updateSettings({ [key]: parsed }));
    }
  }

  function updateBooleanSetting(
    key: "speechBubbleEnabled" | "voiceSpeechEnabled" | "proactiveMemoryEnabled" | "llmAtomExtractionEnabled",
    value: boolean
  ): Promise<DesktopRendererState> {
    return Promise.resolve(bridge.updateSettings({ [key]: value }));
  }

  function setModelPassThrough(value: boolean): Promise<DesktopRendererState> {
    window.greyfield?.send("settings:update", { window: { modelPassThrough: value } });
    return Promise.resolve(bridge.setWindowState({ modelPassThrough: value }));
  }

  function setLocked(value: boolean): Promise<DesktopRendererState> {
    return Promise.resolve(bridge.setWindowState({ locked: value }));
  }

  function toggleScreenAwareness(): Promise<DesktopRendererState> {
    return Promise.resolve(bridge.toggleScreenAwareness());
  }

  function chooseModel(): void {
    window.greyfield?.send("stage:choose-model", {});
  }

  function resetTransform(): Promise<DesktopRendererState> {
    return Promise.resolve(bridge.updateSettings({ modelScale: 1, modelX: 0, modelY: 0 }));
  }

  function testLLM(): Promise<DesktopRendererState> { return Promise.resolve(bridge.testLLMProvider()); }
  function testVoice(): Promise<DesktopRendererState> { return Promise.resolve(bridge.testVoiceProvider()); }
  function requestPersona(): Promise<DesktopRendererState> { return Promise.resolve(bridge.requestPersona()); }
  function updatePersonaField(key: Exclude<keyof DesktopPersonaFormState, "expressionMap">, value: string): Promise<DesktopRendererState> {
    return Promise.resolve(bridge.updatePersonaDraft({ ...bridge.getState().persona.form, [key]: value }));
  }
  function savePersona(form: DesktopPersonaFormState): Promise<DesktopRendererState> { return Promise.resolve(bridge.savePersona(form)); }
  function openSettings(): void { window.greyfield?.send("window:open-settings", {}); }
  function openChat(): void { window.greyfield?.send("window:open-chat", {}); }
  function hideControls(): void { window.greyfield?.send("window:hide-controls", {}); }

  return {
    bridge,
    state,
    draft,
    modelInfo,
    modelPassThrough,
    locked,
    syncState: syncDraft,
    sendText,
    interrupt,
    startVoiceInput,
    stopVoiceInput,
    updateSetting,
    updateNumericSetting,
    updateBooleanSetting,
    setModelPassThrough,
    setLocked,
    toggleScreenAwareness,
    chooseModel,
    resetTransform,
    testLLM,
    testVoice,
    requestPersona,
    updatePersonaField,
    savePersona,
    openSettings,
    openChat,
    hideControls,
    dispose
  };
}
