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

    <section class="observation-panel" aria-label="Visual observation">
      <div class="observation-panel__header">
        <div>
          <strong>Look</strong>
          <span>{{ observationStatusText }}</span>
        </div>
        <span v-if="state.observation.frames.length > 0" class="observation-panel__count">
          {{ state.observation.frames.length }} frame{{ state.observation.frames.length === 1 ? "" : "s" }}
        </span>
      </div>
      <p v-if="state.observation.highFrequencyWarning" class="observation-panel__warning">
        {{ state.observation.highFrequencyWarning }}
      </p>
      <div v-if="state.observation.frames.length > 0" class="observation-preview-strip">
        <img
          v-for="frame in state.observation.frames.slice(0, 4)"
          :key="frame.id"
          :src="frame.dataUrl"
          alt="Temporary observation preview"
        />
      </div>
      <div class="observation-actions">
        <button type="button" class="observation-action" title="Capture one screenshot" aria-label="Capture one screenshot" @click="$emit('capture-screenshot')">
          <Camera :size="16" stroke-width="2.35" />
          <span>Once</span>
        </button>
        <button type="button" class="observation-action" title="Observe slowly" aria-label="Observe slowly" @click="$emit('start-observation', 'low')">
          <Gauge :size="16" stroke-width="2.35" />
          <span>Low</span>
        </button>
        <button type="button" class="observation-action" title="Observe normally" aria-label="Observe normally" @click="$emit('start-observation', 'normal')">
          <ScanEye :size="16" stroke-width="2.35" />
          <span>Std</span>
        </button>
        <button
          type="button"
          class="observation-action"
          :class="{ 'observation-action--warning': state.observation.highFrequencyConfirmation }"
          title="High frequency observation"
          aria-label="High frequency observation"
          @click="$emit('start-observation', 'high')"
        >
          <Zap :size="16" stroke-width="2.35" />
          <span>{{ state.observation.highFrequencyConfirmation ? "Start" : "High" }}</span>
        </button>
        <button
          type="button"
          class="observation-action observation-action--stop"
          title="End observation"
          aria-label="End observation"
          :disabled="state.observation.status !== 'observing' && state.observation.status !== 'capturing'"
          @click="$emit('stop-observation')"
        >
          <Square :size="15" stroke-width="2.35" />
          <span>End</span>
        </button>
        <button
          type="button"
          class="observation-action"
          title="Delete temporary observation"
          aria-label="Delete temporary observation"
          :disabled="state.observation.frames.length === 0 && state.observation.status === 'idle'"
          @click="$emit('delete-observation')"
        >
          <Trash2 :size="16" stroke-width="2.35" />
          <span>Clear</span>
        </button>
      </div>
    </section>

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
import { Camera, Gauge, ScanEye, Square, Trash2, Zap } from "lucide-vue-next";
import type { DesktopRendererState } from "./desktop-runtime-bridge";
import { describeChatStatus } from "./chat-status";
import type { RuntimeObservationMode } from "@greyfield/core-runtime";

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
  "capture-screenshot": [];
  "start-observation": [mode: Exclude<RuntimeObservationMode, "single">];
  "stop-observation": [];
  "delete-observation": [];
  "open-settings": [];
}>();

function valueFrom(event: Event): string {
  return event.target instanceof HTMLInputElement ? event.target.value : "";
}

const chatStatus = computed(() => describeChatStatus(props.state, props.draft));
const observationStatusText = computed(() => {
  if (props.state.observation.message) {
    return props.state.observation.message;
  }
  return "Screenshots are temporary and only sent after you confirm with a message.";
});
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
