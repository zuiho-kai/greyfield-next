<template>
  <main class="chat-shell">
    <header class="chat-window-header">
      <div class="chat-identity">
        <span class="chat-identity__mark" aria-hidden="true">G</span>
        <div class="chat-identity__copy">
          <h1 class="chat-identity__name">Greyfield</h1>
          <span>{{ t("chat.title") }}</span>
        </div>
        <span
          class="status-badge status-pill"
          :class="`status-badge--${chatStatus.tone}`"
          role="status"
          data-testid="chat-status"
          :data-status-tone="chatStatus.tone"
        >
          <span class="status-badge__dot" aria-hidden="true"></span>
          {{ chatStatus.label }}
        </span>
      </div>
      <button type="button" class="settings-btn" @click="$emit('open-settings')">
        <svg class="chat-action-icon" viewBox="0 0 24 24" aria-hidden="true">
          <path d="M12 8.5a3.5 3.5 0 1 0 0 7 3.5 3.5 0 0 0 0-7Z" />
          <path d="M19.4 13.5a7.8 7.8 0 0 0 0-3l2-1.5-2-3.4-2.4 1a8 8 0 0 0-2.6-1.5L14 2.5h-4l-.4 2.6A8 8 0 0 0 7 6.6l-2.4-1-2 3.4 2 1.5a7.8 7.8 0 0 0 0 3l-2 1.5 2 3.4 2.4-1a8 8 0 0 0 2.6 1.5l.4 2.6h4l.4-2.6a8 8 0 0 0 2.6-1.5l2.4 1 2-3.4-2-1.5Z" />
        </svg>
        {{ t("chat.settings") }}
      </button>
    </header>

    <div class="chat-status-block">
      <section
        v-if="providerExperience.tone !== 'configured'"
        class="chat-provider-experience"
        :class="`chat-provider-experience--${providerExperience.tone}`"
        data-testid="chat-provider-experience"
        data-provider-layout="card"
        role="status"
      >
        <div class="chat-provider-experience__copy">
          <strong>{{ providerExperience.label }}</strong>
          <span>{{ providerExperience.detail }}</span>
        </div>
        <button
          v-if="providerExperience.actionLabel"
          type="button"
          class="chat-provider-experience__action"
          data-testid="chat-provider-experience-action"
          @click="$emit('open-settings')"
        >
          {{ providerExperience.actionLabel }}
        </button>
      </section>
      <div
        v-else
        class="chat-provider-compact"
        data-testid="chat-provider-experience"
        data-provider-layout="compact"
        role="status"
      >
        <span class="chat-provider-compact__dot" aria-hidden="true"></span>
        <span>{{ providerExperience.label }}</span>
      </div>
      <p
        v-if="state.sessionContinuity.restoredRecentMessageCount > 0"
        class="session-continuity-notice"
        data-testid="session-continuity-notice"
        role="status"
      >
        {{ t("chat.continuity.restored", { count: state.sessionContinuity.restoredRecentMessageCount }) }}
      </p>
      <p v-if="showChatStatusDetail" class="chat-status-detail">{{ chatStatus.detail }}</p>
      <p
        v-if="state.screenAwarenessNotice"
        class="screen-awareness-notice"
        role="status"
        data-testid="screen-awareness-notice"
      >
        {{ screenAwarenessNoticeText }}
      </p>

      <div v-if="state.errorMessage || state.voiceErrorMessage" class="chat-alerts" aria-live="polite">
        <div v-if="state.errorMessage" class="chat-error-box chat-error" role="alert">
          <span class="error-icon">⚠️</span>
          <p>{{ state.errorMessage }}</p>
        </div>
        <div v-if="state.voiceErrorMessage" class="chat-error-box voice-error-box" role="status">
          <span class="error-icon">⚠️</span>
          <p>{{ state.voiceErrorMessage }}</p>
        </div>
      </div>
    </div>

    <div class="message-list-container message-list" aria-live="polite">
      <div v-if="state.messages.length === 0 && !state.assistantDraft" class="chat-empty-state">
        <span class="chat-empty-state__mark" aria-hidden="true">G</span>
        <strong>Greyfield</strong>
        <span>{{ t("chat.placeholder") }}</span>
      </div>
      <div
        v-for="messageView in messagesWithSegments"
        :key="messageView.key"
        :class="['message-item', messageView.message.role]"
      >
        <div class="message-content">
          <template
            v-for="segment in messageView.segments"
            :key="segment.key"
          >
            <div
              :id="segment.bubbleId"
              :class="['message-bubble', { 'message-bubble--collapsed': segment.isLong && !isExpandedMessage(segment.key) }]"
              :data-message-expanded="isExpandedMessage(segment.key)"
            >
              {{ segment.text }}
            </div>
            <button
              v-if="segment.isLong"
              type="button"
              class="message-expand-toggle"
              data-testid="chat-message-toggle"
              :aria-controls="segment.bubbleId"
              :aria-expanded="isExpandedMessage(segment.key)"
              @click="toggleMessageExpansion(segment.key)"
            >
              {{ isExpandedMessage(segment.key) ? t("chat.message.collapse") : t("chat.message.expand") }}
            </button>
          </template>
          <small v-if="messageView.message.observationSummary" class="message-attachment-note">
            {{ messageView.message.observationSummary }}
          </small>
          <span class="message-time">{{ t("chat.justNow") }}</span>
        </div>
      </div>

      <div v-if="state.assistantDraft" class="message-item assistant draft">
        <div class="message-content">
          <template
            v-for="segment in draftSegments"
            :key="segment.key"
          >
            <div
              :id="segment.bubbleId"
              :class="['message-bubble', { 'message-bubble--collapsed': segment.isLong && !isExpandedMessage(segment.key) }]"
              :data-message-expanded="isExpandedMessage(segment.key)"
            >
              {{ segment.text }}
            </div>
            <button
              v-if="segment.isLong"
              type="button"
              class="message-expand-toggle"
              data-testid="chat-message-toggle"
              :aria-controls="segment.bubbleId"
              :aria-expanded="isExpandedMessage(segment.key)"
              @click="toggleMessageExpansion(segment.key)"
            >
              {{ isExpandedMessage(segment.key) ? t("chat.message.collapse") : t("chat.message.expand") }}
            </button>
          </template>
          <span class="message-time">{{ chatStatus.label }}</span>
        </div>
      </div>
    </div>

    <form class="message-composer" @submit.prevent="$emit('send')">
      <div class="input-wrapper">
        <input
          :value="draft"
          :aria-label="t('chat.message')"
          :placeholder="t('chat.placeholder')"
          autocomplete="off"
          spellcheck="false"
          class="message-input"
          data-testid="chat-message-input"
          @input="$emit('update:draft', valueFrom($event))"
        />
        <span v-if="draft" class="input-char-count">{{ draft.length }}</span>
      </div>
      <div class="action-buttons">
        <button type="submit" class="send-button" :disabled="!draft.trim()" data-testid="chat-send-button">
          <svg class="chat-action-icon" viewBox="0 0 24 24" aria-hidden="true">
            <path d="m4 4 17 8-17 8 3-8-3-8Z" />
            <path d="M7 12h14" />
          </svg>
          {{ chatStatus.sendLabel }}
        </button>
        <button
          type="button"
          class="voice-input-button"
          :class="{ 'voice-input-button--active': state.voiceInput.status === 'listening' }"
          :disabled="state.voiceInput.status === 'transcribing'"
          data-testid="chat-voice-input-button"
          :title="voiceInputExperience.isPreview ? voiceInputExperience.label : voiceInputLabel"
          @click="$emit(state.voiceInput.status === 'listening' ? 'stop-voice-input' : 'start-voice-input')"
        >
          <svg class="chat-action-icon" viewBox="0 0 24 24" aria-hidden="true">
            <rect x="9" y="3" width="6" height="11" rx="3" />
            <path d="M5.5 11.5a6.5 6.5 0 0 0 13 0M12 18v3M9 21h6" />
          </svg>
          <span>{{ voiceInputLabel }}</span>
          <small v-if="voiceInputExperience.isPreview" class="voice-input-button__preview-label">
            {{ voiceInputExperience.label }}
          </small>
        </button>
        <button type="button" class="stop-button" :disabled="!chatStatus.canStop" data-testid="chat-stop-button" @click="$emit('interrupt')">
          <svg class="chat-action-icon" viewBox="0 0 24 24" aria-hidden="true">
            <rect x="6" y="6" width="12" height="12" rx="2" />
          </svg>
          {{ chatStatus.stopLabel }}
        </button>
      </div>
    </form>
  </main>
</template>

<script setup lang="ts">
import { computed, ref } from "vue";
import type { DesktopMessage, DesktopRendererState } from "./desktop-runtime-bridge";
import { describeScreenAwarenessNotice } from "./chat-screen-awareness-notice";
import { describeChatStatus } from "./chat-status";
import { describeProviderExperience, describeVoiceInputExperience } from "./provider-experience-status";
import {
  createChatMessageDisclosureKey,
  draftMessageKey,
  isLongChatMessage
} from "./chat-message-disclosure";
import { splitAssistantReplyForDisplay } from "./assistant-reply-segments";
import { normalizeSettingsLocale, settingsT, type SettingsI18nKey } from "./settings-i18n";

const props = defineProps<{
  state: DesktopRendererState;
  draft: string;
}>();

defineEmits<{
  "update:draft": [value: string];
  send: [];
  interrupt: [];
  "start-voice-input": [];
  "stop-voice-input": [];
  "open-settings": [];
}>();

function valueFrom(event: Event): string {
  return event.target instanceof HTMLInputElement ? event.target.value : "";
}

interface ChatMessageSegmentView {
  key: string;
  bubbleId: string;
  text: string;
  isLong: boolean;
}

interface ChatMessageView {
  key: string;
  message: DesktopMessage;
  segments: ChatMessageSegmentView[];
}

const expandedMessageKeys = ref<Set<string>>(new Set());

function messageKey(message: DesktopMessage, index: number): string {
  return createChatMessageDisclosureKey(message, index);
}

const messagesWithSegments = computed<ChatMessageView[]>(() =>
  props.state.messages.map((message, index) => {
    const key = messageKey(message, index);
    return {
      key,
      message,
      segments: createMessageSegments(splitAssistantReplyForDisplay(message.text), key, (segmentIndex) =>
        messageBubbleId(index, segmentIndex)
      )
    };
  })
);

const draftSegments = computed<ChatMessageSegmentView[]>(() =>
  createMessageSegments(splitAssistantReplyForDisplay(props.state.assistantDraft), draftMessageKey, draftBubbleId)
);

function createMessageSegments(
  texts: string[],
  baseKey: string,
  bubbleIdForIndex: (segmentIndex: number) => string
): ChatMessageSegmentView[] {
  return texts.map((text, segmentIndex) => ({
    key: `${baseKey}-segment-${segmentIndex}`,
    bubbleId: bubbleIdForIndex(segmentIndex),
    text,
    isLong: isLongChatMessage(text)
  }));
}

function messageBubbleId(index: number, segmentIndex: number): string {
  return `chat-message-${index}-${segmentIndex}`;
}

function draftBubbleId(segmentIndex: number): string {
  return `chat-message-draft-${segmentIndex}`;
}

function isExpandedMessage(key: string): boolean {
  return expandedMessageKeys.value.has(key);
}

function toggleMessageExpansion(key: string): void {
  const nextKeys = new Set(expandedMessageKeys.value);
  if (nextKeys.has(key)) {
    nextKeys.delete(key);
  } else {
    nextKeys.add(key);
  }
  expandedMessageKeys.value = nextKeys;
}

const locale = computed(() => normalizeSettingsLocale(props.state.settings.settingsLocale));
const t = (key: SettingsI18nKey, values?: Record<string, string | number>): string =>
  settingsT(locale.value, key, values);
const chatStatus = computed(() => describeChatStatus(props.state, props.draft, locale.value));
const providerExperience = computed(() => describeProviderExperience(props.state, locale.value));
const voiceInputExperience = computed(() => describeVoiceInputExperience(props.state, locale.value));
const screenAwarenessNoticeText = computed(() => describeScreenAwarenessNotice(props.state, locale.value));
const showChatStatusDetail = computed(() => props.state.status !== "idle" || chatStatus.value.canStop);
const voiceInputLabel = computed(() => {
  if (props.state.voiceInput.status === "listening") {
    return t("chat.voice.stopMic");
  }
  if (props.state.voiceInput.status === "transcribing") {
    return t("chat.voice.transcribing");
  }
  return t("chat.voice");
});
</script>

<style scoped>
.chat-provider-experience {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 10px 12px;
  border: 1px solid rgba(31, 41, 51, 0.12);
  border-radius: 10px;
  background: rgba(255, 255, 255, 0.72);
}

.chat-provider-experience--preview {
  border-color: rgba(162, 111, 21, 0.24);
  background: rgba(255, 247, 222, 0.78);
}

.chat-provider-experience--configured {
  border-color: rgba(31, 122, 107, 0.24);
  background: rgba(231, 246, 242, 0.78);
}

.chat-provider-compact {
  display: inline-flex;
  align-items: center;
  justify-self: start;
  gap: 6px;
  min-height: 24px;
  padding: 3px 8px;
  border: 1px solid rgba(31, 122, 107, 0.14);
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.54);
  color: #43635e;
  font-size: 10px;
  font-weight: 750;
  line-height: 1.2;
}

.chat-provider-compact__dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: #1f7a6b;
  box-shadow: 0 0 0 3px rgba(31, 122, 107, 0.1);
}

.chat-provider-experience__copy {
  display: grid;
  gap: 2px;
  min-width: 0;
  color: #34424f;
  font-size: 12px;
  line-height: 1.35;
}

.chat-provider-experience__copy strong {
  color: #1f2933;
  font-size: 13px;
}

.chat-provider-experience__action {
  flex: 0 0 auto;
  padding: 7px 10px;
  border: 1px solid rgba(31, 122, 107, 0.24);
  border-radius: 8px;
  background: #1f7a6b;
  color: #ffffff;
  font-size: 12px;
  font-weight: 700;
  cursor: pointer;
}

.session-continuity-notice {
  margin: 0;
  padding: 7px 9px;
  border-radius: 8px;
  background: rgba(47, 95, 143, 0.08);
  color: #2f5f8f;
  font-size: 12px;
  font-weight: 700;
  line-height: 1.35;
}

.voice-input-button__preview-label {
  padding: 2px 4px;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.18);
  font-size: 9px;
  font-weight: 800;
  line-height: 1;
  white-space: nowrap;
}
</style>
