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

        <div class="settings-section memory-library" aria-label="Memory Library">
          <header class="settings-section__header">
            <h2>Memory Library</h2>
            <span>{{ memoryLibraryStatusLabel }}</span>
          </header>

          <div class="memory-library__privacy" role="note">
            <strong>Local memory controls</strong>
            <span>Exports include memory text and source turns. Provider credentials stay out of this library.</span>
          </div>

          <div class="memory-library__lanes" aria-label="Memory types">
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
            <span>Raw turns {{ memoryRawCount }}</span>
            <span>Enabled {{ memoryEnabledCount }}</span>
            <span>Disabled {{ memoryDisabledCount }}</span>
          </div>

          <div v-if="memorySegments.length > 0" class="memory-library__list" aria-label="Summary memories">
            <article
              v-for="segment in memorySegments"
              :key="segment.id"
              class="memory-library__segment"
              :class="{ 'memory-library__segment--disabled': segment.disabled }"
              :aria-label="`Summary memory ${segment.id}`"
            >
              <header class="memory-library__segment-header">
                <div>
                  <small>Summary memory</small>
                  <strong>{{ segment.summary }}</strong>
                </div>
                <span>{{ memorySegmentStatus(segment) }}</span>
              </header>

              <dl class="memory-library__meta">
                <div>
                  <dt>Source</dt>
                  <dd>{{ memorySourceLabel(segment) }}</dd>
                </div>
                <div>
                  <dt>Last used</dt>
                  <dd>{{ memoryLastUsedLabel(segment) }}</dd>
                </div>
                <div>
                  <dt>Updated</dt>
                  <dd>{{ memoryUpdatedLabel(segment) }}</dd>
                </div>
              </dl>

              <details
                class="memory-library__source"
                :aria-label="`Source passage for summary ${segment.id}`"
              >
                <summary>{{ memorySourcePassageSummary(memorySourcePassages(segment)) }}</summary>
                <div
                  v-if="memorySourcePassages(segment).length > 0"
                  class="memory-library__source-list"
                >
                  <article
                    v-for="passage in memorySourcePassages(segment)"
                    :key="`${passage.sessionId}:${passage.turnId}`"
                    class="memory-library__source-row"
                    :class="`memory-library__source-row--${passage.status}`"
                  >
                    <header>
                      <strong>{{ sourcePassageHeading(passage) }}</strong>
                      <span>{{ sourcePassageStatusLabel(passage) }}</span>
                    </header>
                    <dl>
                      <div>
                        <dt>Turn</dt>
                        <dd>{{ passage.turnId }}</dd>
                      </div>
                      <div>
                        <dt>Role</dt>
                        <dd>{{ sourcePassageRoleValue(passage) }}</dd>
                      </div>
                    </dl>
                    <p>{{ sourcePassageBody(passage) }}</p>
                  </article>
                </div>
                <p v-else>No passage</p>
              </details>

              <label class="memory-library__editor">
                <span>Memory text</span>
                <textarea
                  :aria-label="`Memory text ${segment.id}`"
                  :value="memorySummaryDrafts[segment.id] ?? segment.summary"
                  rows="3"
                  spellcheck="false"
                  @input="setMemorySummaryDraft(segment.id, $event)"
                />
              </label>
              <label class="memory-library__editor">
                <span>Recall cues</span>
                <input
                  :aria-label="`Recall cues ${segment.id}`"
                  :value="memoryCueDrafts[segment.id] ?? segment.recallCues.join(', ')"
                  autocomplete="off"
                  spellcheck="false"
                  @input="setMemoryCueDraft(segment.id, $event)"
                />
              </label>
              <div class="memory-library__actions">
                <button
                  type="button"
                  :aria-label="`Save memory ${segment.id}`"
                  @click="saveMemorySummary(segment)"
                >
                  Save
                </button>
                <button
                  type="button"
                  :aria-label="`${segment.disabled ? 'Enable' : 'Disable'} memory ${segment.id}`"
                  @click="toggleMemorySummary(segment)"
                >
                  {{ segment.disabled ? "Enable" : "Disable" }}
                </button>
                <button
                  type="button"
                  class="memory-library__danger"
                  :aria-label="`Delete memory ${segment.id}`"
                  @click="$emit('memory-summary-delete', { id: segment.id })"
                >
                  Delete
                </button>
              </div>
            </article>
          </div>
          <div v-if="memoryAtomGroups.length > 0" class="memory-library__list" aria-label="Atom memories">
            <section
              v-for="group in memoryAtomGroups"
              :key="group.type"
              class="memory-library__group"
              :aria-label="`${group.label} memories`"
            >
              <header class="memory-library__group-header">
                <h3>{{ group.label }}</h3>
                <span>{{ group.atoms.length }} stored</span>
              </header>
              <article
                v-for="atom in group.atoms"
                :key="atom.id"
                class="memory-library__segment"
                :class="{ 'memory-library__segment--disabled': atom.disabled }"
                :aria-label="`${memoryAtomTypeLabel(atom)} memory ${atom.id}`"
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
                    <dt>Source</dt>
                    <dd>{{ memoryAtomSourceLabel(atom) }}</dd>
                  </div>
                  <div>
                    <dt>Group</dt>
                    <dd>{{ memoryAtomGroupLabel(atom.type) }}</dd>
                  </div>
                  <div>
                    <dt>Updated</dt>
                    <dd>{{ memoryAtomUpdatedLabel(atom) }}</dd>
                  </div>
                </dl>

                <details
                  class="memory-library__source"
                  :aria-label="`Source passage for ${memoryAtomTypeLabel(atom)} memory ${atom.id}`"
                >
                  <summary>{{ memorySourcePassageSummary(memorySourcePassages(atom)) }}</summary>
                  <div
                    v-if="memorySourcePassages(atom).length > 0"
                    class="memory-library__source-list"
                  >
                    <article
                      v-for="passage in memorySourcePassages(atom)"
                      :key="`${passage.sessionId}:${passage.turnId}`"
                      class="memory-library__source-row"
                      :class="`memory-library__source-row--${passage.status}`"
                    >
                      <header>
                        <strong>{{ sourcePassageHeading(passage) }}</strong>
                        <span>{{ sourcePassageStatusLabel(passage) }}</span>
                      </header>
                      <dl>
                        <div>
                          <dt>Turn</dt>
                          <dd>{{ passage.turnId }}</dd>
                        </div>
                        <div>
                          <dt>Role</dt>
                          <dd>{{ sourcePassageRoleValue(passage) }}</dd>
                        </div>
                      </dl>
                      <p>{{ sourcePassageBody(passage) }}</p>
                    </article>
                  </div>
                  <p v-else>No passage</p>
                </details>

                <label class="memory-library__editor">
                  <span>Memory text</span>
                  <textarea
                    :aria-label="`Memory text ${atom.id}`"
                    :value="memoryAtomDrafts[atom.id] ?? atom.text"
                    rows="3"
                    spellcheck="false"
                    @input="setMemoryAtomDraft(atom.id, $event)"
                  />
                </label>
                <div class="memory-library__actions memory-library__actions--atom">
                  <button type="button" :aria-label="`Save memory ${atom.id}`" @click="saveMemoryAtom(atom)">
                    Save
                  </button>
                  <button type="button" :aria-label="`Export memory ${atom.id}`" @click="exportMemoryAtom(atom)">
                    Export
                  </button>
                  <button
                    type="button"
                    :aria-label="`${atom.disabled ? 'Enable' : 'Disable'} memory ${atom.id}`"
                    @click="toggleMemoryAtom(atom)"
                  >
                    {{ atom.disabled ? "Enable" : "Disable" }}
                  </button>
                  <button
                    type="button"
                    class="memory-library__danger"
                    :aria-label="`Delete memory ${atom.id}`"
                    @click="$emit('memory-atom-delete', { id: atom.id })"
                  >
                    Delete
                  </button>
                </div>
              </article>
            </section>
          </div>
          <div v-if="memorySegments.length === 0 && memoryAtoms.length === 0" class="memory-library__empty">
            No memories yet.
          </div>
          <div v-if="latestRecallItem" class="memory-library__block memory-library__block--recall">
            <strong>Last recalled memory</strong>
            <p>{{ latestRecallItem.reason }}</p>
            <small>{{ latestRecallItem.sourceTurnIds.join(", ") }}</small>
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
            aria-label="Memory library export"
            :value="state.memoryDebug.exportText"
            readonly
            rows="5"
          />
          <div class="settings-actions">
            <button type="button" @click="$emit('refresh-memory-debug')">
              {{ state.memoryDebug.status === "loading" ? "Refreshing..." : "Refresh memory" }}
            </button>
            <button type="button" @click="$emit('memory-export')">Export library</button>
            <button type="button" class="memory-library__danger-action" @click="$emit('memory-summary-clear')">
              Clear summary memory
            </button>
            <button type="button" class="memory-library__danger-action" @click="$emit('memory-atom-clear-current-role')">
              Clear current role atoms
            </button>
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
import { computed, onMounted, ref, watch } from "vue";
import type { DesktopMemoryAtom, DesktopMemorySourcePassage, DesktopMemorySummarySegment } from "../shared/ipc";
import type { DesktopRendererState, DesktopSettingsState } from "./desktop-runtime-bridge";
import {
  bundledLive2DModels,
  customLive2DModelValue,
  findBundledLive2DModel
} from "./bundled-live2d-models";
import Live2DStageView from "./Live2DStageView.vue";
import { describeProviderStatus } from "./settings-provider-status";
import { describeProviderTestStatus, describeTestLlmAction, describeTestVoiceAction } from "./settings-test-llm";

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
const providerStatus = computed(() => describeProviderStatus(props.state));
const testLlmAction = computed(() =>
  describeTestLlmAction(
    props.stageStatus,
    props.state.providerTest.status,
    providerStatus.value.tone === "blocked" ? providerStatus.value.detail : ""
  )
);
const providerTestStatus = computed(() => describeProviderTestStatus(props.state.providerTest));
const testVoiceAction = computed(() =>
  describeTestVoiceAction(props.stageStatus, props.state.voiceTest.status, describeVoiceBlockedReason(props.state))
);
const voiceTestStatus = computed(() => describeVoiceTestStatus(props.state.voiceTest));
const memorySnapshot = computed(() => props.state.memoryDebug.snapshot);
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
    return "Refreshing";
  }
  if (!memorySnapshot.value) {
    return "Not loaded";
  }
  return `${memoryEnabledCount.value}/${memoryStoredCount.value} enabled`;
});
const latestRecallItem = computed(() => memorySnapshot.value?.lastRecallContext?.items[0] ?? null);
const latestRecallById = computed(() => {
  const entries = (memorySnapshot.value?.lastRecallContext?.items ?? []).map((item) => [item.id, item] as const);
  return new Map(entries);
});
const sourcePassageDisplayLimit = 520;
const memoryAtomTypeConfigs: Array<{ type: DesktopMemoryAtom["type"]; label: string; singular: string }> = [
  { type: "fact", label: "Facts", singular: "Fact" },
  { type: "preference", label: "Preferences", singular: "Preference" },
  { type: "opinion", label: "Opinions", singular: "Opinion" },
  { type: "relationship_event", label: "Relationships", singular: "Relationship" },
  { type: "episodic_scene", label: "Scenes", singular: "Scene" }
];
const memoryTypeLanes = computed<Array<{ label: string; detail: string }>>(() => [
  {
    label: "Summary",
    detail: `${memorySummaryCount.value} stored`
  },
  ...memoryAtomTypeConfigs.map((config) => ({
    label: config.label,
    detail: `${memoryAtoms.value.filter((atom) => atom.type === config.type).length} stored`
  }))
]);
const memoryAtomGroups = computed(() =>
  memoryAtomTypeConfigs
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
const memorySummaryDrafts = ref<Record<string, string>>({});
const memoryCueDrafts = ref<Record<string, string>>({});
const memoryAtomDrafts = ref<Record<string, string>>({});
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

onMounted(() => {
  emit("refresh-memory-debug");
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

function memorySegmentStatus(segment: DesktopMemorySummarySegment): string {
  return segment.disabled ? "Disabled" : "Enabled";
}

function memorySourceLabel(segment: DesktopMemorySummarySegment): string {
  const sourceIds = [
    ...new Set([...segment.sourceTurns.map((turn) => turn.turnId), ...(segment.sourceTurnIds ?? [])])
  ];
  if (sourceIds.length === 0) {
    return "No source";
  }
  return `${sourceIds.length} source ${sourceIds.length === 1 ? "turn" : "turns"}: ${sourceIds.join(", ")}`;
}

function memoryLastUsedLabel(segment: DesktopMemorySummarySegment): string {
  if (segment.disabled) {
    return "Disabled";
  }
  const recall = latestRecallById.value.get(segment.id);
  if (!recall) {
    return "Not recalled this session";
  }
  return `Last recall: ${recall.reason}`;
}

function memoryUpdatedLabel(segment: DesktopMemorySummarySegment): string {
  return formatMemoryTimestamp(segment.updatedAt ?? segment.createdAt);
}

function memoryAtomStatus(atom: DesktopMemoryAtom): string {
  return atom.disabled ? "Disabled" : "Enabled";
}

function memoryAtomTypeLabel(atom: DesktopMemoryAtom): string {
  return memoryAtomTypeConfigs.find((config) => config.type === atom.type)?.singular ?? "Memory";
}

function memoryAtomGroupLabel(type: DesktopMemoryAtom["type"]): string {
  return memoryAtomTypeConfigs.find((config) => config.type === type)?.label ?? "Memory";
}

function memoryAtomSourceLabel(atom: DesktopMemoryAtom): string {
  if (atom.sourceTurnIds.length === 0) {
    return "No source";
  }
  return `${atom.sourceTurnIds.length} source ${atom.sourceTurnIds.length === 1 ? "turn" : "turns"}: ${atom.sourceTurnIds.join(", ")}`;
}

function memoryAtomUpdatedLabel(atom: DesktopMemoryAtom): string {
  return formatMemoryTimestamp(atom.updatedAt ?? atom.createdAt);
}

function memorySourcePassages(item: { sourcePassages?: DesktopMemorySourcePassage[] }): DesktopMemorySourcePassage[] {
  return item.sourcePassages ?? [];
}

function memorySourcePassageSummary(passages: DesktopMemorySourcePassage[]): string {
  if (passages.length === 0) {
    return "No passage";
  }
  const availableCount = passages.filter((passage) => passage.status === "available" && passage.text).length;
  if (availableCount > 0) {
    return `${availableCount} source ${availableCount === 1 ? "passage" : "passages"}`;
  }
  return "Source unavailable in this local session store";
}

function sourcePassageStatusLabel(passage: DesktopMemorySourcePassage): string {
  if (passage.status === "available" && passage.text) {
    return "Source passage";
  }
  if (passage.status === "missing" || passage.status === "unavailable") {
    return "Source unavailable in this local session store";
  }
  return "No passage";
}

function sourcePassageHeading(passage: DesktopMemorySourcePassage): string {
  if (passage.status === "available" && passage.text) {
    return sourcePassageRoleLabel(passage.role);
  }
  return "Source not available";
}

function sourcePassageRoleValue(passage: DesktopMemorySourcePassage): string {
  if (passage.status === "available" && passage.text) {
    return sourcePassageRoleLabel(passage.role);
  }
  return "Not available";
}

function sourcePassageRoleLabel(role: DesktopMemorySourcePassage["role"]): string {
  if (role === "assistant") {
    return "Greyfield";
  }
  if (role === "user") {
    return "User";
  }
  if (role === "system") {
    return "System";
  }
  if (role === "event") {
    return "Event";
  }
  return "Not available";
}

function sourcePassageBody(passage: DesktopMemorySourcePassage): string {
  if (passage.status === "available" && passage.text) {
    return boundSourcePassageText(passage.text);
  }
  return passage.message ?? "Source unavailable in this local session store";
}

function boundSourcePassageText(text: string): string {
  const normalized = text.trim();
  if (normalized.length <= sourcePassageDisplayLimit) {
    return normalized;
  }
  return `${normalized.slice(0, sourcePassageDisplayLimit).trimEnd()}...`;
}

function formatMemoryTimestamp(timestamp: string): string {
  const parsed = Date.parse(timestamp);
  if (Number.isNaN(parsed)) {
    return timestamp;
  }
  return new Date(parsed).toISOString().slice(0, 16).replace("T", " ");
}

function parseMemoryCues(text: string): string[] {
  return [...new Set(text.split(/[,，\n]/).map((cue) => cue.trim()).filter(Boolean))];
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
