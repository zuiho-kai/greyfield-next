<template>
  <div
    id="settings-section-persona"
    :ref="sectionRef"
    class="settings-section persona-editor"
    :aria-label="ariaLabel"
    data-settings-section="persona"
    tabindex="-1"
  >
    <header class="settings-section__header">
      <h2>{{ t("section.persona") }}</h2>
      <span>{{ personaStatusLabel }}</span>
    </header>
    <div class="settings-fields">
      <label>
        <span>{{ t("field.name") }}</span>
        <input
          aria-label="Greyfield name"
          :value="personaDraft.name"
          :disabled="personaFieldsDisabled"
          autocomplete="off"
          spellcheck="false"
          @input="setPersonaDraft('name', valueFrom($event))"
        />
      </label>
      <label>
        <span>{{ t("field.user") }}</span>
        <input
          aria-label="User address"
          :value="personaDraft.userAddress"
          :disabled="personaFieldsDisabled"
          autocomplete="off"
          spellcheck="false"
          @input="setPersonaDraft('userAddress', valueFrom($event))"
        />
      </label>
    </div>
    <div class="settings-fields settings-fields--stacked">
      <label>
        <span>{{ t("field.personality") }}</span>
        <textarea
          aria-label="Personality"
          :value="personaDraft.personality"
          :disabled="personaFieldsDisabled"
          rows="3"
          spellcheck="false"
          @input="setPersonaDraft('personality', valueFrom($event))"
        />
      </label>
      <label>
        <span>{{ t("field.speakingStyle") }}</span>
        <textarea
          aria-label="Speaking style"
          :value="personaDraft.speakingStyle"
          :disabled="personaFieldsDisabled"
          rows="3"
          spellcheck="false"
          @input="setPersonaDraft('speakingStyle', valueFrom($event))"
        />
      </label>
      <label>
        <span>{{ t("field.boundaries") }}</span>
        <textarea
          aria-label="Boundaries"
          :value="personaDraft.boundariesText"
          :disabled="personaFieldsDisabled"
          rows="4"
          spellcheck="false"
          @input="setPersonaDraft('boundariesText', valueFrom($event))"
        />
      </label>
      <label>
        <span>{{ t("field.greeting") }}</span>
        <textarea
          aria-label="Greeting"
          :value="personaDraft.greeting"
          :disabled="personaFieldsDisabled"
          rows="2"
          spellcheck="false"
          @input="setPersonaDraft('greeting', valueFrom($event))"
        />
      </label>
    </div>
    <div class="settings-actions settings-actions--single">
      <button
        type="button"
        class="persona-save-button"
        :disabled="personaSaveDisabled"
        @click="emit('save-persona', personaDraft)"
      >
        {{ state.persona.status === "saving" ? t("button.saving") : t("button.savePersona") }}
      </button>
    </div>
    <p
      v-if="state.persona.message"
      class="provider-test-result"
      :class="`provider-test-result--${personaStatusTone}`"
      role="status"
    >
      {{ state.persona.message }}
    </p>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch } from "vue";
import type { DesktopPersonaFormState, DesktopRendererState } from "./desktop-runtime-bridge";
import { valueFrom } from "./settings-dom-events";
import { settingsT, type SettingsI18nKey, type SettingsLocale } from "./settings-i18n";

type PersonaTextField = Exclude<keyof DesktopPersonaFormState, "expressionMap">;

const props = defineProps<{
  state: DesktopRendererState;
  locale: SettingsLocale;
  ariaLabel: string;
  sectionRef: (element: Element | null) => void;
}>();

const emit = defineEmits<{
  "update-persona-field": [key: PersonaTextField, value: string];
  "save-persona": [form: DesktopPersonaFormState];
}>();

const t = (key: SettingsI18nKey, values?: Record<string, string | number>): string =>
  settingsT(props.locale, key, values);

const personaStatusLabel = computed(() => {
  if (props.state.persona.status === "loading") {
    return t("status.loading");
  }
  if (props.state.persona.status === "saving") {
    return t("status.saving");
  }
  if (props.state.persona.status === "saved") {
    return t("status.saved");
  }
  if (props.state.persona.status === "error") {
    return t("status.needsFix");
  }
  return t("status.ready");
});
const personaStatusTone = computed(() => (props.state.persona.status === "error" ? "error" : "success"));
const personaSaveDisabled = computed(
  () => props.state.persona.status === "loading" || props.state.persona.status === "saving"
);
const personaFieldsDisabled = computed(() => props.state.persona.status === "loading" || props.state.persona.status === "saving");
const personaDraft = ref<DesktopPersonaFormState>({ ...props.state.persona.form });
const personaDraftDirty = ref(false);

watch(
  () => props.state.persona.form,
  (form) => {
    if (props.state.persona.status === "saved") {
      personaDraftDirty.value = false;
    }
    if (props.state.persona.status !== "saving" && (!personaDraftDirty.value || props.state.persona.status === "saved")) {
      personaDraft.value = { ...form, expressionMap: { ...form.expressionMap } };
    }
  },
  { immediate: true }
);

watch(
  () => props.state.persona.path,
  () => {
    personaDraftDirty.value = false;
    personaDraft.value = { ...props.state.persona.form, expressionMap: { ...props.state.persona.form.expressionMap } };
  }
);

function setPersonaDraft(key: PersonaTextField, value: string): void {
  personaDraftDirty.value = true;
  personaDraft.value = {
    ...personaDraft.value,
    [key]: value
  };
  emit("update-persona-field", key, value);
}
</script>
