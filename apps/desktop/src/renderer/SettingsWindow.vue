<template>
  <main class="greyfield-shell">
    <nav class="settings-nav" :aria-label="t('nav.label')">
      <strong>Greyfield</strong>
      <button
        v-for="item in settingsNavItems"
        :key="item.id"
        type="button"
        class="settings-nav__button"
        :class="{ 'settings-nav__button--active': activeSectionId === item.id }"
        :aria-current="activeSectionId === item.id ? 'true' : undefined"
        @click="scrollToSection(item.id)"
      >
        {{ item.label }}
      </button>
      <button type="button" class="settings-nav__button settings-nav__button--chat" @click="$emit('open-chat')">
        {{ t("nav.chat") }}
      </button>
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

    <aside ref="controlSurfaceRef" class="control-surface" @scroll.passive="updateActiveSection">
      <header>
        <h1>Greyfield Next</h1>
        <span class="status-pill" :aria-label="t('app.status')">{{ localizedStageStatus }}</span>
      </header>

      <section class="settings-panel" :aria-label="t('settings.label')">
        <label class="settings-language-select">
          <span>{{ t("settings.language") }}</span>
          <select
            :value="state.settings.settingsLocale"
            autocomplete="off"
            @change="$emit('update-setting', 'settingsLocale', valueFrom($event))"
          >
            <option v-for="locale in settingsLocales" :key="locale.value" :value="locale.value">
              {{ locale.label }}
            </option>
          </select>
        </label>

        <PersonaSettingsSection
          :state="state"
          :locale="locale"
          :aria-label="sectionAriaLabel('persona')"
          :section-ref="setSectionRef('persona')"
          @update-persona-field="forwardPersonaFieldUpdate"
          @save-persona="forwardPersonaSave"
        />

        <ProviderSettingsSection
          :state="state"
          :stage-status="stageStatus"
          :locale="locale"
          :aria-label="sectionAriaLabel('provider')"
          :section-ref="setSectionRef('provider')"
          @update-setting="forwardSettingUpdate"
          @test-llm="$emit('test-llm')"
        />

        <VoiceSettingsSection
          :state="state"
          :stage-status="stageStatus"
          :locale="locale"
          :aria-label="sectionAriaLabel('voice')"
          :section-ref="setSectionRef('voice')"
          @update-setting="forwardSettingUpdate"
          @update-numeric-setting="forwardNumericSettingUpdate"
          @update-boolean-setting="forwardBooleanSettingUpdate"
          @test-voice="$emit('test-voice')"
        />

        <ModelSettingsSection
          :state="state"
          :locale="locale"
          :aria-label="sectionAriaLabel('model')"
          :section-ref="setSectionRef('model')"
          @update-setting="forwardSettingUpdate"
          @choose-model="$emit('choose-model')"
          @reset-transform="$emit('reset-transform')"
        />

        <WindowSettingsSection
          :state="state"
          :locale="locale"
          :aria-label="sectionAriaLabel('window')"
          :section-ref="setSectionRef('window')"
          @update-setting="forwardSettingUpdate"
          @update-numeric-setting="forwardNumericSettingUpdate"
          @update-boolean-setting="forwardBooleanSettingUpdate"
        />

        <div
          id="settings-section-memory"
          :ref="setSectionRef('memory')"
          class="settings-section settings-section--disabled"
          :aria-label="t('section.memoryExtraction')"
          aria-disabled="true"
          data-settings-section="memory"
          tabindex="-1"
        >
          <header class="settings-section__header">
            <h2>{{ t("section.memoryExtraction") }}</h2>
            <span>{{ memoryExtractionStatus.label }}</span>
          </header>
          <div class="memory-library__block" role="note">
            <strong>{{ t("memory.about.title") }}</strong>
            <p>{{ t("memory.about.detail") }}</p>
          </div>
          <label class="memory-extraction-toggle">
            <span>{{ t("field.betterMemory") }}</span>
            <input
              :checked="false"
              :aria-label="t('field.betterMemory')"
              type="checkbox"
              disabled
              @change="$emit('update-boolean-setting', 'llmAtomExtractionEnabled', checkedFrom($event))"
            />
          </label>
          <div
            class="provider-status memory-extraction-status"
            :class="`memory-extraction-status--${memoryExtractionStatus.tone}`"
            role="status"
          >
            <strong>{{ memoryExtractionStatus.label }}</strong>
            <span>{{ memoryExtractionStatus.detail }}</span>
          </div>
        </div>

        <div class="settings-section memory-library" :aria-label="t('section.memoryLibrary')" data-harness="settings-memory-library">
          <header class="settings-section__header">
            <h2>{{ t("section.memoryLibrary") }}</h2>
            <span>{{ memoryLibraryStatusLabel }}</span>
          </header>

          <div class="memory-library__overview-grid">
            <div class="memory-library__block">
              <strong>{{ memoryLibraryHeadline }}</strong>
              <p>{{ memoryLibraryDetail }}</p>
            </div>
            <div class="memory-library__block">
              <strong>{{ t("memory.manage.title") }}</strong>
              <p>{{ t("memory.manage.detail") }}</p>
            </div>
            <div v-if="latestRecallItem" class="memory-library__block memory-library__block--recall">
              <strong>{{ t("memory.lastRecalled") }}</strong>
              <p>{{ recallReasonLabel(latestRecallItem.reason) }}</p>
              <small>{{ recalledSourceLabel(latestRecallItem.sourceTurnIds.length) }}</small>
            </div>
          </div>

          <section
            v-if="selectedSourceDrilldown"
            class="memory-library__drilldown"
            :aria-label="t('memory.source.drilldown')"
            data-harness="memory-source-drilldown"
          >
            <header class="memory-library__drilldown-header">
              <div>
                <small>{{ selectedSourceKindLabel }}</small>
                <h3>{{ selectedSourceTitle }}</h3>
              </div>
              <button type="button" :aria-label="t('memory.source.close')" data-harness="memory-source-close" @click="closeSourceDrilldown">
                {{ t("memory.source.close") }}
              </button>
            </header>
            <p class="memory-library__drilldown-summary">{{ selectedSourceSummary }}</p>

            <div v-if="selectedSourcePassages.length > 0" class="memory-library__source-list">
              <article
                v-for="(passage, index) in selectedSourcePassages"
                :key="`${passage.sessionId}:${passage.turnId}`"
                class="memory-library__source-row"
                :class="`memory-library__source-row--${passage.status}`"
                :aria-label="t('memory.source.passage', { index: index + 1 })"
              >
                <header>
                  <strong>{{ sourcePassageHeading(passage) }}</strong>
                  <span>{{ sourcePassageStatusLabel(passage) }}</span>
                </header>
                <small>{{ sourcePassageMetaLabel(passage) }}</small>
                <p>{{ sourcePassageBody(passage) }}</p>
                <small v-if="sourcePassageShortened(passage)">{{ t("memory.source.longShortened") }}</small>
              </article>
            </div>
            <p v-else class="memory-library__source-empty">{{ t("memory.source.noOriginal") }}</p>

            <div v-if="selectedSummarySource" class="memory-library__drilldown-controls">
              <label class="memory-library__editor">
                <span>{{ t("memory.field.text") }}</span>
                <textarea
                  :aria-label="t('memory.field.text')"
                  :value="memorySummaryDrafts[selectedSummarySource.id] ?? selectedSummarySource.summary"
                  data-harness="memory-summary-text"
                  :data-memory-id="selectedSummarySource.id"
                  rows="3"
                  spellcheck="false"
                  @input="setMemorySummaryDraft(selectedSummarySource.id, $event)"
                />
              </label>
              <label class="memory-library__editor">
                <span>{{ t("memory.field.recallCues") }}</span>
                <input
                  :aria-label="t('memory.field.recallCues')"
                  :value="memoryCueDrafts[selectedSummarySource.id] ?? selectedSummarySource.recallCues.join(', ')"
                  data-harness="memory-summary-cues"
                  :data-memory-id="selectedSummarySource.id"
                  autocomplete="off"
                  spellcheck="false"
                  @input="setMemoryCueDraft(selectedSummarySource.id, $event)"
                />
              </label>
              <div class="memory-library__actions memory-library__actions--drilldown">
                <button
                  type="button"
                  :aria-label="t('memory.action.save')"
                  data-harness="memory-summary-save"
                  :data-memory-id="selectedSummarySource.id"
                  @click="saveMemorySummary(selectedSummarySource)"
                >
                  {{ t("memory.action.save") }}
                </button>
                <button
                  type="button"
                  :aria-label="memoryToggleActionLabel(selectedSummarySource.disabled)"
                  data-harness="memory-summary-toggle"
                  :data-memory-id="selectedSummarySource.id"
                  @click="toggleMemorySummary(selectedSummarySource)"
                >
                  {{ memoryToggleActionLabel(selectedSummarySource.disabled) }}
                </button>
                <button
                  type="button"
                  class="memory-library__danger"
                  :aria-label="t('memory.action.delete')"
                  data-harness="memory-summary-delete"
                  :data-memory-id="selectedSummarySource.id"
                  @click="$emit('memory-summary-delete', { id: selectedSummarySource.id })"
                >
                  {{ t("memory.action.delete") }}
                </button>
              </div>
            </div>

            <div v-else-if="selectedAtomSource" class="memory-library__drilldown-controls">
              <label class="memory-library__editor">
                <span>{{ t("memory.field.text") }}</span>
                <textarea
                  :aria-label="t('memory.field.text')"
                  :value="memoryAtomDrafts[selectedAtomSource.id] ?? selectedAtomSource.text"
                  data-harness="memory-atom-text"
                  :data-memory-id="selectedAtomSource.id"
                  rows="3"
                  spellcheck="false"
                  @input="setMemoryAtomDraft(selectedAtomSource.id, $event)"
                />
              </label>
              <div class="memory-library__actions memory-library__actions--drilldown">
                <button
                  type="button"
                  :aria-label="t('memory.action.save')"
                  data-harness="memory-atom-save"
                  :data-memory-id="selectedAtomSource.id"
                  @click="saveMemoryAtom(selectedAtomSource)"
                >
                  {{ t("memory.action.save") }}
                </button>
                <button
                  type="button"
                  :aria-label="t('memory.action.export')"
                  data-harness="memory-atom-export"
                  :data-memory-id="selectedAtomSource.id"
                  @click="exportMemoryAtom(selectedAtomSource)"
                >
                  {{ t("memory.action.export") }}
                </button>
                <button
                  type="button"
                  :aria-label="memoryToggleActionLabel(selectedAtomSource.disabled)"
                  data-harness="memory-atom-toggle"
                  :data-memory-id="selectedAtomSource.id"
                  @click="toggleMemoryAtom(selectedAtomSource)"
                >
                  {{ memoryToggleActionLabel(selectedAtomSource.disabled) }}
                </button>
                <button
                  type="button"
                  class="memory-library__danger"
                  :aria-label="t('memory.action.delete')"
                  data-harness="memory-atom-delete"
                  :data-memory-id="selectedAtomSource.id"
                  @click="$emit('memory-atom-delete', { id: selectedAtomSource.id })"
                >
                  {{ t("memory.action.delete") }}
                </button>
              </div>
            </div>
          </section>

          <div v-if="memoryLibraryItems.length > 0" class="memory-library__list" :aria-label="t('memory.savedMemories')">
            <article
              v-for="entry in memoryLibraryItems"
              :key="`${entry.kind}:${entry.item.id}`"
              class="memory-library__segment"
              :class="{ 'memory-library__segment--disabled': entry.item.disabled }"
              :aria-label="`${memoryLibraryItemLabel(entry)} ${entry.item.id}`"
              :data-harness="entry.kind === 'summary' ? 'memory-summary-card' : 'memory-atom-card'"
              :data-memory-id="entry.item.id"
              :data-memory-type="memoryLibraryItemType(entry)"
            >
              <header class="memory-library__segment-header">
                <div>
                  <small>{{ memoryLibraryItemLabel(entry) }}</small>
                  <strong>{{ memoryLibraryItemText(entry) }}</strong>
                </div>
                <span>{{ memoryLibraryItemStatus(entry) }}</span>
              </header>

              <dl class="memory-library__meta memory-library__meta--compact">
                <div>
                  <dt>{{ t("memory.meta.source") }}</dt>
                  <dd>{{ memoryLibraryItemSourceLabel(entry) }}</dd>
                </div>
                <div>
                  <dt>{{ t("memory.meta.updated") }}</dt>
                  <dd>{{ memoryLibraryItemUpdatedLabel(entry) }}</dd>
                </div>
              </dl>

              <button
                type="button"
                class="memory-library__source-link"
                :aria-label="t('memory.action.viewSource')"
                data-harness="memory-source-open"
                @click="openMemoryDrilldown(entry)"
              >
                <span>{{ memoryLibraryItemSourceLabel(entry) }}</span>
                <strong>{{ t("memory.action.viewSource") }}</strong>
              </button>
            </article>
          </div>
          <section
            v-if="memoryCoreMemories.length > 0"
            class="memory-library__core"
            :aria-label="t('memory.core.title')"
            data-harness="memory-core-section"
          >
            <h4>{{ t("memory.core.title") }}</h4>
            <article
              v-for="memory in memoryCoreMemories"
              :key="`core:${memory.id}`"
              class="memory-library__segment"
              :class="{ 'memory-library__segment--disabled': memory.disabled }"
              data-harness="memory-core-card"
              :data-memory-id="memory.id"
            >
              <header class="memory-library__segment-header">
                <div>
                  <small>{{ memory.kind === "explicit" ? t("memory.core.kindExplicit") : t("memory.core.kindTopic") }}</small>
                  <strong>{{ memory.text }}</strong>
                </div>
                <span>{{ memoryToggleStateLabel(memory.disabled) + (memory.disabled ? "" : ` · ${t("memory.core.strength", { value: Math.round(memory.strength * 100) })}`) }}</span>
              </header>
              <div class="memory-library__actions">
                <button
                  type="button"
                  :aria-label="memoryToggleActionLabel(memory.disabled)"
                  data-harness="memory-core-toggle"
                  :data-memory-id="memory.id"
                  @click="$emit('memory-core-toggle', { id: memory.id, disabled: !memory.disabled })"
                >
                  {{ memoryToggleActionLabel(memory.disabled) }}
                </button>
                <button
                  type="button"
                  class="memory-library__danger"
                  :aria-label="t('memory.action.delete')"
                  data-harness="memory-core-delete"
                  :data-memory-id="memory.id"
                  @click="$emit('memory-core-delete', { id: memory.id })"
                >
                  {{ t("memory.action.delete") }}
                </button>
              </div>
            </article>
          </section>
          <div v-if="memorySegments.length === 0 && memoryAtoms.length === 0 && memoryCoreMemories.length === 0" class="memory-library__empty">
            {{ t("memory.empty") }}
          </div>
          <p
            v-if="state.memoryDebug.actionMessage"
            class="provider-test-result"
            :class="`provider-test-result--${memoryActionTone}`"
            role="status"
          >
            {{ state.memoryDebug.actionMessage }}
          </p>
          <textarea
            v-if="state.memoryDebug.exportText"
            class="memory-library__export"
            :aria-label="t('memory.export.label')"
            data-harness="memory-library-export-text"
            :value="state.memoryDebug.exportText"
            readonly
            rows="5"
          />
          <div class="settings-actions">
            <button type="button" data-harness="memory-refresh" @click="$emit('refresh-memory-debug')">
              {{ state.memoryDebug.status === "loading" ? t("button.refreshing") : t("button.refreshMemory") }}
            </button>
            <button type="button" data-harness="memory-library-export" @click="$emit('memory-export')">{{ t("button.exportLibrary") }}</button>
            <button type="button" class="memory-library__danger-action" @click="$emit('memory-summary-clear')">
              {{ t("button.clearSummary") }}
            </button>
            <button
              type="button"
              class="memory-library__danger-action"
              data-harness="memory-atom-clear-current-role"
              @click="$emit('memory-atom-clear-current-role')"
            >
              {{ t("button.clearAtoms") }}
            </button>
          </div>
        </div>

        <!-- User Profile Management UI -->
        <div class="settings-section user-profile" :aria-label="t('memory.profile.title')" data-harness="settings-user-profile">
          <header class="settings-section__header">
            <h2>{{ t("memory.profile.title") }}</h2>
            <span>{{ t("memory.profile.count", { count: profileFacts.length }) }}</span>
          </header>

          <div class="user-profile__overview">
            <div class="memory-library__block">
              <strong>{{ t("memory.profile.about.title") }}</strong>
              <p>{{ t("memory.profile.about.detail") }}</p>
            </div>
          </div>

          <details class="user-profile__add-form">
            <summary>{{ t("memory.profile.add.summary") }}</summary>
            <div class="user-profile__form-content">
              <label>
                <span>{{ t("memory.profile.field.category") }}</span>
                <select v-model="newFactCategory">
                  <option value="allergy">{{ t("memory.profile.category.allergy") }}</option>
                  <option value="important-date">{{ t("memory.profile.category.importantDate") }}</option>
                  <option value="identity">{{ t("memory.profile.category.identity") }}</option>
                  <option value="preference">{{ t("memory.profile.category.preference") }}</option>
                  <option value="free-form">{{ t("memory.profile.category.freeForm") }}</option>
                </select>
              </label>
              <label>
                <span>{{ t("memory.profile.field.key") }}</span>
                <input v-model="newFactKey" :placeholder="t('memory.profile.placeholder.key')" />
              </label>
              <label>
                <span>{{ t("memory.profile.field.value") }}</span>
                <input v-model="newFactValue" :placeholder="t('memory.profile.placeholder.value')" />
              </label>
              <button type="button" @click="createProfileFact">{{ t("memory.profile.action.create") }}</button>
            </div>
          </details>

          <section v-if="profileFactsByCategory.allergy && profileFactsByCategory.allergy.length > 0" class="user-profile__category">
            <h3>{{ t("memory.profile.category.allergy") }}</h3>
            <article v-for="fact in profileFactsByCategory.allergy" :key="fact.id" class="user-profile__fact" :class="{ 'user-profile__fact--disabled': fact.disabled }">
              <div class="user-profile__fact-content">
                <strong>{{ fact.key }}</strong>
                <span>{{ fact.value }}</span>
              </div>
              <div class="memory-library__actions">
                <button type="button" @click="toggleProfileFact(fact)">
                  {{ fact.disabled ? t("memory.action.enable") : t("memory.action.disable") }}
                </button>
              </div>
            </article>
          </section>

          <section v-if="profileFactsByCategory['important-date'] && profileFactsByCategory['important-date'].length > 0" class="user-profile__category">
            <h3>{{ t("memory.profile.category.importantDate") }}</h3>
            <article v-for="fact in profileFactsByCategory['important-date']" :key="fact.id" class="user-profile__fact" :class="{ 'user-profile__fact--disabled': fact.disabled }">
              <div class="user-profile__fact-content">
                <strong>{{ fact.key }}</strong>
                <span>{{ fact.value }}</span>
              </div>
              <div class="memory-library__actions">
                <button type="button" @click="toggleProfileFact(fact)">
                  {{ fact.disabled ? t("memory.action.enable") : t("memory.action.disable") }}
                </button>
              </div>
            </article>
          </section>

          <section v-if="profileFactsByCategory.identity && profileFactsByCategory.identity.length > 0" class="user-profile__category">
            <h3>{{ t("memory.profile.category.identity") }}</h3>
            <article v-for="fact in profileFactsByCategory.identity" :key="fact.id" class="user-profile__fact" :class="{ 'user-profile__fact--disabled': fact.disabled }">
              <div class="user-profile__fact-content">
                <strong>{{ fact.key }}</strong>
                <span>{{ fact.value }}</span>
              </div>
              <div class="memory-library__actions">
                <button type="button" @click="toggleProfileFact(fact)">
                  {{ fact.disabled ? t("memory.action.enable") : t("memory.action.disable") }}
                </button>
              </div>
            </article>
          </section>

          <section v-if="profileFactsByCategory.preference && profileFactsByCategory.preference.length > 0" class="user-profile__category">
            <h3>{{ t("memory.profile.category.preference") }}</h3>
            <article v-for="fact in profileFactsByCategory.preference" :key="fact.id" class="user-profile__fact" :class="{ 'user-profile__fact--disabled': fact.disabled }">
              <div class="user-profile__fact-content">
                <strong>{{ fact.key }}</strong>
                <span>{{ fact.value }}</span>
              </div>
              <div class="memory-library__actions">
                <button type="button" @click="toggleProfileFact(fact)">
                  {{ fact.disabled ? t("memory.action.enable") : t("memory.action.disable") }}
                </button>
              </div>
            </article>
          </section>

          <section v-if="profileFactsByCategory['free-form'] && profileFactsByCategory['free-form'].length > 0" class="user-profile__category">
            <h3>{{ t("memory.profile.category.freeFormFacts") }}</h3>
            <article v-for="fact in profileFactsByCategory['free-form']" :key="fact.id" class="user-profile__fact" :class="{ 'user-profile__fact--disabled': fact.disabled }">
              <div class="user-profile__fact-content">
                <strong>{{ fact.key }}</strong>
                <span>{{ fact.value }}</span>
              </div>
              <div class="memory-library__actions">
                <button type="button" @click="toggleProfileFact(fact)">
                  {{ fact.disabled ? t("memory.action.enable") : t("memory.action.disable") }}
                </button>
              </div>
            </article>
          </section>

          <div v-if="profileFacts.length === 0" class="memory-library__empty">
            {{ t("memory.profile.empty") }}
          </div>
        </div>

        <p v-if="state.voiceErrorMessage" class="provider-test-result provider-test-result--error" role="status">
          {{ state.voiceErrorMessage }}
        </p>
      </section>

      <section v-if="modelInfo" class="model-inspector" aria-label="Live2D model info">
        <header>
          <h2>{{ t("section.modelInfo") }}</h2>
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
          {{ t("toggle.modelPassThrough") }}
        </label>
        <label>
          <input :checked="locked" type="checkbox" @change="$emit('update:locked', checkedFrom($event))" />
          {{ t("toggle.lock") }}
        </label>
      </div>

      <div class="audio-strip">
        <span v-for="(item, index) in state.audioQueue" :key="index">{{ item }}</span>
      </div>
    </aside>
  </main>
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from "vue";
import type { DesktopMemoryAtom, DesktopMemorySourcePassage, DesktopMemorySummarySegment } from "../shared/ipc";
import type { DesktopPersonaFormState, DesktopRendererState, DesktopSettingsState } from "./desktop-runtime-bridge";
import Live2DStageView from "./Live2DStageView.vue";
import ModelSettingsSection from "./ModelSettingsSection.vue";
import {
  describeMemorySourceCount,
  describeRecallReason,
  describeSourcePassageBody,
  describeSourcePassageHeading,
  describeSourcePassageMeta,
  describeSourcePassageStatus,
  formatMemoryTimestamp,
  isSourcePassageShortened
} from "./memory-source-display";
import PersonaSettingsSection from "./PersonaSettingsSection.vue";
import ProviderSettingsSection from "./ProviderSettingsSection.vue";
import { checkedFrom, valueFrom } from "./settings-dom-events";
import { describeMemoryExtractionStatus } from "./settings-memory-extraction-status";
import { normalizeSettingsLocale, settingsLocales, settingsT, type SettingsI18nKey } from "./settings-i18n";
import { resolveActiveSettingsSection, settingsNavSectionIds, type SettingsSectionId } from "./settings-nav";
import VoiceSettingsSection from "./VoiceSettingsSection.vue";
import WindowSettingsSection from "./WindowSettingsSection.vue";

type PersonaTextField = Exclude<keyof DesktopPersonaFormState, "expressionMap">;

const props = defineProps<{
  state: DesktopRendererState;
  stageStatus: "idle" | "listening" | "thinking" | "speaking" | "interrupted" | "error";
  modelInfo: { modelPath: string; expressions: string[]; motions: Record<string, number> } | null;
  modelPassThrough: boolean;
  locked: boolean;
}>();

const emit = defineEmits<{
  "update-setting": [key: keyof DesktopSettingsState, value: string];
  "update-numeric-setting": [key: "modelScale" | "modelX" | "modelY" | "voiceVolume" | "proactivityLevel", value: string];
  "update-boolean-setting": [
    key: "speechBubbleEnabled" | "voiceSpeechEnabled" | "proactiveMemoryEnabled" | "llmAtomExtractionEnabled",
    value: boolean
  ];
  "update:model-pass-through": [value: boolean];
  "update:locked": [value: boolean];
  "choose-model": [];
  "reset-transform": [];
  "test-llm": [];
  "test-voice": [];
  "request-persona": [];
  "update-persona-field": [key: PersonaTextField, value: string];
  "save-persona": [form: DesktopPersonaFormState];
  "preview-expression": [expression: string];
  "preview-motion": [group: string];
  "refresh-memory-debug": [];
  "memory-summary-update": [payload: { id: string; summary?: string; recallCues?: string[]; disabled?: boolean }];
  "memory-summary-delete": [payload: { id: string }];
  "memory-summary-clear": [];
  "memory-atom-update": [payload: { id: string; text?: string; disabled?: boolean }];
  "memory-atom-delete": [payload: { id: string }];
  "memory-atom-clear-current-role": [];
  "memory-atom-export": [payload: { id: string }];
  "memory-core-toggle": [payload: { id: string; disabled: boolean }];
  "memory-core-delete": [payload: { id: string }];
  "memory-export": [];
  "open-chat": [];
}>();

const motionCount = computed(() =>
  Object.values(props.modelInfo?.motions ?? {}).reduce((total, count) => total + count, 0)
);
const locale = computed(() => normalizeSettingsLocale(props.state.settings.settingsLocale));
const t = (key: SettingsI18nKey, values?: Record<string, string | number>): string =>
  settingsT(locale.value, key, values);
const localizedStageStatus = computed(() => {
  const key = `status.${props.state.status}` as SettingsI18nKey;
  return settingsT(locale.value, key) === key ? props.state.status : settingsT(locale.value, key);
});
const settingsNavItems = computed<Array<{ id: SettingsSectionId; label: string }>>(() =>
  settingsNavSectionIds.map((id) => ({ id, label: t(`nav.${id}` as SettingsI18nKey) }))
);
const memorySnapshot = computed(() => props.state.memoryDebug.snapshot);
const memoryExtractionStatus = computed(() => describeMemoryExtractionStatus(props.state, locale.value));
const memorySummaryCount = computed(() => memorySnapshot.value?.summarySegments.length ?? 0);
const memorySegments = computed(() => memorySnapshot.value?.summarySegments ?? []);
const memoryAtoms = computed(() => memorySnapshot.value?.memoryAtoms ?? []);
const memoryCoreMemories = computed(() => memorySnapshot.value?.coreMemories ?? []);
const memoryStoredCount = computed(
  () => memorySummaryCount.value + memoryAtoms.value.length + memoryCoreMemories.value.length
);
const memoryLibraryStatusLabel = computed(() => {
  if (props.state.memoryDebug.status === "loading") {
    return t("status.refreshing");
  }
  if (!memorySnapshot.value) {
    return t("status.notLoaded");
  }
  if (memoryStoredCount.value === 0) {
    return t("memory.status.empty");
  }
  return t("memory.stored", { count: memoryStoredCount.value });
});
const memoryLibraryHeadline = computed(() => {
  if (props.state.memoryDebug.status === "loading") {
    return t("memory.status.loading");
  }
  if (!memorySnapshot.value) {
    return t("memory.status.notLoaded");
  }
  if (memoryStoredCount.value === 0) {
    return t("memory.status.empty");
  }
  return t("memory.status.saved", { count: memoryStoredCount.value });
});
const memoryLibraryDetail = computed(() => {
  if (props.state.memoryDebug.status === "loading") {
    return t("memory.status.loading.detail");
  }
  if (!memorySnapshot.value) {
    return t("memory.status.notLoaded.detail");
  }
  if (memoryStoredCount.value === 0) {
    return t("memory.status.empty.detail");
  }
  return t("memory.status.saved.detail", { count: memoryStoredCount.value });
});
const latestRecallItem = computed(() => memorySnapshot.value?.lastRecallContext?.items[0] ?? null);
const memoryAtomTypeConfigKeys: Array<{
  type: DesktopMemoryAtom["type"];
  labelKey: SettingsI18nKey;
  singularKey: SettingsI18nKey;
}> = [
  { type: "fact", labelKey: "memory.type.facts", singularKey: "memory.type.fact" },
  { type: "preference", labelKey: "memory.type.preferences", singularKey: "memory.type.preference" },
  { type: "opinion", labelKey: "memory.type.opinions", singularKey: "memory.type.opinion" },
  { type: "relationship_event", labelKey: "memory.type.relationships", singularKey: "memory.type.relationship" },
  { type: "episodic_scene", labelKey: "memory.type.scenes", singularKey: "memory.type.scene" },
  { type: "promise", labelKey: "memory.type.promises", singularKey: "memory.type.promise" }
];
const memoryAtomTypeConfigs = computed(() =>
  memoryAtomTypeConfigKeys.map((config) => ({
    type: config.type,
    label: t(config.labelKey),
    singular: t(config.singularKey)
  }))
);
type MemoryLibraryItem = { kind: "summary"; item: DesktopMemorySummarySegment } | { kind: "atom"; item: DesktopMemoryAtom };
const memoryLibraryItems = computed<MemoryLibraryItem[]>(() =>
  [
    ...memorySegments.value.map((item) => ({ kind: "summary" as const, item })),
    ...memoryAtoms.value.map((item) => ({ kind: "atom" as const, item }))
  ].sort((left, right) => {
    const leftTime = Date.parse(left.item.updatedAt ?? left.item.createdAt);
    const rightTime = Date.parse(right.item.updatedAt ?? right.item.createdAt);
    return rightTime - leftTime;
  })
);
const memoryActionTone = computed(() => {
  if (props.state.memoryDebug.actionStatus === "error") {
    return "error";
  }
  if (props.state.memoryDebug.actionStatus === "working") {
    return "testing";
  }
  return "success";
});
const memorySummaryDrafts = ref<Record<string, string>>({});
const memoryCueDrafts = ref<Record<string, string>>({});
const memoryAtomDrafts = ref<Record<string, string>>({});
type MemorySourceSelection = { kind: "summary"; id: string } | { kind: "atom"; id: string };
const selectedSource = ref<MemorySourceSelection | null>(null);
const controlSurfaceRef = ref<HTMLElement | null>(null);
const activeSectionId = ref<SettingsSectionId>("model");
const sectionRefs = new Map<SettingsSectionId, HTMLElement>();
const selectedSourceDrilldown = computed(() => {
  if (!selectedSource.value) {
    return null;
  }
  if (selectedSource.value.kind === "summary") {
    const item = memorySegments.value.find((s) => s.id === selectedSource.value?.id);
    return item ? { kind: "summary" as const, item } : null;
  }
  if (selectedSource.value.kind === "atom") {
    const item = memoryAtoms.value.find((a) => a.id === selectedSource.value?.id);
    return item ? { kind: "atom" as const, item } : null;
  }
  return null;
});

// Profile facts state
const profileFacts = ref<Array<{
  id: string;
  category: string;
  key: string;
  value: string;
  createdAt: string;
  disabled: boolean;
}>>([]);

const newFactCategory = ref<"allergy" | "important-date" | "identity" | "preference" | "free-form">("allergy");
const newFactKey = ref("");
const newFactValue = ref("");

const profileFactsByCategory = computed(() => {
  const byCategory: Record<string, typeof profileFacts.value> = {};
  for (const fact of profileFacts.value) {
    if (!byCategory[fact.category]) {
      byCategory[fact.category] = [];
    }
    byCategory[fact.category].push(fact);
  }
  return byCategory;
});

// Profile facts methods
async function loadProfileFacts() {
  window.greyfield.send("profile:get-facts", {});
}

async function toggleProfileFact(fact: typeof profileFacts.value[0]) {
  window.greyfield.send("profile:update-fact", {
    id: fact.id,
    disabled: !fact.disabled
  });
}

async function createProfileFact() {
  if (!newFactKey.value.trim() || !newFactValue.value.trim()) {
    return;
  }
  window.greyfield.send("profile:create-fact", {
    category: newFactCategory.value,
    key: newFactKey.value.trim(),
    value: newFactValue.value.trim()
  });
  newFactKey.value = "";
  newFactValue.value = "";
}

// Listen for profile facts results
window.greyfield.on("profile:facts-result", (facts) => {
  profileFacts.value = facts;
});

window.greyfield.on("profile:action-result", (result) => {
  if (result.ok) {
    loadProfileFacts();
    emit("refresh-memory-debug");
  }
});

const selectedSummarySource = computed(() =>
  selectedSourceDrilldown.value?.kind === "summary" ? selectedSourceDrilldown.value.item : null
);
const selectedAtomSource = computed(() =>
  selectedSourceDrilldown.value?.kind === "atom" ? selectedSourceDrilldown.value.item : null
);
const selectedSourcePassages = computed(() =>
  selectedSourceDrilldown.value ? memorySourcePassages(selectedSourceDrilldown.value.item) : []
);
const selectedSourceKindLabel = computed(() => {
  if (selectedSourceDrilldown.value?.kind === "summary") {
    return t("memory.type.summary");
  }
  if (selectedSourceDrilldown.value?.kind === "atom") {
    return memoryAtomTypeLabel(selectedSourceDrilldown.value.item);
  }
  return "";
});
const selectedSourceTitle = computed(() => {
  if (selectedSourceDrilldown.value?.kind === "summary") {
    return compactMemoryText(selectedSourceDrilldown.value.item.summary);
  }
  if (selectedSourceDrilldown.value?.kind === "atom") {
    return compactMemoryText(selectedSourceDrilldown.value.item.text);
  }
  return "";
});
const selectedSourceSummary = computed(() => {
  if (!selectedSourceDrilldown.value) {
    return "";
  }
  const item = selectedSourceDrilldown.value.item;
  const sourceIds =
    selectedSourceDrilldown.value.kind === "summary" ? summarySourceIds(item) : item.sourceTurnIds;
  return describeMemorySourceCount({
    sourcePassages: memorySourcePassages(item),
    sourceIds
  }, locale.value);
});
onMounted(() => {
  emit("request-persona");
  emit("refresh-memory-debug");
  loadProfileFacts();
  window.addEventListener("resize", updateActiveSection);
  window.addEventListener("scroll", updateActiveSection, { passive: true });
  void nextTick(updateActiveSection);
});

onBeforeUnmount(() => {
  window.removeEventListener("resize", updateActiveSection);
  window.removeEventListener("scroll", updateActiveSection);
});

watch(
  memorySegments,
  (segments) => {
    const nextSummaryDrafts: Record<string, string> = {};
    const nextCueDrafts: Record<string, string> = {};
    for (const segment of segments) {
      nextSummaryDrafts[segment.id] = memorySummaryDrafts.value[segment.id] ?? segment.summary;
      nextCueDrafts[segment.id] = memoryCueDrafts.value[segment.id] ?? segment.recallCues.join(", ");
    }
    memorySummaryDrafts.value = nextSummaryDrafts;
    memoryCueDrafts.value = nextCueDrafts;
  },
  { immediate: true }
);

watch(
  memoryAtoms,
  (atoms) => {
    const nextAtomDrafts: Record<string, string> = {};
    for (const atom of atoms) {
      nextAtomDrafts[atom.id] = memoryAtomDrafts.value[atom.id] ?? atom.text;
    }
    memoryAtomDrafts.value = nextAtomDrafts;
  },
  { immediate: true }
);

watch(
  selectedSourceDrilldown,
  (drilldown) => {
    if (selectedSource.value && !drilldown) {
      selectedSource.value = null;
    }
  },
  { immediate: true }
);

function memoryToggleActionLabel(disabled: boolean): string {
  return disabled ? t("memory.action.enable") : t("memory.action.disable");
}

function sectionAriaLabel(id: SettingsSectionId): string {
  void id;
  return locale.value === "zh-CN" ? "设置分区" : "Settings section";
}

function setSectionRef(id: SettingsSectionId): (element: Element | null) => void {
  return (element) => {
    if (element instanceof HTMLElement) {
      sectionRefs.set(id, element);
      return;
    }
    sectionRefs.delete(id);
  };
}

function scrollToSection(id: SettingsSectionId): void {
  activeSectionId.value = id;
  const section = sectionRefs.get(id);
  if (!section) {
    return;
  }
  section.scrollIntoView({ behavior: "smooth", block: "start" });
  section.focus({ preventScroll: true });
}

function updateActiveSection(): void {
  const sections = settingsNavItems.value.flatMap((item) => {
    const element = sectionRefs.get(item.id);
    return element ? [{ id: item.id, top: element.getBoundingClientRect().top }] : [];
  });
  const nextActiveSection = resolveActiveSettingsSection(
    sections,
    Math.max(controlSurfaceRef.value?.getBoundingClientRect().top ?? 0, 0) + 8
  );
  if (!nextActiveSection) {
    return;
  }
  activeSectionId.value = nextActiveSection;
}

function forwardSettingUpdate(key: keyof DesktopSettingsState, value: string): void {
  emit("update-setting", key, value);
}

function forwardNumericSettingUpdate(
  key: "modelScale" | "modelX" | "modelY" | "voiceVolume" | "proactivityLevel",
  value: string
): void {
  emit("update-numeric-setting", key, value);
}

function forwardBooleanSettingUpdate(
  key: "speechBubbleEnabled" | "voiceSpeechEnabled" | "proactiveMemoryEnabled" | "llmAtomExtractionEnabled",
  value: boolean
): void {
  emit("update-boolean-setting", key, value);
}

function forwardPersonaFieldUpdate(key: PersonaTextField, value: string): void {
  emit("update-persona-field", key, value);
}

function forwardPersonaSave(form: DesktopPersonaFormState): void {
  emit("save-persona", form);
}

function setMemorySummaryDraft(id: string, event: Event): void {
  memorySummaryDrafts.value = {
    ...memorySummaryDrafts.value,
    [id]: valueFrom(event)
  };
}

function setMemoryCueDraft(id: string, event: Event): void {
  memoryCueDrafts.value = {
    ...memoryCueDrafts.value,
    [id]: valueFrom(event)
  };
}

function setMemoryAtomDraft(id: string, event: Event): void {
  memoryAtomDrafts.value = {
    ...memoryAtomDrafts.value,
    [id]: valueFrom(event)
  };
}

function saveMemorySummary(segment: DesktopMemorySummarySegment): void {
  emit("memory-summary-update", {
    id: segment.id,
    summary: memorySummaryDrafts.value[segment.id] ?? segment.summary,
    recallCues: parseMemoryCues(memoryCueDrafts.value[segment.id] ?? segment.recallCues.join(", "))
  });
}

function toggleMemorySummary(segment: DesktopMemorySummarySegment): void {
  emit("memory-summary-update", {
    id: segment.id,
    disabled: !segment.disabled
  });
}

function saveMemoryAtom(atom: DesktopMemoryAtom): void {
  emit("memory-atom-update", {
    id: atom.id,
    text: memoryAtomDrafts.value[atom.id] ?? atom.text
  });
}

function toggleMemoryAtom(atom: DesktopMemoryAtom): void {
  emit("memory-atom-update", {
    id: atom.id,
    disabled: !atom.disabled
  });
}

function exportMemoryAtom(atom: DesktopMemoryAtom): void {
  emit("memory-atom-export", { id: atom.id });
}

function openMemoryDrilldown(entry: MemoryLibraryItem): void {
  selectedSource.value = { kind: entry.kind, id: entry.item.id };
}

function closeSourceDrilldown(): void {
  selectedSource.value = null;
}

function memorySourceLabel(segment: DesktopMemorySummarySegment): string {
  return describeMemorySourceCount({
    sourcePassages: memorySourcePassages(segment),
    sourceIds: summarySourceIds(segment)
  }, locale.value);
}

function memoryUpdatedLabel(segment: DesktopMemorySummarySegment): string {
  return formatMemoryTimestamp(segment.updatedAt ?? segment.createdAt);
}

function memoryAtomTypeLabel(atom: DesktopMemoryAtom): string {
  return memoryAtomTypeConfigs.value.find((config) => config.type === atom.type)?.singular ?? t("memory.type.memory");
}

function memoryAtomSourceLabel(atom: DesktopMemoryAtom): string {
  return describeMemorySourceCount({
    sourcePassages: memorySourcePassages(atom),
    sourceIds: atom.sourceTurnIds
  }, locale.value);
}

function memoryAtomUpdatedLabel(atom: DesktopMemoryAtom): string {
  return formatMemoryTimestamp(atom.updatedAt ?? atom.createdAt);
}

function memoryLibraryItemLabel(entry: MemoryLibraryItem): string {
  return entry.kind === "summary" ? t("memory.type.summary") : memoryAtomTypeLabel(entry.item);
}

function memoryLibraryItemText(entry: MemoryLibraryItem): string {
  return entry.kind === "summary" ? entry.item.summary : entry.item.text;
}

function memoryLibraryItemStatus(entry: MemoryLibraryItem): string {
  return memoryToggleStateLabel(entry.item.disabled);
}

function memoryLibraryItemType(entry: MemoryLibraryItem): DesktopMemoryAtom["type"] | undefined {
  return entry.kind === "atom" ? entry.item.type : undefined;
}

function memoryLibraryItemSourceLabel(entry: MemoryLibraryItem): string {
  return entry.kind === "summary" ? memorySourceLabel(entry.item) : memoryAtomSourceLabel(entry.item);
}

function memoryLibraryItemUpdatedLabel(entry: MemoryLibraryItem): string {
  return entry.kind === "summary" ? memoryUpdatedLabel(entry.item) : memoryAtomUpdatedLabel(entry.item);
}

function memorySourcePassages(item: { sourcePassages?: DesktopMemorySourcePassage[] }): DesktopMemorySourcePassage[] {
  return item.sourcePassages ?? [];
}

function sourcePassageStatusLabel(passage: DesktopMemorySourcePassage): string {
  return describeSourcePassageStatus(passage, locale.value);
}

function sourcePassageHeading(passage: DesktopMemorySourcePassage): string {
  return describeSourcePassageHeading(passage, locale.value);
}

function sourcePassageMetaLabel(passage: DesktopMemorySourcePassage): string {
  return describeSourcePassageMeta(passage, locale.value);
}

function sourcePassageBody(passage: DesktopMemorySourcePassage): string {
  return describeSourcePassageBody(passage, undefined, locale.value);
}

function sourcePassageShortened(passage: DesktopMemorySourcePassage): boolean {
  return isSourcePassageShortened(passage);
}

function summarySourceIds(segment: DesktopMemorySummarySegment): string[] {
  return [...new Set([...segment.sourceTurns.map((turn) => turn.turnId), ...(segment.sourceTurnIds ?? [])])];
}

function compactMemoryText(text: string): string {
  const normalized = text.trim().replace(/\s+/gu, " ");
  if (normalized.length <= 120) {
    return normalized;
  }
  return `${normalized.slice(0, 120).trimEnd()}...`;
}

function recallReasonLabel(reason: string): string {
  return describeRecallReason(reason, locale.value);
}

function recalledSourceLabel(count: number): string {
  if (count <= 0) {
    return locale.value === "zh-CN" ? "上次召回没有关联来源片段" : "No source passages attached to the last recall";
  }
  return locale.value === "zh-CN"
    ? `上次召回关联 ${count} 个来源片段`
    : `${count} source ${count === 1 ? "passage" : "passages"} attached to the last recall`;
}

function memoryToggleStateLabel(disabled: boolean): string {
  return disabled ? t("memory.state.disabled") : t("memory.state.enabled");
}

function parseMemoryCues(text: string): string[] {
  return [...new Set(text.split(/[,，\n]/).map((cue) => cue.trim()).filter(Boolean))];
}
</script>
