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
  const { bridge, microphoneRecorder, state, modelInfo, syncState, dispose: disposeBridge } = useWindowRuntimeBridge(params);
  const draft = ref("醒了吗？");
  const lastSyncedInputDraft = ref(state.value.inputDraft);
  const modelPassThrough = computed(() => state.value.window.modelPassThrough);
  const locked = computed(() => state.value.window.locked);

  function applyState(nextState: DesktopRendererState): DesktopRendererState {
    syncDraft(nextState);
    return nextState;
  }

  function syncDraft(nextState: DesktopRendererState): void {
    if (nextState.inputDraft !== lastSyncedInputDraft.value) {
      draft.value = nextState.inputDraft;
      lastSyncedInputDraft.value = nextState.inputDraft;
    }
    syncState(nextState);
  }

  const detachDraftSync = bridge.onStateChange(syncDraft);

  async function sendText(text: string): Promise<DesktopRendererState> {
    return applyState(await bridge.sendText(text));
  }

  async function interrupt(): Promise<DesktopRendererState> {
    microphoneRecorder?.cancel();
    return applyState(await bridge.interrupt());
  }

  async function startVoiceInput(): Promise<DesktopRendererState> {
    if (state.value.nekoPlugin.status === "stopped" || state.value.nekoPlugin.status === "error") {
      window.greyfield?.send("neko:command", { action: "start" });
      return applyState(bridge.getState());
    }
    return applyState(bridge.startVoiceInput());
  }

  async function stopVoiceInput(audio?: Uint8Array): Promise<DesktopRendererState> {
    if (["starting", "connecting", "ready"].includes(state.value.nekoPlugin.status)) {
      window.greyfield?.send("neko:command", { action: "stop" });
      return applyState(bridge.getState());
    }
    if (!microphoneRecorder) {
      return applyState(bridge.failVoiceInput("Voice input is available from the pet controls or Chat window."));
    }
    if (audio) {
      return applyState(await bridge.finishVoiceInput(audio));
    }
    return applyState(await bridge.finishVoiceInput(await microphoneRecorder.stop()));
  }

  function updateSetting(key: keyof DesktopSettingsState, value: string): Promise<DesktopRendererState> {
    return Promise.resolve(applyState(bridge.updateSettings(createTextSettingPatch(state.value.settings, key, value))));
  }

  function updateNumericSetting(
    key:
      | "modelScale"
      | "modelX"
      | "modelY"
      | "voiceVolume"
      | "proactivityLevel"
      | "screenAwarenessRefreshIntervalSeconds"
      | "screenAwarenessStaleAfterSeconds"
      | "screenAwarenessChangeThreshold",
    value: string
  ): Promise<DesktopRendererState> | undefined {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) {
      return Promise.resolve(applyState(bridge.updateSettings({ [key]: parsed })));
    }
  }

  function updateBooleanSetting(
    key: "speechBubbleEnabled" | "voiceSpeechEnabled" | "proactiveMemoryEnabled" | "llmAtomExtractionEnabled",
    value: boolean
  ): Promise<DesktopRendererState> {
    return Promise.resolve(applyState(bridge.updateSettings({ [key]: value })));
  }

  function setModelPassThrough(value: boolean): Promise<DesktopRendererState> {
    window.greyfield?.send("settings:update", { window: { modelPassThrough: value } });
    return Promise.resolve(applyState(bridge.setWindowState({ modelPassThrough: value })));
  }

  function setLocked(value: boolean): Promise<DesktopRendererState> {
    return Promise.resolve(applyState(bridge.setWindowState({ locked: value })));
  }

  function toggleSpeechOutput(): Promise<DesktopRendererState> {
    return updateBooleanSetting("voiceSpeechEnabled", !state.value.settings.voiceSpeechEnabled);
  }

  function toggleScreenAwareness(): Promise<DesktopRendererState> {
    return Promise.resolve(applyState(bridge.toggleScreenAwareness()));
  }

  function chooseModel(): void {
    window.greyfield?.send("stage:choose-model", {});
  }

  function resetTransform(): Promise<DesktopRendererState> {
    return Promise.resolve(applyState(bridge.updateSettings({ modelScale: 1, modelX: 0, modelY: 0 })));
  }

  function testLLM(): Promise<DesktopRendererState> { return Promise.resolve(applyState(bridge.testLLMProvider())); }
  function testVoice(): Promise<DesktopRendererState> { return Promise.resolve(applyState(bridge.testVoiceProvider())); }
  function requestPersona(): Promise<DesktopRendererState> { return Promise.resolve(applyState(bridge.requestPersona())); }
  function updatePersonaField(key: Exclude<keyof DesktopPersonaFormState, "expressionMap">, value: string): Promise<DesktopRendererState> {
    return Promise.resolve(applyState(bridge.updatePersonaDraft({ ...bridge.getState().persona.form, [key]: value })));
  }
  function savePersona(form: DesktopPersonaFormState): Promise<DesktopRendererState> { return Promise.resolve(applyState(bridge.savePersona(form))); }
  function openSettings(): void { window.greyfield?.send("window:open-settings", {}); }
  function openChat(): void { window.greyfield?.send("window:open-chat", {}); }
  function hideControls(): void { window.greyfield?.send("window:hide-controls", {}); }

  function dispose(): void {
    detachDraftSync();
    disposeBridge();
  }

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
    toggleSpeechOutput,
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
