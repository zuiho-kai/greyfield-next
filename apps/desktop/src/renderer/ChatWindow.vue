<template>
  <main class="chat-shell">
    <header class="chat-window-header">
      <div class="chat-header-title">
        <h1>Chat</h1>
        <span class="status-badge" :class="state.status">{{ state.status }}</span>
      </div>
      <button type="button" class="settings-btn" @click="$emit('open-settings')">
        <span>⚙️</span> Settings
      </button>
    </header>

    <div v-if="state.errorMessage" class="chat-error-box" role="alert">
      <span class="error-icon">⚠️</span>
      <p>{{ state.errorMessage }}</p>
    </div>

    <div class="message-list-container message-list" aria-live="polite">
      <div
        v-for="(message, index) in state.messages"
        :key="index"
        :class="['message-item', message.role]"
      >
        <div class="message-content">
          <div class="message-bubble">{{ message.text }}</div>
          <span class="message-time">just now</span>
        </div>
      </div>

      <div v-if="state.assistantDraft" class="message-item assistant draft">
        <div class="message-content">
          <div class="message-bubble">{{ state.assistantDraft }}</div>
          <span class="message-time">typing...</span>
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
          <span>📤</span> Send
        </button>
        <button type="button" class="stop-button" @click="$emit('interrupt')">
          <span>⏹️</span> Stop
        </button>
      </div>
    </form>
  </main>
</template>

<script setup lang="ts">
import type { DesktopRendererState } from "./desktop-runtime-bridge";

defineProps<{
  state: DesktopRendererState;
  draft: string;
}>();

defineEmits<{
  "update:draft": [value: string];
  send: [];
  interrupt: [];
  "open-settings": [];
}>();

function valueFrom(event: Event): string {
  return event.target instanceof HTMLInputElement ? event.target.value : "";
}
</script>
