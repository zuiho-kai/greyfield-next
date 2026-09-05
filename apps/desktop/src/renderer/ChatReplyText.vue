<template>
  <template v-for="(block, blockIndex) in blocks" :key="blockIndex">
    <pre v-if="block.kind === 'codeblock'" class="chat-code-block"><code>{{ block.text }}</code></pre>
    <template v-else v-for="(part, index) in block.parts" :key="index">
      <a v-if="part.kind === 'link'" :href="part.url" target="_blank" rel="noopener noreferrer" class="chat-source-link">{{ part.text }}</a>
      <strong v-else-if="part.kind === 'strong'">{{ part.text }}</strong>
      <code v-else-if="part.kind === 'code'" class="chat-inline-code">{{ part.text }}</code>
      <template v-else>{{ part.text }}</template>
    </template>
  </template>
</template>

<script setup lang="ts">
import { computed } from "vue";
const props = defineProps<{ text: string }>();
type InlinePart = { kind: "text" | "link" | "strong" | "code"; text: string; url?: string };
type TextBlock = { kind: "text"; parts: InlinePart[] } | { kind: "codeblock"; text: string };

function inlineParts(text: string): InlinePart[] {
  const result: InlinePart[] = [];
  let last = 0;
  for (const match of text.matchAll(/\[([^\]\n]+)\]\((https?:\/\/[^\s)]+)\)|\*\*([^*\n]+)\*\*|`([^`\n]+)`/g)) {
    result.push({ kind: "text", text: text.slice(last, match.index) });
    if (match[2]) result.push({ kind: "link", text: match[1]!, url: match[2] });
    else if (match[3]) result.push({ kind: "strong", text: match[3] });
    else result.push({ kind: "code", text: match[4]! });
    last = match.index + match[0].length;
  }
  result.push({ kind: "text", text: text.slice(last) });
  return result;
}

const blocks = computed<TextBlock[]>(() => {
  const result: TextBlock[] = [];
  let last = 0;
  for (const match of props.text.matchAll(/```[^\n`]*\n([\s\S]*?)```/g)) {
    result.push({ kind: "text", parts: inlineParts(props.text.slice(last, match.index)) });
    result.push({ kind: "codeblock", text: match[1]!.replace(/\n$/, "") });
    last = match.index + match[0].length;
  }
  result.push({ kind: "text", parts: inlineParts(props.text.slice(last)) });
  return result;
});
</script>

<style scoped>
.chat-source-link { color: #17675c; text-decoration: underline; overflow-wrap: anywhere; }
.chat-inline-code, .chat-code-block { font-family: Consolas, monospace; background: #edf2f5; border-radius: 5px; }
.chat-inline-code { padding: 1px 4px; }
.chat-code-block { padding: 10px; margin: 8px 0; white-space: pre-wrap; overflow-wrap: anywhere; font-size: 0.9em; }
</style>
