# Greyfield Next Memory Refactor - Mini Spec

更新时间：2026-07-04

---

## 一、核心设计原则

**让 AI 像真人一样记住你 — 不是数据库检索，而是情境化的、可找回的记忆**

### 关键理念

1. **不试图记住一切细节**（成本爆炸）
2. **但保证能找回一切细节**（Layer 1 + Layer 2）
3. **常用的自动沉淀到快速记忆**（Layer 3）
4. **低频话题不遗忘**（话题索引保证可找回）

---

## 二、三层架构

```
┌─────────────────────────────────┐
│ Layer 1: Raw Conversation       │  全量保留，用于溯源
│ - 存储：JSONL                    │  成本：磁盘空间
│ - 作用：source of truth         │
└─────────────────────────────────┘
              ↓ 批量索引 (每 50 轮)
┌─────────────────────────────────┐
│ Layer 2: Topic Index            │  话题 + 关键词 + 指针
│ - 存储：JSONL                    │  成本：1 次 LLM / 50 轮
│ - 作用：快速定位相关对话         │
└─────────────────────────────────┘
              ↓ 热度升级 (count >= 3)
┌─────────────────────────────────┐
│ Layer 3: Core Memory            │  核心记忆 + 向量化
│ - 存储：SQLite + Vector Index   │  成本：高频话题才提取
│ - 作用：日常对话快速召回         │
└─────────────────────────────────┘
```

---

## 三、数据结构

### ConversationTurn (Layer 1)

```typescript
interface ConversationTurn {
  id: string               // 唯一 ID
  sessionId: string        // 会话 ID
  characterId: string      // 角色 ID
  role: 'user' | 'assistant'
  text: string             // 对话内容
  timestamp: Date          // 时间戳
}
```

**存储**：`{userDataPath}/memory/{sessionId}/conversation.jsonl`

### TopicIndex (Layer 2)

```typescript
interface TopicIndex {
  id: string
  sessionId: string
  characterId: string
  
  // 核心字段
  topic: string            // "讨论了某游戏的优缺点"
  keywords: string[]       // ["游戏名", "画面", "剧情"]
  
  // 元数据
  timeRange: [Date, Date]  // 时间范围
  turnIds: string[]        // 关联到 Layer 1
  mentionCount: number     // 提到次数
  lastMentioned: Date      // 最后提到时间
  
  // 可选
  embedding?: number[]     // 向量化（可选）
}
```

**存储**：`{userDataPath}/memory/{sessionId}/topics.jsonl`

### CoreMemory (Layer 3)

```typescript
interface CoreMemory {
  id: string
  sessionId: string
  characterId: string
  
  // 核心内容
  text: string             // 一句话记忆
  embedding: number[]      // 向量化（必须）
  
  // 强度与时间
  strength: number         // 0-1，记忆强度
  createdAt: Date
  lastRecalledAt?: Date
  
  // 可选触发器
  triggers?: {
    keywords?: string[]    // 精确触发词
    dates?: string[]       // 时间触发
    contexts?: string[]    // 场景触发
  }
  
  // 溯源
  sources: {
    turnIds: string[]      // 来源对话
    topicIds?: string[]    // 来源话题
  }
  
  // 控制
  disabled: boolean        // 用户禁用
}
```

**存储**：`{userDataPath}/memory/{sessionId}/core.db` (SQLite)

---

## 四、记忆写入

### 1. 显式写入（用户要求）

**触发条件**：
- 用户说："记住..."、"别忘了..."、"以后要..."
- 用户纠正："不是那样的..."、"我之前说错了..."

**流程**：
```
用户输入
  ↓ 检测触发词
LLM 提取记忆内容
  ↓ 向量化
写入 Layer 3 (strength = 1.0)
```

**成本**：1 次 LLM 调用（仅在用户要求时）

### 2. 批量索引（定期后台）

**触发条件**：
- 累积 50 轮未索引对话
- 或每天定时（如果对话量少）

**流程**：
```
获取未索引的 turns
  ↓ 一次 LLM 调用
提取 3-5 个话题
  ↓
写入 Layer 2
  ↓ 检查 mentionCount
高频话题 → 升级到 Layer 3
```

**成本**：50 轮 → 1 次 LLM 调用

**LLM Prompt**：
```
将以下对话分成 3-5 个话题，每个话题提取：
1. 一句话总结（topic）
2. 3-5 个关键词（keywords）
3. 出现次数估计（mentionCount）

返回 JSON 数组。
```

### 3. 热度升级（自动沉淀）

**触发条件**：
- 话题索引的 `mentionCount >= 3`

**流程**：
```
检测高频话题
  ↓ 提取对应 turns
LLM 提取核心观点
  ↓ 向量化
写入 Layer 3 (strength = 0.7)
```

**成本**：仅针对高频话题

---

## 五、记忆召回

### 分层召回流程

```typescript
async function recall(userMessage: string): Promise<string> {
  // Step 1: 查核心记忆（Layer 3）
  const embedding = await embed(userMessage)
  const coreMemories = await vectorSearch(embedding, topK=10)
  
  const validCore = coreMemories.filter(m => 
    !m.disabled && m.strength > 0.3
  )
  
  if (validCore.length > 0) {
    // 找到核心记忆，更新强度
    for (const mem of validCore) {
      mem.strength = Math.min(1.0, mem.strength + 0.1)
      mem.lastRecalledAt = new Date()
      await update(mem)
    }
    return formatMemories(validCore)
  }
  
  // Step 2: 查话题索引（Layer 2）
  const keywords = extractKeywords(userMessage)
  const topics = await searchTopics(keywords)
  
  if (topics.length > 0) {
    // Step 3: 从 Layer 1 提取原文
    const turns = await fetchTurns(topics[0].turnIds)
    
    // Step 4: 按需总结
    const summary = await llm.summarize(turns, userMessage)
    return summary
  }
  
  return ''  // 没找到相关记忆
}
```

### 召回优先级

1. **Layer 3 核心记忆**：高频、重要的记忆，向量检索
2. **Layer 2 话题索引**：低频话题，关键词匹配
3. **Layer 1 原文提取**：按需生成，不预先存储

---

## 六、向量化

### 模型选择

- `Qwen/Qwen3-Embedding-0.6B`（推荐，轻量）
- `BAAI/bge-m3`（备选，多语言）

### 实现

```typescript
import { pipeline } from '@xenova/transformers'

let embedder: any = null

export async function initEmbedding() {
  embedder = await pipeline(
    'feature-extraction',
    'Qwen/Qwen3-Embedding-0.6B'
  )
}

export async function embed(text: string): Promise<number[]> {
  if (!embedder) await initEmbedding()
  
  const output = await embedder(text, {
    pooling: 'mean',
    normalize: true
  })
  
  return Array.from(output.data)
}
```

### 向量检索

```typescript
import { HierarchicalNSW } from 'hnswlib-node'

export class VectorIndex {
  private index: HierarchicalNSW
  private memories: Map<number, CoreMemory> = new Map()
  
  constructor(dimension: number = 512) {
    this.index = new HierarchicalNSW('cosine', dimension)
    this.index.initIndex(1000)  // max 1000 memories
  }
  
  add(memory: CoreMemory, idx: number) {
    this.index.addPoint(memory.embedding, idx)
    this.memories.set(idx, memory)
  }
  
  search(embedding: number[], k: number): CoreMemory[] {
    const result = this.index.searchKnn(embedding, k)
    return result.neighbors.map(idx => this.memories.get(idx)!)
  }
}
```

---

## 七、存储层实现

### TopicIndexStore

```typescript
export class TopicIndexStore {
  constructor(private filePath: string) {}
  
  async append(topic: TopicIndex): Promise<void> {
    // 追加到 JSONL
  }
  
  async getBySession(sessionId: string): Promise<TopicIndex[]> {
    // 读取并过滤
  }
  
  async search(keywords: string[]): Promise<TopicIndex[]> {
    // 关键词匹配
  }
}
```

### CoreMemoryStore

```typescript
export class CoreMemoryStore {
  private db: Database  // SQLite
  private vectorIndex: VectorIndex
  
  async insert(memory: CoreMemory): Promise<void> {
    // 写入 SQLite
    // 添加到向量索引
  }
  
  async update(id: string, updates: Partial<CoreMemory>): Promise<void> {
    // 更新 SQLite
  }
  
  async vectorSearch(embedding: number[], topK: number): Promise<CoreMemory[]> {
    return this.vectorIndex.search(embedding, topK)
  }
}
```

---

## 八、集成到 Runtime

### 修改 runtime-loop.ts

```typescript
export async function generateResponse(
  userMessage: string,
  context: RuntimeContext
) {
  // 1. 召回记忆
  const recalledMemories = await recall(userMessage, context.memoryManager)
  
  // 2. 构建 prompt
  const prompt = buildPrompt({
    system: context.systemPrompt,
    memories: recalledMemories,
    recentTurns: context.recentTurns,
    userMessage
  })
  
  // 3. 生成回复
  const response = await context.llm.generate(prompt)
  
  // 4. 记录对话
  const turn: ConversationTurn = {
    id: generateId(),
    sessionId: context.sessionId,
    role: 'user',
    text: userMessage,
    timestamp: new Date()
  }
  await context.memoryManager.onNewTurn(turn)
  
  // 5. 检查显式记忆请求
  if (detectExplicitMemory(userMessage)) {
    await context.memoryManager.writeExplicit(userMessage)
  }
  
  return response
}
```

### MemoryManager

```typescript
export class MemoryManager {
  private unindexedTurns: ConversationTurn[] = []
  
  async onNewTurn(turn: ConversationTurn) {
    // 保存到 Layer 1
    await this.conversationStore.append(turn)
    
    // 累积未索引对话
    this.unindexedTurns.push(turn)
    
    // 达到阈值触发批量索引
    if (this.unindexedTurns.length >= 50) {
      await this.buildTopicIndex()
      this.unindexedTurns = []
    }
  }
  
  private async buildTopicIndex() {
    const topics = await extractTopics(this.unindexedTurns, this.llm)
    
    for (const topic of topics) {
      await this.topicStore.append(topic)
      
      // 高频话题升级
      if (topic.mentionCount >= 3) {
        await this.upgradeToCoreMemory(topic)
      }
    }
  }
}
```

---

## 九、UI 设计

### Memory Library (简化版)

```vue
<template>
  <div class="memory-library">
    <h2>记忆库</h2>
    
    <!-- 核心记忆 -->
    <section class="core-memories">
      <h3>核心记忆</h3>
      <div v-for="mem in coreMemories" :key="mem.id" class="memory-card">
        <p class="text">{{ mem.text }}</p>
        <div class="meta">
          <span class="strength">
            强度: {{ (mem.strength * 100).toFixed(0) }}%
          </span>
          <span class="last-recalled">
            最后召回: {{ formatDate(mem.lastRecalledAt) }}
          </span>
        </div>
        <div class="actions">
          <button @click="viewSource(mem)">查看来源</button>
          <button @click="deleteMemory(mem.id)">删除</button>
        </div>
      </div>
    </section>
    
    <!-- 最近话题 -->
    <section class="topics">
      <h3>最近话题</h3>
      <div v-for="topic in topics" :key="topic.id" class="topic-card">
        <p class="topic-text">{{ topic.topic }}</p>
        <div class="keywords">
          <span v-for="kw in topic.keywords" :key="kw" class="tag">
            {{ kw }}
          </span>
        </div>
        <div class="meta">
          <span>提到 {{ topic.mentionCount }} 次</span>
          <span>最后: {{ formatDate(topic.lastMentioned) }}</span>
        </div>
      </div>
    </section>
  </div>
</template>
```

---

## 十、测试用例

### Test 1: 批量索引触发

```typescript
test('50 轮对话触发批量索引', async () => {
  const turns = generateTestTurns(50)
  
  for (const turn of turns) {
    await memoryManager.onNewTurn(turn)
  }
  
  // 验证生成了话题索引
  const topics = await topicStore.getBySession(sessionId)
  expect(topics.length).toBeGreaterThan(0)
})
```

### Test 2: 低频话题召回

```typescript
test('低频话题能通过索引找回', async () => {
  // 模拟：股票 50 轮 + 游戏 30 轮 + 新闻 20 轮
  const turns = [
    ...generateStockTurns(50),
    ...generateGameTurns(30),
    ...generateNewsTurns(20)
  ]
  
  for (const turn of turns) {
    await memoryManager.onNewTurn(turn)
  }
  
  // 等待索引完成
  await sleep(1000)
  
  // 查询游戏话题
  const recalled = await recall('那个游戏怎么样？', memoryManager)
  
  expect(recalled).toContain('游戏')
})
```

### Test 3: 记忆强度更新

```typescript
test('召回记忆时强度增加', async () => {
  const memory = await createTestMemory({
    text: '用户不喜欢被叫老板',
    strength: 0.7
  })
  
  // 召回 3 次
  for (let i = 0; i < 3; i++) {
    await recall('老板你好', memoryManager)
  }
  
  const updated = await coreStore.get(memory.id)
  expect(updated.strength).toBeGreaterThan(0.7)
})
```

### Test 4: 热度升级

```typescript
test('高频话题自动升级到核心记忆', async () => {
  // 创建一个 mentionCount = 5 的话题
  const topic: TopicIndex = {
    topic: '讨论股票投资',
    keywords: ['股票', '投资'],
    mentionCount: 5,
    // ...
  }
  
  await topicStore.append(topic)
  await memoryManager.upgradeToCoreMemory(topic)
  
  // 验证核心记忆中有了这个话题
  const memories = await coreStore.getBySession(sessionId)
  const found = memories.find(m => m.text.includes('股票'))
  
  expect(found).toBeDefined()
})
```

---

## 十一、关键指标

### 成本指标

- **批量索引成本**：50 轮对话 → 1 次 LLM 调用
- **显式写入成本**：仅在用户要求时调用
- **目标**：比实时判断省 90% 成本

### 性能指标

- **召回延迟**：< 500ms
- **向量检索**：< 100ms（1000 条记忆以内）
- **索引触发**：异步后台，不阻塞对话

### 质量指标

- **低频话题召回率**：> 90%（通过话题索引）
- **核心记忆准确率**：> 95%（高频话题）
- **用户满意度**：能记住重要事情，不会遗忘

---

## 十二、实施检查清单

### Phase 1: 数据结构 + 存储 (2h)
- [ ] 定义 TypeScript 接口
- [ ] 实现 TopicIndexStore (JSONL)
- [ ] 实现 CoreMemoryStore (SQLite)
- [ ] 实现 VectorIndex (hnswlib)

### Phase 2: 写入逻辑 (2h)
- [ ] 实现 topic-extractor.ts
- [ ] 实现 MemoryManager
- [ ] 实现批量索引触发器 (50 轮)
- [ ] 实现热度升级逻辑 (count >= 3)

### Phase 3: 召回逻辑 (2h)
- [ ] 实现 embedding.ts (Qwen3)
- [ ] 实现分层召回 (Layer 3 → 2 → 1)
- [ ] 实现记忆强度更新

### Phase 4: 集成 Runtime (1.5h)
- [ ] 修改 runtime-loop.ts
- [ ] 修改 runtime-service.ts
- [ ] 初始化 MemoryManager

### Phase 5: UI (0.5h)
- [ ] 实现 SettingsMemory.vue
- [ ] 显示核心记忆列表
- [ ] 显示话题列表
- [ ] 删除记忆功能

### 测试
- [ ] 批量索引测试
- [ ] 低频话题召回测试
- [ ] 记忆强度测试
- [ ] 热度升级测试

---

## 十三、依赖清单

```json
{
  "dependencies": {
    "@xenova/transformers": "^2.17.0",
    "hnswlib-node": "^3.0.0",
    "better-sqlite3": "^9.4.0"
  }
}
```

---

## 十四、文件结构

```
packages/core-runtime/src/memory/
├── types.ts              # 数据结构
├── memory-manager.ts     # 核心管理器
├── topic-extractor.ts    # LLM 话题提取
├── embedding.ts          # 向量化
├── vector-search.ts      # 向量检索
└── recall.ts             # 分层召回

packages/persistence/src/memory/
├── topic-index-store.ts  # Layer 2 存储
└── core-memory-store.ts  # Layer 3 存储

apps/desktop/src/renderer/
└── SettingsMemory.vue    # UI

packages/dev-harness/src/
└── memory-recall-check.ts # 测试
```

---

## 十五、关键决策记录

### 为什么三层？

- **Layer 1**：全量保留，保证不丢失任何信息（sub agent 对齐需要）
- **Layer 2**：话题索引，解决低频话题遗忘（MaiBot 的痛点）
- **Layer 3**：核心记忆，日常对话快速召回（性能需求）

### 为什么批量索引？

- 实时判断：100 轮 → 100 次 LLM 调用 → 成本高
- 批量索引：100 轮 → 2 次 LLM 调用 → 省 95% 成本

### 为什么本地向量化？

- 云端 embedding：需要网络，有延迟，有成本
- 本地 embedding：免费，快速，隐私

### 为什么 hnswlib？

- 简单、快速、成熟
- 1000 条记忆以内性能足够
- 后期可迁移到 SQLite + sqlite-vss

---

## 十六、未来优化方向

### 遗忘曲线 (V1.1)

```typescript
// 每天检查，淡化长期未召回的记忆
async function fadeMemories() {
  const memories = await coreStore.getAll()
  const now = new Date()
  
  for (const mem of memories) {
    const daysSinceRecall = daysBetween(mem.lastRecalledAt, now)
    
    if (daysSinceRecall > 30) {
      mem.strength *= 0.95
      
      if (mem.strength < 0.3) {
        mem.disabled = true  // 归档
      }
      
      await coreStore.update(mem.id, mem)
    }
  }
}
```

### 冲突解决 (V1.1)

```typescript
// 写入新记忆前检查冲突
async function addMemory(newMemory: CoreMemory) {
  const similar = await vectorSearch(newMemory.embedding, threshold=0.85)
  
  if (similar.length > 0) {
    const decision = await llm.resolve({
      old: similar[0].text,
      new: newMemory.text
    })
    
    if (decision.action === 'replace') {
      await coreStore.delete(similar[0].id)
    }
  }
  
  await coreStore.insert(newMemory)
}
```

### 主动触发 (V2.0)

```typescript
// 日历触发
async function checkDateTriggers() {
  const today = new Date().toISOString().slice(0, 10)
  const memories = await coreStore.getAll()
  
  const triggered = memories.filter(m =>
    m.triggers?.dates?.includes(today)
  )
  
  if (triggered.length > 0) {
    // 主动提起记忆
  }
}
```

---

**预期交付时间**：一天（8 小时）

**核心验证**：100 轮群聊，涉及多个话题，低频话题也能召回
