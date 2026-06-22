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
        <label>
          <span>LLM</span>
          <input
            :value="state.settings.providerLLM"
            autocomplete="off"
            spellcheck="false"
            @input="$emit('update-setting', 'providerLLM', valueFrom($event))"
          />
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
        <div class="provider-status" :class="`provider-status--${providerStatus.tone}`" role="status">
          <strong>{{ providerStatus.label }}</strong>
          <span>{{ providerStatus.detail }}</span>
        </div>
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
          <span>Mic</span>
          <input
            :value="state.settings.microphoneId"
            autocomplete="off"
            spellcheck="false"
            @input="$emit('update-setting', 'microphoneId', valueFrom($event))"
          />
        </label>
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
          <span>Live2D</span>
          <input
            :value="state.settings.modelPath"
            autocomplete="off"
            spellcheck="false"
            @input="$emit('update-setting', 'modelPath', valueFrom($event))"
          />
        </label>
        <div class="settings-actions">
          <button type="button" @click="$emit('choose-model')">Choose model</button>
          <button type="button" @click="$emit('reset-transform')">Reset transform</button>
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

defineEmits<{
  "update-setting": [key: keyof DesktopSettingsState, value: string];
  "update-numeric-setting": [key: "modelScale" | "modelX" | "modelY", value: string];
  "update-boolean-setting": [key: "speechBubbleEnabled", value: boolean];
  "update:model-pass-through": [value: boolean];
  "update:locked": [value: boolean];
  "choose-model": [];
  "reset-transform": [];
  "test-llm": [];
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

function valueFrom(event: Event): string {
  return event.target instanceof HTMLInputElement ? event.target.value : "";
}

function checkedFrom(event: Event): boolean {
  return event.target instanceof HTMLInputElement ? event.target.checked : false;
}
</script>
