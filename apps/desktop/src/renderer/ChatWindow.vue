<template>
  <main class="chat-shell">
    <header class="window-titlebar">
      <div class="chat-heading">
        <span>Chat</span>
        <span class="status-pill">{{ state.status }}</span>
      </div>
      <button type="button" @click="$emit('open-settings')">Settings</button>
    </header>
    <div v-if="state.errorMessage" class="chat-error" role="alert">
      {{ state.errorMessage }}
    </div>
    <div class="message-list" aria-live="polite">
      <p v-for="(message, index) in state.messages" :key="index" :class="message.role">
        {{ message.text }}
      </p>
      <p v-if="state.assistantDraft" class="assistant draft">{{ state.assistantDraft }}</p>
    </div>
    <form class="composer" @submit.prevent="$emit('send')">
      <input
        :value="draft"
        aria-label="Message"
        autocomplete="off"
        spellcheck="false"
        @input="$emit('update:draft', valueFrom($event))"
      />
      <button type="submit">Send</button>
      <button type="button" class="interrupt-button" @click="$emit('interrupt')">Stop</button>
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
