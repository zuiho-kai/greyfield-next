<template>
  <div
    id="settings-section-model"
    :ref="sectionRef"
    class="settings-section"
    :aria-label="ariaLabel"
    data-settings-section="model"
    tabindex="-1"
  >
    <header class="settings-section__header">
      <h2>{{ t("section.model") }}</h2>
      <span>{{ currentBundledLive2DModel?.label ?? t("status.custom") }}</span>
    </header>
    <div class="settings-fields">
      <label>
        <span>{{ t("field.character") }}</span>
        <input
          :value="state.settings.characterFile"
          autocomplete="off"
          spellcheck="false"
          @input="emit('update-setting', 'characterFile', valueFrom($event))"
        />
      </label>
      <label>
        <span>{{ t("field.model") }}</span>
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
          <option v-if="isCustomLive2DModel" :value="customLive2DModelValue">{{ t("live2d.customModel") }}</option>
        </select>
      </label>
    </div>
    <p class="live2d-model-note" role="status">
      {{ live2DModelNote }}
    </p>
    <div class="settings-actions">
      <button type="button" @click="emit('choose-model')">{{ t("button.importModel") }}</button>
      <button type="button" @click="emit('reset-transform')">{{ t("button.resetTransform") }}</button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from "vue";
import {
  bundledLive2DModels,
  customLive2DModelValue,
  findBundledLive2DModel
} from "./bundled-live2d-models";
import type { DesktopRendererState, DesktopSettingsState } from "./desktop-runtime-bridge";
import { valueFrom } from "./settings-dom-events";
import { settingsT, type SettingsI18nKey, type SettingsLocale } from "./settings-i18n";

const props = defineProps<{
  state: DesktopRendererState;
  locale: SettingsLocale;
  ariaLabel: string;
  sectionRef: (element: Element | null) => void;
}>();

const emit = defineEmits<{
  "update-setting": [key: keyof DesktopSettingsState, value: string];
  "choose-model": [];
  "reset-transform": [];
}>();

const t = (key: SettingsI18nKey, values?: Record<string, string | number>): string =>
  settingsT(props.locale, key, values);
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
    return t("live2d.usingBundled", { label: currentBundledLive2DModel.value.label });
  }
  return t("live2d.usingCustom", { path: props.state.settings.modelPath });
});

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
</script>
