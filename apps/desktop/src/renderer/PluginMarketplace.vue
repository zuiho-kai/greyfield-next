<template>
  <section class="settings-section plugin-marketplace" data-testid="plugin-marketplace">
    <header class="settings-section__header"><h2>{{ zh ? '插件广场' : 'Plugins' }}</h2></header>
    <article class="neko-plugin-card">
      <div class="neko-plugin-icon" aria-hidden="true">N</div>
      <div>
        <h3>N.E.K.O {{ zh ? '实时语音' : 'Realtime Voice' }}</h3>
        <p>{{ zh ? '在 Greyfield 里和她自然交谈。原版实时语音持续听说，支持插话。' : 'Talk naturally in Greyfield with the original N.E.K.O realtime voice runtime.' }}</p>
        <small>{{ zh ? 'Project N.E.K.O. · 官方开源运行时' : 'Project N.E.K.O. · Official open-source runtime' }}</small>
      </div>
    </article>
    <p class="neko-plugin-status" role="status" data-testid="neko-plugin-status" :data-status="state.status">{{ state.message }}</p>
    <div class="neko-plugin-actions">
      <button v-if="state.status === 'not-installed' || state.status === 'error'" data-testid="neko-install" type="button" @click="command('install')">{{ zh ? '安装插件' : 'Install' }}</button>
      <button v-if="state.status === 'stopped' || state.status === 'error'" data-testid="neko-start" type="button" @click="command('start')">{{ zh ? '启动语音' : 'Start voice' }}</button>
      <button v-if="['starting', 'connecting', 'ready'].includes(state.status)" data-testid="neko-stop" type="button" @click="command('stop')">{{ zh ? '停用' : 'Disable' }}</button>
      <span v-if="state.status === 'installing'">{{ zh ? '正在安装…' : 'Installing…' }}</span>
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import type { NekoPluginState } from '../../../../packages/neko-plugin/src/index';
const props = defineProps<{ state: NekoPluginState; locale: string }>();
const zh = computed(() => props.locale === 'zh-CN');
function command(action: 'install' | 'start' | 'stop'): void { window.greyfield?.send('neko:command', { action }); }
</script>

<style scoped>
.plugin-marketplace { scroll-margin-top: 18px; }
.neko-plugin-card { display: flex; gap: 16px; align-items: flex-start; padding: 16px; background: rgba(255,255,255,.035); border: 1px solid rgba(255,255,255,.1); border-radius: 16px; }
.neko-plugin-icon { display: grid; place-items: center; flex-shrink: 0; width: 48px; height: 48px; border-radius: 14px; background: #f2b6c5; color: #292333; font-size: 28px; font-weight: 800; }
h3 { margin: 0 0 8px; } p { line-height: 1.6; } small { opacity: .65; }
.neko-plugin-status { overflow-wrap: anywhere; }
.neko-plugin-actions { display: flex; gap: 12px; }
.neko-plugin-actions button { cursor: pointer; padding: 10px 18px; border: 1px solid #166f66; border-radius: 10px; color: #fff; background: #197c71; font-weight: 650; }
.neko-plugin-actions button:hover { background: #11655c; }
</style>
