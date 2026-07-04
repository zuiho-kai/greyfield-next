<template>
  <div
    id="settings-section-window"
    :ref="sectionRef"
    class="settings-section"
    :aria-label="ariaLabel"
    data-settings-section="window"
    tabindex="-1"
  >
    <header class="settings-section__header">
      <h2>{{ t("section.window") }}</h2>
      <span>{{ t("status.proactivity", { level: state.settings.proactivityLevel }) }}</span>
    </header>
    <div class="settings-fields settings-fields--compact">
      <label>
        <span>{{ t("field.scale") }}</span>
        <input
          :value="state.settings.modelScale"
          aria-label="Scale"
          type="number"
          min="0.2"
          max="3"
          step="0.05"
          @input="emit('update-numeric-setting', 'modelScale', valueFrom($event))"
        />
      </label>
      <label>
        <span>X</span>
        <input
          :value="state.settings.modelX"
          aria-label="Model X"
          type="number"
          step="1"
          @input="emit('update-numeric-setting', 'modelX', valueFrom($event))"
        />
      </label>
      <label>
        <span>Y</span>
        <input
          :value="state.settings.modelY"
          aria-label="Model Y"
          type="number"
          step="1"
          @input="emit('update-numeric-setting', 'modelY', valueFrom($event))"
        />
      </label>
      <label>
        <span>{{ t("field.bubble") }}</span>
        <input
          :checked="state.settings.speechBubbleEnabled"
          aria-label="Speech Bubble"
          type="checkbox"
          @change="emit('update-boolean-setting', 'speechBubbleEnabled', checkedFrom($event))"
        />
      </label>
      <label>
        <span>{{ t("field.rememberedMoments") }}</span>
        <input
          :checked="state.settings.proactiveMemoryEnabled"
          aria-label="Remembered moments"
          type="checkbox"
          @change="emit('update-boolean-setting', 'proactiveMemoryEnabled', checkedFrom($event))"
        />
      </label>
    </div>
    <label class="settings-slider-row">
      <span>{{ t("field.windowLayerMode") }}</span>
      <div class="settings-slider-row__control">
        <select
          :value="state.settings.windowLayerMode"
          :aria-label="t('field.windowLayerMode')"
          @change="emit('update-setting', 'windowLayerMode', valueFrom($event))"
        >
          <option value="follow-click">{{ t("windowLayerMode.followClick") }}</option>
          <option value="controls-front">{{ t("windowLayerMode.controlsFront") }}</option>
          <option value="pet-front">{{ t("windowLayerMode.petFront") }}</option>
        </select>
      </div>
    </label>
    <label class="settings-slider-row">
      <span>{{ t("field.proactivity") }}</span>
      <div class="settings-slider-row__control">
        <input
          :value="state.settings.proactivityLevel"
          :aria-label="t('field.proactivity')"
          data-testid="proactivity-level-slider"
          type="range"
          min="0"
          max="100"
          step="1"
          @input="emit('update-numeric-setting', 'proactivityLevel', valueFrom($event))"
        />
        <output>{{ state.settings.proactivityLevel }}</output>
      </div>
    </label>
  </div>
</template>

<script setup lang="ts">
import type { DesktopRendererState, DesktopSettingsState } from "./desktop-runtime-bridge";
import { checkedFrom, valueFrom } from "./settings-dom-events";
import { settingsT, type SettingsI18nKey, type SettingsLocale } from "./settings-i18n";

const props = defineProps<{
  state: DesktopRendererState;
  locale: SettingsLocale;
  ariaLabel: string;
  sectionRef: (element: Element | null) => void;
}>();

const emit = defineEmits<{
  "update-setting": [key: keyof DesktopSettingsState, value: string];
  "update-numeric-setting": [key: "modelScale" | "modelX" | "modelY" | "proactivityLevel", value: string];
  "update-boolean-setting": [key: "speechBubbleEnabled" | "proactiveMemoryEnabled", value: boolean];
}>();

const t = (key: SettingsI18nKey, values?: Record<string, string | number>): string =>
  settingsT(props.locale, key, values);
</script>
