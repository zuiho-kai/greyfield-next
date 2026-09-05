<template>
  <template v-for="(part, index) in parts" :key="index">
    <a v-if="part.url" :href="part.url" target="_blank" rel="noopener noreferrer" class="chat-source-link">{{ part.text }}</a>
    <template v-else>{{ part.text }}</template>
  </template>
</template>

<script setup lang="ts">
import { computed } from "vue";
const props = defineProps<{ text: string }>();
const parts = computed(() => {
  const result: Array<{ text: string; url?: string }> = [];
  let last = 0;
  for (const match of props.text.matchAll(/\[([^\]\n]+)\]\((https?:\/\/[^\s)]+)\)/g)) {
    result.push({ text: props.text.slice(last, match.index) });
    result.push({ text: match[1]!, url: match[2]! });
    last = match.index + match[0].length;
  }
  result.push({ text: props.text.slice(last) });
  return result;
});
</script>

<style scoped>
.chat-source-link { color: #17675c; text-decoration: underline; overflow-wrap: anywhere; }
</style>
