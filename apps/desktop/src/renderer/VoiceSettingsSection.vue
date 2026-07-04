<template>
  <div
    id="settings-section-voice"
    :ref="sectionRef"
    class="settings-section"
    :aria-label="ariaLabel"
    data-settings-section="voice"
    tabindex="-1"
  >
    <header class="settings-section__header">
      <h2>{{ t("section.voice") }}</h2>
      <span>{{ state.settings.voiceSpeechEnabled ? t("status.on") : t("status.off") }}</span>
    </header>
    <div class="settings-fields">
      <label>
        <span>{{ t("field.asr") }}</span>
        <select
          :value="state.settings.providerASR"
          autocomplete="off"
          @change="emit('update-setting', 'providerASR', valueFrom($event))"
        >
          <option value="fake">Fake microphone</option>
          <option value="openai-compatible">{{ t("provider.openaiCompatible") }}</option>
        </select>
      </label>
      <label>
        <span>{{ t("field.asrModel") }}</span>
        <input
          :value="state.settings.providerASRModel"
          autocomplete="off"
          spellcheck="false"
          @input="emit('update-setting', 'providerASRModel', valueFrom($event))"
        />
      </label>
      <label>
        <span>{{ t("field.tts") }}</span>
        <select
          :value="state.settings.providerTTS"
          autocomplete="off"
          @change="emit('update-setting', 'providerTTS', valueFrom($event))"
        >
          <option value="fake">{{ t("provider.localFallback") }}</option>
          <option value="openai-compatible">{{ t("provider.openaiCompatible") }}</option>
        </select>
      </label>
      <label>
        <span>{{ t("field.ttsModel") }}</span>
        <input
          :value="state.settings.providerTTSModel"
          autocomplete="off"
          spellcheck="false"
          @input="emit('update-setting', 'providerTTSModel', valueFrom($event))"
        />
      </label>
      <label>
        <span>{{ t("field.voice") }}</span>
        <input
          :value="state.settings.voiceId"
          autocomplete="off"
          spellcheck="false"
          @input="emit('update-setting', 'voiceId', valueFrom($event))"
        />
      </label>
      <label>
        <span>{{ t("field.speak") }}</span>
        <input
          :checked="state.settings.voiceSpeechEnabled"
          aria-label="Speak replies"
          type="checkbox"
          @change="emit('update-boolean-setting', 'voiceSpeechEnabled', checkedFrom($event))"
        />
      </label>
      <label>
        <span>{{ t("field.volume") }}</span>
        <input
          :value="state.settings.voiceVolume"
          aria-label="Voice volume"
          type="number"
          min="0"
          max="1"
          step="0.05"
          @input="emit('update-numeric-setting', 'voiceVolume', valueFrom($event))"
        />
      </label>
      <label>
        <span>{{ t("field.mic") }}</span>
        <input
          :value="state.settings.microphoneId"
          autocomplete="off"
          spellcheck="false"
          @input="emit('update-setting', 'microphoneId', valueFrom($event))"
        />
      </label>
    </div>
    <div class="settings-actions settings-actions--single">
      <button
        type="button"
        class="test-voice-button"
        :class="`test-voice-button--${testVoiceAction.tone}`"
        :disabled="testVoiceAction.disabled"
        @click="startTestVoice"
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
</template>

<script setup lang="ts">
import { computed, ref, watch } from "vue";
import type { DesktopRendererState, DesktopSettingsState } from "./desktop-runtime-bridge";
import { checkedFrom, valueFrom } from "./settings-dom-events";
import { settingsT, type SettingsI18nKey, type SettingsLocale } from "./settings-i18n";
import { describeTestVoiceAction } from "./settings-test-llm";

const props = defineProps<{
  state: DesktopRendererState;
  stageStatus: "idle" | "listening" | "thinking" | "speaking" | "interrupted" | "error";
  locale: SettingsLocale;
  ariaLabel: string;
  sectionRef: (element: Element | null) => void;
}>();

const emit = defineEmits<{
  "update-setting": [key: keyof DesktopSettingsState, value: string];
  "update-numeric-setting": [key: "voiceVolume", value: string];
  "update-boolean-setting": [key: "voiceSpeechEnabled", value: boolean];
  "test-voice": [];
}>();

const t = (key: SettingsI18nKey, values?: Record<string, string | number>): string =>
  settingsT(props.locale, key, values);
const pendingVoiceTestBaseline = ref<string | null>(null);
const testVoiceAction = computed(() =>
  describeTestVoiceAction(
    props.stageStatus,
    displayedVoiceTest.value.status,
    describeVoiceBlockedReason(props.state),
    props.locale
  )
);
const voiceTestSignature = computed(() => `${props.state.voiceTest.status}:${props.state.voiceTest.message}`);
const displayedVoiceTest = computed<DesktopRendererState["voiceTest"]>(() =>
  pendingVoiceTestBaseline.value && voiceTestSignature.value === pendingVoiceTestBaseline.value
    ? { status: "testing", message: "Testing voice provider..." }
    : props.state.voiceTest
);
const voiceTestStatus = computed(() => describeVoiceTestStatus(displayedVoiceTest.value));

watch(voiceTestSignature, (signature) => {
  if (pendingVoiceTestBaseline.value && signature !== pendingVoiceTestBaseline.value) {
    pendingVoiceTestBaseline.value = null;
  }
});

function startTestVoice(): void {
  pendingVoiceTestBaseline.value = voiceTestSignature.value;
  emit("test-voice");
}

function describeVoiceBlockedReason(state: DesktopRendererState): string {
  if (state.settings.providerTTS !== "openai-compatible") {
    return "";
  }
  if (state.settings.providerBaseUrl.trim().length === 0) {
    return t("voice.blocked.baseUrl");
  }
  if (!state.settings.providerHasApiKey && state.settings.providerApiKey.trim().length === 0) {
    return t("voice.blocked.apiKey");
  }
  if (state.settings.providerTTSModel.trim().length === 0) {
    return t("voice.blocked.ttsModel");
  }
  if (state.settings.voiceId.trim().length === 0) {
    return t("voice.blocked.voice");
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
    return { tone: "testing", label: t("voice.status.testing"), detail: t("voice.status.testingDetail") };
  }
  if (voiceTest.status === "success") {
    return { tone: "success", label: t("test.voice.succeeded"), detail: voiceTest.message };
  }
  return { tone: "error", label: t("test.voice.failed"), detail: voiceTest.message };
}
</script>
