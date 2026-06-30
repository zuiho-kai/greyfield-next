<template>
  <main class="chat-shell">
    <header class="chat-window-header">
      <div class="chat-header-title">
        <h1>Chat</h1>
        <span class="status-badge status-pill" :class="`status-badge--${chatStatus.tone}`" role="status">
          {{ chatStatus.label }}
        </span>
      </div>
      <button type="button" class="settings-btn" @click="$emit('open-settings')">
        <span>⚙️</span> Settings
      </button>
    </header>

    <p class="chat-status-detail">{{ chatStatus.detail }}</p>

    <div v-if="state.errorMessage" class="chat-error-box chat-error" role="alert">
      <span class="error-icon">⚠️</span>
      <p>{{ state.errorMessage }}</p>
    </div>
    <div v-if="state.voiceErrorMessage" class="chat-error-box voice-error-box" role="status">
      <span class="error-icon">⚠️</span>
      <p>{{ state.voiceErrorMessage }}</p>
    </div>

    <div class="message-list-container message-list" aria-live="polite">
      <div
        v-for="(message, index) in state.messages"
        :key="index"
        :class="['message-item', message.role]"
      >
        <div class="message-content">
          <div class="message-bubble">{{ message.text }}</div>
          <small v-if="message.observationSummary" class="message-attachment-note">
            {{ message.observationSummary }}
          </small>
          <span class="message-time">just now</span>
        </div>
      </div>

      <div v-if="state.assistantDraft" class="message-item assistant draft">
        <div class="message-content">
          <div class="message-bubble">{{ state.assistantDraft }}</div>
          <span class="message-time">{{ chatStatus.label }}</span>
        </div>
      </div>
    </div>

    <form class="message-composer" @submit.prevent="$emit('send')">
      <div class="input-wrapper">
        <input
          :value="draft"
          aria-label="Message"
          placeholder="Type your message..."
          autocomplete="off"
          spellcheck="false"
          class="message-input"
          @input="$emit('update:draft', valueFrom($event))"
        />
        <span v-if="draft" class="input-char-count">{{ draft.length }}</span>
      </div>
      <div class="action-buttons">
        <button type="submit" class="send-button" :disabled="!draft.trim()">
          <span>📤</span> {{ chatStatus.sendLabel }}
        </button>
        <button
          type="button"
          class="voice-input-button"
          :class="{ 'voice-input-button--active': state.voiceInput.status === 'listening' }"
          :disabled="state.voiceInput.status === 'transcribing'"
          @click="$emit(state.voiceInput.status === 'listening' ? 'stop-voice-input' : 'start-voice-input')"
        >
          <span>🎙️</span> {{ voiceInputLabel }}
        </button>
        <button type="button" class="stop-button" :disabled="!chatStatus.canStop" @click="$emit('interrupt')">
          <span>⏹️</span> {{ chatStatus.stopLabel }}
        </button>
      </div>
    </form>
  </main>
</template>

<script setup lang="ts">
import { computed } from "vue";
import type { DesktopRendererState } from "./desktop-runtime-bridge";
import { describeChatStatus } from "./chat-status";

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

const chatStatus = computed(() => describeChatStatus(props.state, props.draft));
const voiceInputLabel = computed(() => {
  if (props.state.voiceInput.status === "listening") {
    return "Stop Mic";
  }
  if (props.state.voiceInput.status === "transcribing") {
    return "Transcribing";
  }
  return "Voice";
});
</script>
