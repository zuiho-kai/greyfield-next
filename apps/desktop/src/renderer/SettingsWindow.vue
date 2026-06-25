<template>
  <main class="greyfield-shell">
    <nav class="settings-nav" aria-label="Settings sections">
      <strong>Greyfield</strong>
      <button type="button">Model</button>
      <button type="button">Voice</button>
      <button type="button">Window</button>
      <button type="button" @click="$emit('open-chat')">Chat</button>
    </nav>
    <section class="stage-surface" :class="{ speaking: state.status === 'speaking' }">
      <Live2DStageView
        :model-path="state.settings.modelPath"
        :mouth-open="state.stage.mouthOpen"
        :status="stageStatus"
        :model-scale="state.settings.modelScale"
        :model-x="state.settings.modelX"
        :model-y="state.settings.modelY"
        :expression="state.stage.expression"
        :motion="state.stage.motion"
      />
    </section>

    <aside class="control-surface">
      <header>
        <h1>Greyfield Next</h1>
        <span class="status-pill">{{ state.status }}</span>
      </header>

      <section class="settings-panel" aria-label="Settings">
        <div class="settings-section">
          <header class="settings-section__header">
            <h2>Provider</h2>
            <span>{{ providerStatus.label }}</span>
          </header>
          <div class="settings-fields">
            <label>
              <span>Provider</span>
              <select
                :value="state.settings.providerLLM"
                autocomplete="off"
                @change="$emit('update-setting', 'providerLLM', valueFrom($event))"
              >
                <option value="fake">Fake preview</option>
                <option value="openai-compatible">OpenAI-compatible</option>
              </select>
            </label>
            <label>
              <span>Base URL</span>
              <input
                :value="state.settings.providerBaseUrl"
                autocomplete="off"
                spellcheck="false"
                @input="$emit('update-setting', 'providerBaseUrl', valueFrom($event))"
              />
            </label>
            <label>
              <span>API Key</span>
              <input
                :value="state.settings.providerApiKey"
                autocomplete="off"
                spellcheck="false"
                :placeholder="state.settings.providerHasApiKey ? 'Saved API key' : ''"
                type="password"
                @input="$emit('update-setting', 'providerApiKey', valueFrom($event))"
              />
            </label>
            <label>
              <span>Model</span>
              <input
                :value="state.settings.providerModel"
                autocomplete="off"
                spellcheck="false"
                @input="$emit('update-setting', 'providerModel', valueFrom($event))"
              />
            </label>
          </div>
          <div class="provider-status" :class="`provider-status--${providerStatus.tone}`" role="status">
            <strong>{{ providerStatus.label }}</strong>
            <span>{{ providerStatus.detail }}</span>
          </div>
          <div class="settings-actions settings-actions--single">
            <button
              type="button"
              class="test-llm-button"
              :class="`test-llm-button--${testLlmAction.tone}`"
              :disabled="testLlmAction.disabled"
              @click="$emit('test-llm')"
            >
              {{ testLlmAction.label }}
            </button>
          </div>
          <p
            v-if="testLlmAction.disableReason"
            class="provider-test-result provider-test-result--error"
            role="status"
          >
            {{ testLlmAction.disableReason }}
          </p>
          <p
            v-else-if="providerTestStatus"
            class="provider-test-result"
            :class="`provider-test-result--${providerTestStatus.tone}`"
            role="status"
          >
            <strong>{{ providerTestStatus.label }}</strong>
            <span>{{ providerTestStatus.detail }}</span>
          </p>
        </div>

        <div class="settings-section">
          <header class="settings-section__header">
            <h2>Voice</h2>
            <span>{{ state.settings.voiceSpeechEnabled ? "On" : "Off" }}</span>
          </header>
          <div class="settings-fields">
            <label>
              <span>ASR</span>
              <select
                :value="state.settings.providerASR"
                autocomplete="off"
                @change="$emit('update-setting', 'providerASR', valueFrom($event))"
              >
                <option value="fake">Fake microphone</option>
                <option value="openai-compatible">OpenAI-compatible</option>
              </select>
            </label>
            <label>
              <span>ASR Model</span>
              <input
                :value="state.settings.providerASRModel"
                autocomplete="off"
                spellcheck="false"
                @input="$emit('update-setting', 'providerASRModel', valueFrom($event))"
              />
            </label>
            <label>
              <span>TTS</span>
              <select
                :value="state.settings.providerTTS"
                autocomplete="off"
                @change="$emit('update-setting', 'providerTTS', valueFrom($event))"
              >
                <option value="fake">Local fallback</option>
                <option value="openai-compatible">OpenAI-compatible</option>
              </select>
            </label>
            <label>
              <span>TTS Model</span>
              <input
                :value="state.settings.providerTTSModel"
                autocomplete="off"
                spellcheck="false"
                @input="$emit('update-setting', 'providerTTSModel', valueFrom($event))"
              />
            </label>
            <label>
              <span>Voice</span>
              <input
                :value="state.settings.voiceId"
                autocomplete="off"
                spellcheck="false"
                @input="$emit('update-setting', 'voiceId', valueFrom($event))"
              />
            </label>
            <label>
              <span>Speak</span>
              <input
                :checked="state.settings.voiceSpeechEnabled"
                aria-label="Speak replies"
                type="checkbox"
                @change="$emit('update-boolean-setting', 'voiceSpeechEnabled', checkedFrom($event))"
              />
            </label>
            <label>
              <span>Volume</span>
              <input
                :value="state.settings.voiceVolume"
                aria-label="Voice volume"
                type="number"
                min="0"
                max="1"
                step="0.05"
                @input="$emit('update-numeric-setting', 'voiceVolume', valueFrom($event))"
              />
            </label>
            <label>
              <span>Mic</span>
              <input
                :value="state.settings.microphoneId"
                autocomplete="off"
                spellcheck="false"
                @input="$emit('update-setting', 'microphoneId', valueFrom($event))"
              />
            </label>
          </div>
          <div class="settings-actions settings-actions--single">
            <button
              type="button"
              class="test-voice-button"
              :class="`test-voice-button--${testVoiceAction.tone}`"
              :disabled="testVoiceAction.disabled"
              @click="$emit('test-voice')"
            >
              {{ testVoiceAction.label }}
            </button>
          </div>
          <p
            v-if="testVoiceAction.disableReason"
            class="provider-test-result provider-test-result--error"
            role="status"
          >
            {{ testVoiceAction.disableReason }}
          </p>
          <p
            v-else-if="voiceTestStatus"
            class="provider-test-result"
            :class="`provider-test-result--${voiceTestStatus.tone}`"
            role="status"
          >
            <strong>{{ voiceTestStatus.label }}</strong>
            <span>{{ voiceTestStatus.detail }}</span>
          </p>
        </div>

        <div class="settings-section">
          <header class="settings-section__header">
            <h2>Live2D</h2>
            <span>{{ currentBundledLive2DModel?.label ?? "Custom" }}</span>
          </header>
          <div class="settings-fields">
            <label>
              <span>Character</span>
              <input
                :value="state.settings.characterFile"
                autocomplete="off"
                spellcheck="false"
                @input="$emit('update-setting', 'characterFile', valueFrom($event))"
              />
            </label>
            <label>
              <span>Model</span>
              <select
                aria-label="Live2D model"
                :value="selectedLive2DModel"
                autocomplete="off"
                @change="selectLive2DModel(valueFrom($event))"
              >
                <option
                  v-for="model in bundledLive2DModels"
                  :key="model.id"
                  :value="model.modelPath"
                  :disabled="!model.supported"
                >
                  {{ model.label }}
                </option>
                <option v-if="isCustomLive2DModel" :value="customLive2DModelValue">Custom model</option>
              </select>
            </label>
          </div>
          <p class="live2d-model-note" role="status">
            {{ live2DModelNote }}
          </p>
          <div class="settings-actions">
            <button type="button" @click="$emit('choose-model')">Import local model</button>
            <button type="button" @click="$emit('reset-transform')">Reset transform</button>
          </div>
        </div>

        <div class="settings-section">
          <header class="settings-section__header">
            <h2>Window</h2>
            <span>{{ state.settings.speechBubbleEnabled ? "Bubble on" : "Bubble off" }}</span>
          </header>
          <div class="settings-fields settings-fields--compact">
            <label>
              <span>Scale</span>
              <input
                :value="state.settings.modelScale"
                aria-label="Scale"
                type="number"
                min="0.2"
                max="3"
                step="0.05"
                @input="$emit('update-numeric-setting', 'modelScale', valueFrom($event))"
              />
            </label>
            <label>
              <span>X</span>
              <input
                :value="state.settings.modelX"
                aria-label="Model X"
                type="number"
                step="1"
                @input="$emit('update-numeric-setting', 'modelX', valueFrom($event))"
              />
            </label>
            <label>
              <span>Y</span>
              <input
                :value="state.settings.modelY"
                aria-label="Model Y"
                type="number"
                step="1"
                @input="$emit('update-numeric-setting', 'modelY', valueFrom($event))"
              />
            </label>
            <label>
              <span>Bubble</span>
              <input
                :checked="state.settings.speechBubbleEnabled"
                aria-label="Speech Bubble"
                type="checkbox"
                @change="$emit('update-boolean-setting', 'speechBubbleEnabled', checkedFrom($event))"
              />
            </label>
          </div>
        </div>

        <p v-if="state.voiceErrorMessage" class="provider-test-result provider-test-result--error" role="status">
          {{ state.voiceErrorMessage }}
        </p>
      </section>

      <section v-if="modelInfo" class="model-inspector" aria-label="Live2D model info">
        <header>
          <h2>Live2D</h2>
          <span>{{ modelInfo.expressions.length }} exp / {{ motionCount }} mot</span>
        </header>
        <div v-if="modelInfo.expressions.length > 0" class="chip-group" aria-label="Expressions">
          <button
            v-for="expression in modelInfo.expressions"
            :key="expression"
            type="button"
            @click="$emit('preview-expression', expression)"
          >
            {{ expression }}
          </button>
        </div>
        <div v-if="Object.keys(modelInfo.motions).length > 0" class="chip-group" aria-label="Motions">
          <button
            v-for="(count, group) in modelInfo.motions"
            :key="group"
            type="button"
            @click="$emit('preview-motion', group)"
          >
            {{ group }} {{ count }}
          </button>
        </div>
      </section>

      <div class="toggles">
        <label>
          <input :checked="modelPassThrough" type="checkbox" @change="$emit('update:model-pass-through', checkedFrom($event))" />
          Model Pass Through
        </label>
        <label>
          <input :checked="locked" type="checkbox" @change="$emit('update:locked', checkedFrom($event))" />
          Lock
        </label>
      </div>

      <div class="audio-strip">
        <span v-for="(item, index) in state.audioQueue" :key="index">{{ item }}</span>
      </div>
    </aside>
  </main>
</template>

<script setup lang="ts">
import { computed } from "vue";
import type { DesktopRendererState, DesktopSettingsState } from "./desktop-runtime-bridge";
import {
  bundledLive2DModels,
  customLive2DModelValue,
  findBundledLive2DModel
} from "./bundled-live2d-models";
import Live2DStageView from "./Live2DStageView.vue";
import { describeProviderStatus } from "./settings-provider-status";
import { describeProviderTestStatus, describeTestLlmAction } from "./settings-test-llm";

const props = defineProps<{
  state: DesktopRendererState;
  stageStatus: "idle" | "listening" | "thinking" | "speaking" | "interrupted" | "error";
  modelInfo: { modelPath: string; expressions: string[]; motions: Record<string, number> } | null;
  modelPassThrough: boolean;
  locked: boolean;
}>();

const emit = defineEmits<{
  "update-setting": [key: keyof DesktopSettingsState, value: string];
  "update-numeric-setting": [key: "modelScale" | "modelX" | "modelY" | "voiceVolume", value: string];
  "update-boolean-setting": [key: "speechBubbleEnabled" | "voiceSpeechEnabled", value: boolean];
  "update:model-pass-through": [value: boolean];
  "update:locked": [value: boolean];
  "choose-model": [];
  "reset-transform": [];
  "test-llm": [];
  "test-voice": [];
  "preview-expression": [expression: string];
  "preview-motion": [group: string];
  "open-chat": [];
}>();

const motionCount = computed(() =>
  Object.values(props.modelInfo?.motions ?? {}).reduce((total, count) => total + count, 0)
);
const providerStatus = computed(() => describeProviderStatus(props.state));
const testLlmAction = computed(() =>
  describeTestLlmAction(
    props.stageStatus,
    props.state.providerTest.status,
    providerStatus.value.tone === "blocked" ? providerStatus.value.detail : ""
  )
);
const providerTestStatus = computed(() => describeProviderTestStatus(props.state.providerTest));
const testVoiceAction = computed(() => describeTestVoiceAction(props.state));
const voiceTestStatus = computed(() => describeVoiceTestStatus(props.state.voiceTest));
const currentBundledLive2DModel = computed(() => findBundledLive2DModel(props.state.settings.modelPath));
const isCustomLive2DModel = computed(() => currentBundledLive2DModel.value === undefined);
const selectedLive2DModel = computed(() =>
  currentBundledLive2DModel.value?.modelPath ?? customLive2DModelValue
);
const live2DModelNote = computed(() => {
  if (currentBundledLive2DModel.value?.note) {
    return currentBundledLive2DModel.value.note;
  }
  if (currentBundledLive2DModel.value) {
    return `Using bundled model: ${currentBundledLive2DModel.value.label}.`;
  }
  return `Using custom model: ${props.state.settings.modelPath}`;
});

function valueFrom(event: Event): string {
  return event.target instanceof HTMLInputElement || event.target instanceof HTMLSelectElement ? event.target.value : "";
}

function checkedFrom(event: Event): boolean {
  return event.target instanceof HTMLInputElement ? event.target.checked : false;
}

function selectLive2DModel(modelPath: string): void {
  if (!modelPath || modelPath === customLive2DModelValue) {
    return;
  }
  const model = findBundledLive2DModel(modelPath);
  if (!model?.supported) {
    return;
  }
  emit("update-setting", "modelPath", model.modelPath);
}

function describeTestVoiceAction(state: DesktopRendererState): {
  disabled: boolean;
  disableReason: string;
  label: string;
  tone: "idle" | "testing" | "blocked";
} {
  if (state.voiceTest.status === "testing") {
    return { disabled: true, disableReason: "", label: "Testing voice...", tone: "testing" };
  }
  const blockedReason = describeVoiceBlockedReason(state);
  if (blockedReason) {
    return { disabled: true, disableReason: blockedReason, label: "Test Voice", tone: "blocked" };
  }
  return { disabled: false, disableReason: "", label: "Test Voice", tone: "idle" };
}

function describeVoiceBlockedReason(state: DesktopRendererState): string {
  if (state.settings.providerTTS !== "openai-compatible") {
    return "";
  }
  if (state.settings.providerBaseUrl.trim().length === 0) {
    return "OpenAI-compatible voice needs a Base URL before testing.";
  }
  if (!state.settings.providerHasApiKey && state.settings.providerApiKey.trim().length === 0) {
    return "Voice test needs an API key.";
  }
  if (state.settings.providerTTSModel.trim().length === 0) {
    return "Choose the TTS model name before testing voice.";
  }
  if (state.settings.voiceId.trim().length === 0) {
    return "Choose the voice before testing.";
  }
  return "";
}

function describeVoiceTestStatus(voiceTest: DesktopRendererState["voiceTest"]): {
  tone: "testing" | "success" | "error";
  label: string;
  detail: string;
} | null {
  if (voiceTest.status === "idle" || voiceTest.message.trim().length === 0) {
    return null;
  }
  if (voiceTest.status === "testing") {
    return { tone: "testing", label: "Testing voice", detail: voiceTest.message };
  }
  if (voiceTest.status === "success") {
    return { tone: "success", label: "Voice test succeeded", detail: voiceTest.message };
  }
  return { tone: "error", label: "Voice test failed", detail: voiceTest.message };
}
</script>
