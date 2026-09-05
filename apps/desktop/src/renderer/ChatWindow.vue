<template>
  <main class="chat-shell">
    <header class="chat-window-header">
      <div class="chat-header-title">
        <h1>{{ t("chat.title") }}</h1>
        <span
          class="status-badge status-pill"
          :class="`status-badge--${chatStatus.tone}`"
          role="status"
          data-testid="chat-status"
          :data-status-tone="chatStatus.tone"
        >
          {{ chatStatus.label }}
        </span>
      </div>
      <button type="button" class="settings-btn" @click="$emit('open-settings')">
        <span>⚙️</span> {{ t("chat.settings") }}
      </button>
    </header>

    <div class="chat-status-block">
      <section
        class="chat-provider-experience"
        :class="`chat-provider-experience--${providerExperience.tone}`"
        data-testid="chat-provider-experience"
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
      <p
        v-if="state.sessionContinuity.restoredRecentMessageCount > 0"
        class="session-continuity-notice"
        data-testid="session-continuity-notice"
        role="status"
      >
        {{ t("chat.continuity.restored", { count: state.sessionContinuity.restoredRecentMessageCount }) }}
      </p>
      <p class="chat-status-detail">{{ chatStatus.detail }}</p>
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

    <div ref="messageList" class="message-list-container message-list" aria-live="polite" @scroll="updateFollowLatest">
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
              <ChatReplyText :text="segment.text" />
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

      <div v-if="state.toolStatus" class="tool-progress" role="status" data-testid="chat-tool-status">
        {{ toolStatusText }}
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
              <ChatReplyText :text="segment.text" />
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
          <span>📤</span> {{ chatStatus.sendLabel }}
        </button>
        <button
          type="button"
          class="voice-input-button"
          :class="{ 'voice-input-button--active': state.voiceInput.status === 'listening' || state.nekoPlugin.status === 'ready' }"
          :disabled="state.voiceInput.status === 'transcribing'"
          data-testid="chat-voice-input-button"
          :title="voiceInputExperience.isPreview ? voiceInputExperience.label : voiceInputLabel"
          @click="$emit(state.voiceInput.status === 'listening' || state.nekoPlugin.status === 'ready' ? 'stop-voice-input' : 'start-voice-input')"
        >
          <span>🎙️</span>
          <span>{{ voiceInputLabel }}</span>
          <small v-if="voiceInputExperience.isPreview" class="voice-input-button__preview-label">
            {{ voiceInputExperience.label }}
          </small>
        </button>
        <button type="button" class="stop-button" :disabled="!chatStatus.canStop && state.nekoPlugin.status !== 'ready'" data-testid="chat-stop-button" @click="$emit('interrupt')">
          <span>⏹️</span> {{ chatStatus.stopLabel }}
        </button>
      </div>
    </form>
  </main>
</template>

<script setup lang="ts">
import { computed, nextTick, ref, watch } from "vue";
import ChatReplyText from "./ChatReplyText.vue";
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

const messageList = ref<HTMLElement>();
let followLatest = true;
function updateFollowLatest(): void {
  const list = messageList.value;
  if (list) followLatest = list.scrollHeight - list.clientHeight - list.scrollTop < 64;
}
watch(() => [props.state.messages.length, props.state.assistantDraft, props.state.toolStatus], async () => {
  const shouldFollow = followLatest;
  await nextTick();
  if (shouldFollow && messageList.value) messageList.value.scrollTop = messageList.value.scrollHeight;
});

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
      segments: createMessageSegments(splitChatReply(message.text), key, (segmentIndex) =>
        messageBubbleId(index, segmentIndex)
      )
    };
  })
);

const draftSegments = computed<ChatMessageSegmentView[]>(() =>
  createMessageSegments(splitChatReply(props.state.assistantDraft), draftMessageKey, draftBubbleId)
);

function splitChatReply(text: string): string[] {
  const paragraphs: string[] = [];
  let lines: string[] = [];
  let inCodeFence = false;
  for (const line of text.split(/\r?\n/)) {
    if (line.trimStart().startsWith("```")) inCodeFence = !inCodeFence;
    if (!line.trim() && !inCodeFence) {
      if (lines.length) paragraphs.push(lines.join("\n"));
      lines = [];
    } else lines.push(line);
  }
  if (lines.length) paragraphs.push(lines.join("\n"));
  // Preserve source URLs and whole code blocks when splitting display bubbles.
  return paragraphs.flatMap((paragraph) => /\]\(https?:\/\/|```|(?:^|\n)\s*(?:\d+[.)]|\*\*步骤)/.test(paragraph) ? [paragraph] : splitAssistantReplyForDisplay(paragraph));
}

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
const toolStatusText = computed(() => {
  const tool = props.state.toolStatus;
  if (!tool) return "";
  const chinese = locale.value === "zh-CN";
  if (tool.status === "failed") return `${chinese ? "资料获取失败" : "Research failed"}: ${tool.message ?? ""}`;
  if (tool.status === "completed") return chinese ? "资料已获取，正在整理…" : "Sources received, preparing the answer…";
  if (tool.name === "screen_context") return chinese ? "正在看你眼前的报错…" : "Reading the current screen…";
  return tool.name === "web_search" ? (chinese ? "正在联网查资料…" : "Searching the web…") : (chinese ? "正在阅读来源…" : "Reading a source…");
});
const t = (key: SettingsI18nKey, values?: Record<string, string | number>): string =>
  settingsT(locale.value, key, values);
const chatStatus = computed(() => describeChatStatus(props.state, props.draft, locale.value));
const providerExperience = computed(() => describeProviderExperience(props.state, locale.value));
const voiceInputExperience = computed(() => describeVoiceInputExperience(props.state, locale.value));
const screenAwarenessNoticeText = computed(() => describeScreenAwarenessNotice(props.state, locale.value));
const voiceInputLabel = computed(() => {
  if (props.state.nekoPlugin.status === "ready") return "结束 N.E.K.O 语音";
  if (["stopped", "error"].includes(props.state.nekoPlugin.status)) return "启动 N.E.K.O 语音";
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
.tool-progress { color: #17675c; padding: 8px 12px; font-size: 13px; }
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
