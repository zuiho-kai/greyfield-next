# Greyfield Next 记忆系统重构计划书

更新时间：2026-07-04

---

## 一、项目目标

重构 Greyfield Next 的记忆功能，从现有设计改为**三层分层架构 + 话题索引 + 按需召回**的系统，实现：

- ✅ 像真人一样记住用户（不是数据库检索）
- ✅ 低频话题不遗忘（通过话题索引保证可找回）
- ✅ 成本可控（批量索引，避免实时调用）
- ✅ 支持 main agent 调用 sub agent 时的上下文对齐（保留原文）
- ✅ 用户可控（查看、编辑、删除记忆）

---

## 二、核心架构

### 三层存储 + 分层召回

```
┌────────────────────────────────────────────┐
│  Layer 1: 原始对话（Raw Conversation）       │
│  • 全量保留，永不删除                        │
│  • 用于溯源、sub agent 上下文对齐            │
│  • 存储：本地 JSONL，成本可控                │
└────────────────────────────────────────────┘
           ↓ 延迟批量提取（省钱）
┌────────────────────────────────────────────┐
│  Layer 2: 话题索引（Topic Index）            │
│  • 每 N 轮对话或每天批量总结一次              │
│  • 提取：话题标签 + 关键词 + 时间范围         │
│  • 不存完整内容，只存"这段时间聊了什么"       │
│  • 用于快速定位"游戏/股票/新闻在哪段对话"     │
└────────────────────────────────────────────┘
           ↓ 重要信息沉淀
┌────────────────────────────────────────────┐
│  Layer 3: 核心记忆（Core Memory）            │
│  • 只保留高频 + 高重要性的记忆               │
│  • 用户显式要求 or 反复出现 3+ 次             │
│  • 向量化，用于日常对话召回                   │
└────────────────────────────────────────────┘
```

### 关键特性

**不要试图"记住一切"，而是"随时能找回一切"**

- **Layer 1**：全量对话，用于精确溯源
- **Layer 2**：话题索引，解决低频话题遗忘问题
- **Layer 3**：核心记忆，用于快速召回

---

## 三、数据结构

### Layer 1: 原始对话（复用现有）

```typescript
interface ConversationTurn {
  id: string
  sessionId: string
  characterId: string
  role: 'user' | 'assistant'
  text: string
  timestamp: Date
}
```

### Layer 2: 话题索引（新增）

```typescript
interface TopicIndex {
  id: string
  sessionId: string
  characterId: string
  topic: string                // "讨论了某游戏的优缺点"
  keywords: string[]           // ["游戏名", "画面", "剧情"]
  timeRange: [Date, Date]      // 时间范围
  turnIds: string[]            // 关联到 Layer 1
  mentionCount: number         // 提到几次
  lastMentioned: Date          // 最后一次提到
  embedding?: number[]         // 可选：向量化
}
```

### Layer 3: 核心记忆（重构现有）

```typescript
interface CoreMemory {
  id: string
  sessionId: string
  characterId: string
  text: string                 // 一句话记忆
  embedding: number[]          // 向量化
  strength: number             // 0-1，记忆强度
  createdAt: Date
  lastRecalledAt?: Date
  triggers?: {                 // 可选触发器
    keywords?: string[]
    dates?: string[]
    contexts?: string[]
  }
  sources: {
    turnIds: string[]          // 来源对话
    topicIds?: string[]        // 来源话题
  }
  disabled: boolean
}
```

---

## 四、记忆写入策略

### 模式 1：显式写入（用户要求）

```
用户："记住，我不喜欢被叫老板。"
AI：立即写入 Layer 3，strength = 1.0
成本：1 次 LLM 调用（仅在用户要求时）
```

### 模式 2：批量索引（定期后台）

```
每 50 轮对话或每天一次触发
一次 LLM 调用批量提取 3-5 个话题
写入 Layer 2
成本：50 轮对话 → 1 次 LLM 调用
```

### 模式 3：热度升级（自动沉淀）

```
检查 Layer 2，如果 mentionCount >= 3
从话题索引提升到核心记忆（Layer 3）
调用 LLM 提取核心观点
成本：仅针对高频话题
```

---

## 五、记忆召回策略

### 分层查找流程

```typescript
async function recall(userMessage: string) {
  // Step 1: 先查核心记忆（Layer 3）
  const coreMemories = await vectorSearch(userMessage, layer=3)
  if (coreMemories.length > 0) {
    return coreMemories  // 找到了，直接返回
  }
  
  // Step 2: 核心记忆没找到 → 查话题索引（Layer 2）
  const topics = await keywordSearch(userMessage, layer=2)
  
  // Step 3: 根据话题索引，从 Layer 1 提取原文
  const rawTurns = await fetchTurns(topics[0].turnIds)
  
  // Step 4: 按需生成临时上下文
  const context = await summarizeOnDemand(rawTurns)
  return context
}
```

### 召回优先级

1. **常聊话题** → Layer 3（核心记忆），直接召回
2. **低频话题** → Layer 2（话题索引）→ Layer 1（原文提取）
3. **按需生成** → 不预先存储所有细节，召回时才生成

---

## 六、技术选型

| 模块 | 选型 | 理由 |
|-----|------|------|
| **向量模型** | `Qwen/Qwen3-Embedding-0.6B` 或 `BAAI/bge-m3` | 本地运行，免费，质量好 |
| **向量检索** | `hnswlib-node` | 简单、快速、内存友好 |
| **Layer 1 存储** | JSONL（复用现有） | 已有基础设施 |
| **Layer 2 存储** | JSONL | 轻量级，易于调试 |
| **Layer 3 存储** | SQLite + 向量索引 | 结构化查询 + 向量检索 |
| **LLM 调用** | 复用现有客户端 | 批量索引用便宜模型（GPT-4o-mini / Haiku） |

---

## 七、实施阶段（MVP 一天完成）

### 时间分配（8 小时）

```
08:00 - 10:00 (2h)   Phase 1: 数据结构 + 存储层
10:00 - 12:00 (2h)   Phase 2: 批量索引 + 写入逻辑
13:00 - 15:00 (2h)   Phase 3: 向量化 + 召回逻辑
15:00 - 16:30 (1.5h) Phase 4: 集成到 runtime + 测试
16:30 - 17:00 (0.5h) Phase 5: 简单 UI（查看记忆列表）
```

### Phase 1: 数据结构 + 存储层 (2h)

**交付物**：
- `packages/core-runtime/src/memory/types.ts` - TypeScript 接口定义
- `packages/persistence/src/memory/topic-index-store.ts` - 话题索引存储
- `packages/persistence/src/memory/core-memory-store.ts` - 核心记忆存储

**关键逻辑**：
- TopicIndexStore: append, getBySession, search
- CoreMemoryStore: insert, update, getBySession, vectorSearch

### Phase 2: 批量索引 + 写入逻辑 (2h)

**交付物**：
- `packages/core-runtime/src/memory/topic-extractor.ts` - LLM 批量提取话题
- `packages/core-runtime/src/memory/memory-manager.ts` - 记忆管理器

**关键逻辑**：
- 每 50 轮对话触发批量索引
- 高频话题（mentionCount >= 3）自动升级到 Layer 3
- 用户显式要求立即写入

### Phase 3: 向量化 + 召回逻辑 (2h)

**交付物**：
- `packages/core-runtime/src/memory/embedding.ts` - 向量化（Qwen3 或 bge-m3）
- `packages/core-runtime/src/memory/vector-search.ts` - 向量检索（hnswlib）
- `packages/core-runtime/src/memory/recall.ts` - 分层召回

**关键逻辑**：
- 向量化使用 @xenova/transformers
- 分层召回：Layer 3 → Layer 2 → Layer 1
- 记忆强度更新：召回时 strength += 0.1

### Phase 4: 集成到 runtime (1.5h)

**交付物**：
- 修改 `packages/core-runtime/src/runtime-loop.ts` - 集成召回逻辑
- 修改 `apps/desktop/src/main/runtime-service.ts` - 初始化 MemoryManager

**关键逻辑**：
- 生成回复前自动召回记忆
- 每条对话触发 onNewTurn
- 初始化向量模型

### Phase 5: 简单 UI (0.5h)

**交付物**：
- `apps/desktop/src/renderer/SettingsMemory.vue` - Memory Library UI

**功能**：
- 查看核心记忆列表
- 查看最近话题
- 删除记忆
- 显示记忆强度

---

## 八、测试验证

### 测试场景 1：低频话题召回

```
输入：100 轮对话（股票 50 轮 + 游戏 30 轮 + 新闻 20 轮）
验证：用户问"那个游戏怎么样？"能召回游戏相关内容
预期：通过 Layer 2 话题索引找到游戏话题 → 从 Layer 1 提取原文
```

### 测试场景 2：核心记忆强度

```
输入：创建一条核心记忆，召回 3 次
验证：记忆强度从 0.7 增长到 1.0
预期：每次召回 strength += 0.1
```

### 测试场景 3：批量索引触发

```
输入：连续 50 轮对话
验证：自动触发批量索引，生成 3-5 条话题索引
预期：成本仅 1 次 LLM 调用
```

---

## 九、成本对比

| 方案 | 100 轮对话成本 |
|-----|--------------|
| 实时判断（每条都调 LLM） | 100 次调用 |
| MaiBot 定期总结 | 10-20 次调用 |
| **本方案** | **2-3 次调用**（批量索引 + 热度升级） |

---

## 十、成功指标

### MVP 阶段（一天后）
- ✅ 100 轮群聊，涉及 3+ 个话题，都能召回
- ✅ 批量索引成本 < 实时判断的 10%
- ✅ 召回延迟 < 500ms
- ✅ 可以在 Settings 查看和删除记忆

### 后续迭代
- ✅ 遗忘曲线：长期不用的记忆自动淡化
- ✅ 冲突解决：矛盾记忆自动合并或替换
- ✅ 完整 UI：编辑、搜索、导出
- ✅ 主动触发：纪念日、长期未见提醒

---

## 十一、依赖安装

```bash
pnpm add @xenova/transformers hnswlib-node
```

---

## 十二、文件清单

### 新增文件

```
packages/core-runtime/src/memory/
  ├── types.ts              # 数据结构定义
  ├── topic-extractor.ts    # LLM 批量提取话题
  ├── memory-manager.ts     # 记忆管理器
  ├── embedding.ts          # 向量化
  ├── vector-search.ts      # 向量检索
  └── recall.ts             # 分层召回

packages/persistence/src/memory/
  ├── topic-index-store.ts  # Layer 2 存储
  └── core-memory-store.ts  # Layer 3 存储

apps/desktop/src/renderer/
  └── SettingsMemory.vue    # Memory Library UI

packages/dev-harness/src/
  └── memory-recall-check.ts # 测试用例
```

### 修改文件

```
packages/core-runtime/src/runtime-loop.ts
apps/desktop/src/main/runtime-service.ts
```

---

## 十三、风险与缓解

### 技术风险

1. **向量检索质量不够**
   - 缓解：结合关键词匹配
   
2. **LLM 提取不准确**
   - 缓解：使用 structured output + 验证逻辑
   
3. **向量模型加载慢**
   - 缓解：应用启动时预加载

### 产品风险

1. **用户不理解话题索引**
   - 缓解：UI 只展示"记忆"，隐藏技术细节
   
2. **成本仍然较高**
   - 缓解：提供配置选项，控制索引频率

---

## 十四、后续规划

### V1.1（+1-2 天）
- 遗忘曲线：记忆强度衰减 + 自动归档
- 冲突解决：新记忆检测并更新旧记忆

### V1.2（+2-3 天）
- 完整 Memory Library UI：编辑、搜索、导出
- 时间线视图：按时间 + 强度展示

### V2.0（可选，+2-3 天）
- 主动触发：日历触发（纪念日）
- 环境触发：天气、长期未见

---

## 十五、参考文档

- [V2 Memory Goal](v2-memory-goal.md) - 现有设计（待重构）
- [Memory Synthesis](../research/v2-memory/synthesis.md) - 研究综述
- [Version Product Book](version-product-book.md) - 产品路线图
