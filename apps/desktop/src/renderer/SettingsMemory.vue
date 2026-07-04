<template>
  <div class="memory-library">
    <div class="memory-header">
      <h2>记忆库</h2>
      <div class="memory-stats">
        <span>核心记忆: {{ coreMemories.length }}</span>
        <span>话题索引: {{ topicIndexes.length }}</span>
      </div>
    </div>

    <div class="memory-tabs">
      <button
        :class="{ active: activeTab === 'core' }"
        @click="activeTab = 'core'"
      >
        核心记忆
      </button>
      <button
        :class="{ active: activeTab === 'topics' }"
        @click="activeTab = 'topics'"
      >
        话题索引
      </button>
    </div>

    <div v-if="activeTab === 'core'" class="memory-list">
      <div
        v-for="memory in sortedCoreMemories"
        :key="memory.id"
        class="memory-item"
      >
        <div class="memory-content">
          <p class="memory-text">{{ memory.text }}</p>
          <div class="memory-meta">
            <span class="memory-strength">强度: {{ memory.strength.toFixed(1) }}</span>
            <span v-if="memory.lastRecalledAt" class="memory-recalled">
              最后召回: {{ formatDate(memory.lastRecalledAt) }}
            </span>
            <span class="memory-created">
              创建: {{ formatDate(memory.createdAt) }}
            </span>
          </div>
        </div>
        <div class="memory-actions">
          <button @click="viewMemorySource(memory)" class="btn-view">查看来源</button>
          <button @click="deleteMemory(memory.id)" class="btn-delete">删除</button>
        </div>
      </div>

      <div v-if="coreMemories.length === 0" class="memory-empty">
        暂无核心记忆
      </div>
    </div>

    <div v-if="activeTab === 'topics'" class="memory-list">
      <div
        v-for="topic in sortedTopicIndexes"
        :key="topic.id"
        class="memory-item"
      >
        <div class="memory-content">
          <p class="memory-text">{{ topic.topic }}</p>
          <div class="memory-keywords">
            <span
              v-for="keyword in topic.keywords"
              :key="keyword"
              class="keyword-tag"
            >
              {{ keyword }}
            </span>
          </div>
          <div class="memory-meta">
            <span class="memory-mentions">提及次数: {{ topic.mentionCount }}</span>
            <span class="memory-recalled">
              最后提及: {{ formatDate(topic.lastMentioned) }}
            </span>
          </div>
        </div>
        <div class="memory-actions">
          <button @click="viewTopicSource(topic)" class="btn-view">查看对话</button>
        </div>
      </div>

      <div v-if="topicIndexes.length === 0" class="memory-empty">
        暂无话题索引
      </div>
    </div>

    <!-- Source Dialog -->
    <div v-if="showSourceDialog" class="dialog-overlay" @click="closeSourceDialog">
      <div class="dialog-content" @click.stop>
        <div class="dialog-header">
          <h3>记忆来源</h3>
          <button @click="closeSourceDialog" class="btn-close">×</button>
        </div>
        <div class="dialog-body">
          <div v-if="selectedSource" class="source-info">
            <p><strong>记忆内容:</strong> {{ selectedSource.text }}</p>
            <p><strong>来源对话:</strong></p>
            <div class="source-turns">
              <div
                v-for="turnId in selectedSource.turnIds"
                :key="turnId"
                class="source-turn"
              >
                Turn ID: {{ turnId }}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';

interface CoreMemory {
  id: string;
  text: string;
  strength: number;
  createdAt: Date;
  lastRecalledAt?: Date;
  sources: {
    turnIds: string[];
  };
}

interface TopicIndex {
  id: string;
  topic: string;
  keywords: string[];
  mentionCount: number;
  lastMentioned: Date;
  turnIds: string[];
}

const activeTab = ref<'core' | 'topics'>('core');
const coreMemories = ref<CoreMemory[]>([]);
const topicIndexes = ref<TopicIndex[]>([]);
const showSourceDialog = ref(false);
const selectedSource = ref<{ text: string; turnIds: string[] } | null>(null);

const sortedCoreMemories = computed(() => {
  return [...coreMemories.value].sort((a, b) => b.strength - a.strength);
});

const sortedTopicIndexes = computed(() => {
  return [...topicIndexes.value].sort((a, b) =>
    new Date(b.lastMentioned).getTime() - new Date(a.lastMentioned).getTime()
  );
});

onMounted(async () => {
  await loadMemories();
});

async function loadMemories() {
  // TODO: Call IPC to load memories from store
  // This is a placeholder - actual implementation would use Electron IPC
  console.log('[MemoryLibrary] Loading memories...');

  // For now, show empty state
  coreMemories.value = [];
  topicIndexes.value = [];
}

function formatDate(date: Date): string {
  if (!date) return '';
  const d = new Date(date);
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffMins = Math.floor(diffMs / 60000);

  if (diffMins < 60) {
    return `${diffMins} 分钟前`;
  } else if (diffMins < 1440) {
    return `${Math.floor(diffMins / 60)} 小时前`;
  } else {
    return d.toLocaleDateString('zh-CN');
  }
}

function viewMemorySource(memory: CoreMemory) {
  selectedSource.value = {
    text: memory.text,
    turnIds: memory.sources.turnIds
  };
  showSourceDialog.value = true;
}

function viewTopicSource(topic: TopicIndex) {
  selectedSource.value = {
    text: topic.topic,
    turnIds: topic.turnIds
  };
  showSourceDialog.value = true;
}

function closeSourceDialog() {
  showSourceDialog.value = false;
  selectedSource.value = null;
}

async function deleteMemory(memoryId: string) {
  if (!confirm('确定要删除这条记忆吗？')) {
    return;
  }

  // TODO: Call IPC to delete memory
  console.log('[MemoryLibrary] Deleting memory:', memoryId);

  // Remove from local list
  coreMemories.value = coreMemories.value.filter(m => m.id !== memoryId);
}
</script>

<style scoped>
.memory-library {
  padding: 20px;
  max-width: 1200px;
  margin: 0 auto;
}

.memory-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 20px;
}

.memory-header h2 {
  margin: 0;
  font-size: 24px;
}

.memory-stats {
  display: flex;
  gap: 20px;
  font-size: 14px;
  color: #666;
}

.memory-tabs {
  display: flex;
  gap: 10px;
  margin-bottom: 20px;
  border-bottom: 2px solid #eee;
}

.memory-tabs button {
  padding: 10px 20px;
  border: none;
  background: none;
  cursor: pointer;
  font-size: 16px;
  color: #666;
  transition: all 0.3s;
}

.memory-tabs button.active {
  color: #007bff;
  border-bottom: 2px solid #007bff;
  margin-bottom: -2px;
}

.memory-list {
  display: flex;
  flex-direction: column;
  gap: 15px;
}

.memory-item {
  display: flex;
  justify-content: space-between;
  padding: 15px;
  background: #f8f9fa;
  border-radius: 8px;
  border: 1px solid #e9ecef;
}

.memory-content {
  flex: 1;
}

.memory-text {
  margin: 0 0 10px 0;
  font-size: 16px;
  line-height: 1.5;
}

.memory-keywords {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-bottom: 10px;
}

.keyword-tag {
  padding: 4px 8px;
  background: #e3f2fd;
  border-radius: 4px;
  font-size: 12px;
  color: #1976d2;
}

.memory-meta {
  display: flex;
  gap: 15px;
  font-size: 12px;
  color: #999;
}

.memory-strength {
  font-weight: bold;
  color: #28a745;
}

.memory-mentions {
  color: #6c757d;
}

.memory-actions {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-left: 15px;
}

.memory-actions button {
  padding: 6px 12px;
  border: none;
  border-radius: 4px;
  cursor: pointer;
  font-size: 12px;
  transition: all 0.3s;
}

.btn-view {
  background: #007bff;
  color: white;
}

.btn-view:hover {
  background: #0056b3;
}

.btn-delete {
  background: #dc3545;
  color: white;
}

.btn-delete:hover {
  background: #c82333;
}

.memory-empty {
  text-align: center;
  padding: 60px 20px;
  color: #999;
  font-size: 16px;
}

/* Dialog styles */
.dialog-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
}

.dialog-content {
  background: white;
  border-radius: 8px;
  width: 90%;
  max-width: 600px;
  max-height: 80vh;
  overflow: hidden;
  display: flex;
  flex-direction: column;
}

.dialog-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 20px;
  border-bottom: 1px solid #eee;
}

.dialog-header h3 {
  margin: 0;
}

.btn-close {
  background: none;
  border: none;
  font-size: 24px;
  cursor: pointer;
  color: #999;
  width: 30px;
  height: 30px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.btn-close:hover {
  color: #333;
}

.dialog-body {
  padding: 20px;
  overflow-y: auto;
}

.source-info p {
  margin: 0 0 15px 0;
}

.source-turns {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-top: 10px;
}

.source-turn {
  padding: 8px 12px;
  background: #f8f9fa;
  border-radius: 4px;
  font-size: 14px;
  font-family: monospace;
}
</style>
