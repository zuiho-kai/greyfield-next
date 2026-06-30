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

        <div
          id="settings-section-persona"
          :ref="setSectionRef('persona')"
          class="settings-section persona-editor"
          :aria-label="sectionAriaLabel('persona')"
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
              @click="$emit('save-persona', personaDraft)"
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

        <div
          id="settings-section-provider"
          :ref="setSectionRef('provider')"
          class="settings-section"
          :aria-label="sectionAriaLabel('provider')"
          data-settings-section="provider"
          tabindex="-1"
        >
          <header class="settings-section__header">
            <h2>{{ t("section.provider") }}</h2>
            <span>{{ providerStatus.label }}</span>
          </header>
          <div class="settings-fields">
            <label>
              <span>{{ t("field.provider") }}</span>
              <select
                :value="state.settings.providerLLM"
                autocomplete="off"
                @change="$emit('update-setting', 'providerLLM', valueFrom($event))"
              >
                <option value="fake">{{ t("provider.fakePreview") }}</option>
                <option value="openai-compatible">{{ t("provider.openaiCompatible") }}</option>
              </select>
            </label>
            <label>
              <span>{{ t("field.baseUrl") }}</span>
              <input
                :value="state.settings.providerBaseUrl"
                autocomplete="off"
                spellcheck="false"
                @input="$emit('update-setting', 'providerBaseUrl', valueFrom($event))"
              />
            </label>
            <label>
              <span>{{ t("field.apiKey") }}</span>
              <input
                :value="state.settings.providerApiKey"
                autocomplete="off"
                spellcheck="false"
                :placeholder="state.settings.providerHasApiKey ? t('provider.savedApiKey') : ''"
                type="password"
                @input="$emit('update-setting', 'providerApiKey', valueFrom($event))"
              />
            </label>
            <label>
              <span>{{ t("field.model") }}</span>
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

        <div
          id="settings-section-voice"
          :ref="setSectionRef('voice')"
          class="settings-section"
          :aria-label="sectionAriaLabel('voice')"
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
                @change="$emit('update-setting', 'providerASR', valueFrom($event))"
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
                @input="$emit('update-setting', 'providerASRModel', valueFrom($event))"
              />
            </label>
            <label>
              <span>{{ t("field.tts") }}</span>
              <select
                :value="state.settings.providerTTS"
                autocomplete="off"
                @change="$emit('update-setting', 'providerTTS', valueFrom($event))"
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
                @input="$emit('update-setting', 'providerTTSModel', valueFrom($event))"
              />
            </label>
            <label>
              <span>{{ t("field.voice") }}</span>
              <input
                :value="state.settings.voiceId"
                autocomplete="off"
                spellcheck="false"
                @input="$emit('update-setting', 'voiceId', valueFrom($event))"
              />
            </label>
            <label>
              <span>{{ t("field.speak") }}</span>
              <input
                :checked="state.settings.voiceSpeechEnabled"
                aria-label="Speak replies"
                type="checkbox"
                @change="$emit('update-boolean-setting', 'voiceSpeechEnabled', checkedFrom($event))"
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
                @input="$emit('update-numeric-setting', 'voiceVolume', valueFrom($event))"
              />
            </label>
            <label>
              <span>{{ t("field.mic") }}</span>
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

        <div
          id="settings-section-model"
          :ref="setSectionRef('model')"
          class="settings-section"
          :aria-label="sectionAriaLabel('model')"
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
                @input="$emit('update-setting', 'characterFile', valueFrom($event))"
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
            <button type="button" @click="$emit('choose-model')">{{ t("button.importModel") }}</button>
            <button type="button" @click="$emit('reset-transform')">{{ t("button.resetTransform") }}</button>
          </div>
        </div>

        <div
          id="settings-section-window"
          :ref="setSectionRef('window')"
          class="settings-section"
          :aria-label="sectionAriaLabel('window')"
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
              <span>{{ t("field.bubble") }}</span>
              <input
                :checked="state.settings.speechBubbleEnabled"
                aria-label="Speech Bubble"
                type="checkbox"
                @change="$emit('update-boolean-setting', 'speechBubbleEnabled', checkedFrom($event))"
              />
            </label>
            <label>
              <span>{{ t("field.rememberedMoments") }}</span>
              <input
                :checked="state.settings.proactiveMemoryEnabled"
                aria-label="Remembered moments"
                type="checkbox"
                @change="$emit('update-boolean-setting', 'proactiveMemoryEnabled', checkedFrom($event))"
              />
            </label>
          </div>
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
                @input="$emit('update-numeric-setting', 'proactivityLevel', valueFrom($event))"
              />
              <output>{{ state.settings.proactivityLevel }}</output>
            </div>
          </label>
        </div>

        <div
          id="settings-section-memory"
          :ref="setSectionRef('memory')"
          class="settings-section"
          :aria-label="t('section.memoryExtraction')"
          data-settings-section="memory"
          tabindex="-1"
        >
          <header class="settings-section__header">
            <h2>{{ t("section.memoryExtraction") }}</h2>
            <span>{{ memoryExtractionStatus.label }}</span>
          </header>
          <label class="memory-extraction-toggle">
            <span>{{ t("field.betterMemory") }}</span>
            <input
              :checked="state.settings.llmAtomExtractionEnabled"
              aria-label="Better memory extraction"
              type="checkbox"
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

          <div class="memory-library__privacy" role="note">
            <strong>{{ t("memory.controls.title") }}</strong>
            <span>{{ t("memory.controls.detail") }}</span>
          </div>

          <div class="memory-library__lanes" :aria-label="t('memory.types.label')">
            <span
              v-for="lane in memoryTypeLanes"
              :key="lane.label"
              class="memory-library__lane"
            >
              <strong>{{ lane.label }}</strong>
              <small>{{ lane.detail }}</small>
            </span>
          </div>

          <div class="memory-library__stats">
            <span>{{ t("memory.stats.rawTurns", { count: memoryRawCount }) }}</span>
            <span>{{ t("memory.stats.enabled", { count: memoryEnabledCount }) }}</span>
            <span>{{ t("memory.stats.disabled", { count: memoryDisabledCount }) }}</span>
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
                <button type="button" :aria-label="t('button.exportLibrary')" data-harness="memory-library-export" @click="$emit('memory-export')">
                  {{ t("button.exportLibrary") }}
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

          <div v-if="memorySegments.length > 0" class="memory-library__list" :aria-label="t('memory.summaryMemories')">
            <article
              v-for="segment in memorySegments"
              :key="segment.id"
              class="memory-library__segment"
              :class="{ 'memory-library__segment--disabled': segment.disabled }"
              :aria-label="`${t('memory.summaryMemory')} ${segment.id}`"
              data-harness="memory-summary-card"
              :data-memory-id="segment.id"
            >
              <header class="memory-library__segment-header">
                <div>
                  <small>{{ t("memory.summaryMemory") }}</small>
                  <strong>{{ segment.summary }}</strong>
                </div>
                <span>{{ memorySegmentStatus(segment) }}</span>
              </header>

              <dl class="memory-library__meta">
                <div>
                  <dt>{{ t("memory.meta.source") }}</dt>
                  <dd>{{ memorySourceLabel(segment) }}</dd>
                </div>
                <div>
                  <dt>{{ t("memory.meta.lastUsed") }}</dt>
                  <dd>{{ memoryLastUsedLabel(segment) }}</dd>
                </div>
                <div>
                  <dt>{{ t("memory.meta.updated") }}</dt>
                  <dd>{{ memoryUpdatedLabel(segment) }}</dd>
                </div>
              </dl>

              <button
                type="button"
                class="memory-library__source-link"
                :aria-label="t('memory.action.viewSource')"
                data-harness="memory-source-open"
                @click="openSummarySourceDrilldown(segment)"
              >
                <span>{{ memorySourceLabel(segment) }}</span>
                <strong>{{ t("memory.action.viewSource") }}</strong>
              </button>

              <label class="memory-library__editor">
                <span>{{ t("memory.field.text") }}</span>
                <textarea
                  :aria-label="`${t('memory.field.text')} ${segment.id}`"
                  :value="memorySummaryDrafts[segment.id] ?? segment.summary"
                  data-harness="memory-summary-text"
                  :data-memory-id="segment.id"
                  rows="3"
                  spellcheck="false"
                  @input="setMemorySummaryDraft(segment.id, $event)"
                />
              </label>
              <label class="memory-library__editor">
                <span>{{ t("memory.field.recallCues") }}</span>
                <input
                  :aria-label="`${t('memory.field.recallCues')} ${segment.id}`"
                  :value="memoryCueDrafts[segment.id] ?? segment.recallCues.join(', ')"
                  data-harness="memory-summary-cues"
                  :data-memory-id="segment.id"
                  autocomplete="off"
                  spellcheck="false"
                  @input="setMemoryCueDraft(segment.id, $event)"
                />
              </label>
              <div class="memory-library__actions">
                <button
                  type="button"
                  :aria-label="`${t('memory.action.save')} ${segment.id}`"
                  data-harness="memory-summary-save"
                  :data-memory-id="segment.id"
                  @click="saveMemorySummary(segment)"
                >
                  {{ t("memory.action.save") }}
                </button>
                <button
                  type="button"
                  :aria-label="`${memoryToggleActionLabel(segment.disabled)} ${segment.id}`"
                  data-harness="memory-summary-toggle"
                  :data-memory-id="segment.id"
                  @click="toggleMemorySummary(segment)"
                >
                  {{ memoryToggleActionLabel(segment.disabled) }}
                </button>
                <button
                  type="button"
                  class="memory-library__danger"
                  :aria-label="`${t('memory.action.delete')} ${segment.id}`"
                  data-harness="memory-summary-delete"
                  :data-memory-id="segment.id"
                  @click="$emit('memory-summary-delete', { id: segment.id })"
                >
                  {{ t("memory.action.delete") }}
                </button>
              </div>
            </article>
          </div>
          <div v-if="memoryAtomGroups.length > 0" class="memory-library__list" :aria-label="t('memory.atomMemories')">
            <section
              v-for="group in memoryAtomGroups"
              :key="group.type"
              class="memory-library__group"
              :aria-label="`${group.label} ${t('nav.memory')}`"
              data-harness="memory-atom-group"
              :data-memory-type="group.type"
              :data-memory-count="group.atoms.length"
            >
              <header class="memory-library__group-header">
                <h3>{{ group.label }}</h3>
                <span>{{ t("memory.stored", { count: group.atoms.length }) }}</span>
              </header>
              <article
                v-for="atom in group.atoms"
                :key="atom.id"
                class="memory-library__segment"
                :class="{ 'memory-library__segment--disabled': atom.disabled }"
                :aria-label="`${memoryAtomTypeLabel(atom)} memory ${atom.id}`"
                data-harness="memory-atom-card"
                :data-memory-id="atom.id"
                :data-memory-type="atom.type"
              >
                <header class="memory-library__segment-header">
                  <div>
                    <small>{{ memoryAtomTypeLabel(atom) }}</small>
                    <strong>{{ atom.text }}</strong>
                  </div>
                  <span>{{ memoryAtomStatus(atom) }}</span>
                </header>

                <dl class="memory-library__meta">
                  <div>
                    <dt>{{ t("memory.meta.source") }}</dt>
                    <dd>{{ memoryAtomSourceLabel(atom) }}</dd>
                  </div>
                  <div>
                    <dt>{{ t("memory.meta.group") }}</dt>
                    <dd>{{ memoryAtomGroupLabel(atom.type) }}</dd>
                  </div>
                  <div>
                    <dt>{{ t("memory.meta.updated") }}</dt>
                    <dd>{{ memoryAtomUpdatedLabel(atom) }}</dd>
                  </div>
                </dl>

                <button
                  type="button"
                  class="memory-library__source-link"
                  :aria-label="t('memory.action.viewSource')"
                  data-harness="memory-source-open"
                  @click="openAtomSourceDrilldown(atom)"
                >
                  <span>{{ memoryAtomSourceLabel(atom) }}</span>
                  <strong>{{ t("memory.action.viewSource") }}</strong>
                </button>

                <label class="memory-library__editor">
                  <span>{{ t("memory.field.text") }}</span>
                  <textarea
                    :aria-label="`${t('memory.field.text')} ${atom.id}`"
                    :value="memoryAtomDrafts[atom.id] ?? atom.text"
                    data-harness="memory-atom-text"
                    :data-memory-id="atom.id"
                    rows="3"
                    spellcheck="false"
                    @input="setMemoryAtomDraft(atom.id, $event)"
                  />
                </label>
                <div class="memory-library__actions memory-library__actions--atom">
                  <button
                    type="button"
                    :aria-label="`${t('memory.action.save')} ${atom.id}`"
                    data-harness="memory-atom-save"
                    :data-memory-id="atom.id"
                    @click="saveMemoryAtom(atom)"
                  >
                    {{ t("memory.action.save") }}
                  </button>
                  <button
                    type="button"
                    :aria-label="`${t('memory.action.export')} ${atom.id}`"
                    data-harness="memory-atom-export"
                    :data-memory-id="atom.id"
                    @click="exportMemoryAtom(atom)"
                  >
                    {{ t("memory.action.export") }}
                  </button>
                  <button
                    type="button"
                    :aria-label="`${memoryToggleActionLabel(atom.disabled)} ${atom.id}`"
                    data-harness="memory-atom-toggle"
                    :data-memory-id="atom.id"
                    @click="toggleMemoryAtom(atom)"
                  >
                    {{ memoryToggleActionLabel(atom.disabled) }}
                  </button>
                  <button
                    type="button"
                    class="memory-library__danger"
                    :aria-label="`${t('memory.action.delete')} ${atom.id}`"
                    data-harness="memory-atom-delete"
                    :data-memory-id="atom.id"
                    @click="$emit('memory-atom-delete', { id: atom.id })"
                  >
                    {{ t("memory.action.delete") }}
                  </button>
                </div>
              </article>
            </section>
          </div>
          <div v-if="memorySegments.length === 0 && memoryAtoms.length === 0" class="memory-library__empty">
            {{ t("memory.empty") }}
          </div>
          <div v-if="latestRecallItem" class="memory-library__block memory-library__block--recall">
            <strong>{{ t("memory.lastRecalled") }}</strong>
            <p>{{ recallReasonLabel(latestRecallItem.reason) }}</p>
            <small>{{ recalledSourceLabel(latestRecallItem.sourceTurnIds.length) }}</small>
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
import {
  bundledLive2DModels,
  customLive2DModelValue,
  findBundledLive2DModel
} from "./bundled-live2d-models";
import Live2DStageView from "./Live2DStageView.vue";
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
import { describeProviderStatus } from "./settings-provider-status";
import { describeMemoryExtractionStatus } from "./settings-memory-extraction-status";
import { describeProviderTestStatus, describeTestLlmAction, describeTestVoiceAction } from "./settings-test-llm";
import { normalizeSettingsLocale, settingsLocales, settingsT, type SettingsI18nKey } from "./settings-i18n";
import { resolveActiveSettingsSection, settingsNavSectionIds, type SettingsSectionId } from "./settings-nav";

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
const providerStatus = computed(() => describeProviderStatus(props.state, locale.value));
const testLlmAction = computed(() =>
  describeTestLlmAction(
    props.stageStatus,
    props.state.providerTest.status,
    providerStatus.value.tone === "blocked" ? providerStatus.value.detail : "",
    locale.value
  )
);
const providerTestStatus = computed(() => describeProviderTestStatus(props.state.providerTest, locale.value));
const testVoiceAction = computed(() =>
  describeTestVoiceAction(
    props.stageStatus,
    props.state.voiceTest.status,
    describeVoiceBlockedReason(props.state),
    locale.value
  )
);
const voiceTestStatus = computed(() => describeVoiceTestStatus(props.state.voiceTest));
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
const memorySnapshot = computed(() => props.state.memoryDebug.snapshot);
const memoryExtractionStatus = computed(() => describeMemoryExtractionStatus(props.state, locale.value));
const memoryRawCount = computed(() => memorySnapshot.value?.recentTurns.length ?? 0);
const memorySummaryCount = computed(() => memorySnapshot.value?.summarySegments.length ?? 0);
const memorySegments = computed(() => memorySnapshot.value?.summarySegments ?? []);
const memoryAtoms = computed(() => memorySnapshot.value?.memoryAtoms ?? []);
const memoryEnabledCount = computed(
  () =>
    memorySegments.value.filter((segment) => !segment.disabled).length +
    memoryAtoms.value.filter((atom) => !atom.disabled).length
);
const memoryDisabledCount = computed(
  () =>
    memorySegments.value.filter((segment) => segment.disabled).length +
    memoryAtoms.value.filter((atom) => atom.disabled).length
);
const memoryStoredCount = computed(() => memorySummaryCount.value + memoryAtoms.value.length);
const memoryLibraryStatusLabel = computed(() => {
  if (props.state.memoryDebug.status === "loading") {
    return t("status.refreshing");
  }
  if (!memorySnapshot.value) {
    return t("status.notLoaded");
  }
  return `${memoryEnabledCount.value}/${memoryStoredCount.value} ${t("status.enabled")}`;
});
const latestRecallItem = computed(() => memorySnapshot.value?.lastRecallContext?.items[0] ?? null);
const latestRecallById = computed(() => {
  const entries = (memorySnapshot.value?.lastRecallContext?.items ?? []).map((item) => [item.id, item] as const);
  return new Map(entries);
});
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
const memoryTypeLanes = computed<Array<{ label: string; detail: string }>>(() => [
  {
    label: t("memory.type.summary"),
    detail: t("memory.stored", { count: memorySummaryCount.value })
  },
  ...memoryAtomTypeConfigs.value.map((config) => ({
    label: config.label,
    detail: t("memory.stored", { count: memoryAtoms.value.filter((atom) => atom.type === config.type).length })
  }))
]);
const memoryAtomGroups = computed(() =>
  memoryAtomTypeConfigs.value
    .map((config) => ({
      ...config,
      atoms: memoryAtoms.value.filter((atom) => atom.type === config.type)
    }))
    .filter((group) => group.atoms.length > 0)
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
const personaDraft = ref<DesktopPersonaFormState>({ ...props.state.persona.form });
const personaDraftDirty = ref(false);
const memorySummaryDrafts = ref<Record<string, string>>({});
const memoryCueDrafts = ref<Record<string, string>>({});
const memoryAtomDrafts = ref<Record<string, string>>({});
type MemorySourceSelection = { kind: "summary"; id: string } | { kind: "atom"; id: string };
const selectedSource = ref<MemorySourceSelection | null>(null);
const controlSurfaceRef = ref<HTMLElement | null>(null);
const activeSectionId = ref<SettingsSectionId>("model");
const sectionRefs = new Map<SettingsSectionId | "provider", HTMLElement>();
const selectedSourceDrilldown = computed(() => {
  if (!selectedSource.value) {
    return null;
  }
  if (selectedSource.value.kind === "summary") {
    const item = memorySegments.value.find((segment) => segment.id === selectedSource.value?.id);
    return item ? { kind: "summary" as const, item } : null;
  }
  const item = memoryAtoms.value.find((atom) => atom.id === selectedSource.value?.id);
  return item ? { kind: "atom" as const, item } : null;
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
    return t("memory.source.kind.summary");
  }
  if (selectedSourceDrilldown.value?.kind === "atom") {
    return t("memory.source.kind.atom", { type: memoryAtomTypeLabel(selectedSourceDrilldown.value.item) });
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

onMounted(() => {
  emit("request-persona");
  emit("refresh-memory-debug");
  window.addEventListener("resize", updateActiveSection);
  window.addEventListener("scroll", updateActiveSection, { passive: true });
  void nextTick(updateActiveSection);
});

onBeforeUnmount(() => {
  window.removeEventListener("resize", updateActiveSection);
  window.removeEventListener("scroll", updateActiveSection);
});

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

function valueFrom(event: Event): string {
  return event.target instanceof HTMLInputElement ||
    event.target instanceof HTMLSelectElement ||
    event.target instanceof HTMLTextAreaElement
    ? event.target.value
    : "";
}

function checkedFrom(event: Event): boolean {
  return event.target instanceof HTMLInputElement ? event.target.checked : false;
}

function memoryToggleActionLabel(disabled: boolean): string {
  return disabled ? t("memory.action.enable") : t("memory.action.disable");
}

function sectionAriaLabel(id: SettingsSectionId | "provider"): string {
  void id;
  return locale.value === "zh-CN" ? "设置分区" : "Settings section";
}

function setSectionRef(id: SettingsSectionId | "provider"): (element: Element | null) => void {
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

function setPersonaDraft(key: PersonaTextField, value: string): void {
  personaDraftDirty.value = true;
  personaDraft.value = {
    ...personaDraft.value,
    [key]: value
  };
  emit("update-persona-field", key, value);
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

function openSummarySourceDrilldown(segment: DesktopMemorySummarySegment): void {
  selectedSource.value = { kind: "summary", id: segment.id };
}

function openAtomSourceDrilldown(atom: DesktopMemoryAtom): void {
  selectedSource.value = { kind: "atom", id: atom.id };
}

function closeSourceDrilldown(): void {
  selectedSource.value = null;
}

function memorySegmentStatus(segment: DesktopMemorySummarySegment): string {
  return memoryToggleStateLabel(segment.disabled);
}

function memorySourceLabel(segment: DesktopMemorySummarySegment): string {
  return describeMemorySourceCount({
    sourcePassages: memorySourcePassages(segment),
    sourceIds: summarySourceIds(segment)
  }, locale.value);
}

function memoryLastUsedLabel(segment: DesktopMemorySummarySegment): string {
  if (segment.disabled) {
    return memoryToggleStateLabel(true);
  }
  const recall = latestRecallById.value.get(segment.id);
  if (!recall) {
    return locale.value === "zh-CN" ? "本次会话未召回" : "Not recalled this session";
  }
  return describeRecallReason(recall.reason, locale.value);
}

function memoryUpdatedLabel(segment: DesktopMemorySummarySegment): string {
  return formatMemoryTimestamp(segment.updatedAt ?? segment.createdAt);
}

function memoryAtomStatus(atom: DesktopMemoryAtom): string {
  return memoryToggleStateLabel(atom.disabled);
}

function memoryAtomTypeLabel(atom: DesktopMemoryAtom): string {
  return memoryAtomTypeConfigs.value.find((config) => config.type === atom.type)?.singular ?? t("memory.type.memory");
}

function memoryAtomGroupLabel(type: DesktopMemoryAtom["type"]): string {
  return memoryAtomTypeConfigs.value.find((config) => config.type === type)?.label ?? t("memory.type.memory");
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
