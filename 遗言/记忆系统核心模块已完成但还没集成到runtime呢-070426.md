# 遗言：记忆系统核心模块已完成但还没集成到runtime呢

> 生成时间: 2026-07-04  
> 项目路径: E:\Greyfield-next

## 项目背景

Greyfield Next 是一个 Live2D 桌面伴侣项目，使用 TypeScript + Electron + Vue 3。用户想重构记忆系统，从现有的复杂设计（SummarySegment + MemoryAtom）改为更简洁的三层架构（Raw Conversation → Topic Index → Core Memory）+ 向量检索。

**技术栈**：
- 前端：Electron + Vue 3
- 后端：Node.js + TypeScript
- 存储：JSONL + SQLite
- 向量化：SiliconFlow API（BAAI/bge-m3 或 Qwen/Qwen3-Embedding-0.6B）
- 向量检索：SQLite-vss 扩展 + fallback 余弦相似度

## 本次会话目标

1. 删除旧的记忆系统代码
2. 实现新的三层记忆架构
3. 集成向量检索（使用 SiliconFlow embedding API）
4. 集成到 runtime-loop
5. 实现简单的 Memory Library UI

## 已完成的工作

### 1. 技术方案对齐 ✅
- 确认使用 SiliconFlow API 做 embedding（API key 通过 `SILICONFLOW_API_KEY` 配置，不写入仓库）
- 确认使用 SQLite + sqlite-vss 做向量检索
- 不使用 `@xenova/transformers`（本地模型）
- 不使用 `hnswlib-node`（需要 C++ 编译）

### 2. 依赖安装 ✅
```bash
cd packages/persistence
pnpm add better-sqlite3 sqlite-vss
```

### 3. 核心模块实现 ✅

#### `packages/core-runtime/src/memory/types.ts`
定义了三层架构的数据结构：
- `ConversationTurn`（Layer 1）
- `TopicIndex`（Layer 2）
- `CoreMemory`（Layer 3）

#### `packages/core-runtime/src/memory/embedding.ts`
SiliconFlow API 调用，支持单个和批量 embedding：
```typescript
embed(text: string): Promise<number[]>
embedBatch(texts: string[]): Promise<number[][]>
```

#### `packages/persistence/src/memory/jsonl-topic-index-store.ts`
Layer 2 存储（JSONL 格式）：
- `append()` - 添加话题索引
- `search(keywords)` - 关键词搜索
- `getBySession()` - 按 session 查询

#### `packages/persistence/src/memory/sqlite-core-memory-store.ts`
Layer 3 存储（SQLite + 向量检索）：
- 尝试加载 `sqlite-vss` 扩展
- 如果失败则 fallback 到手写余弦相似度
- `insert()` - 插入核心记忆
- `vectorSearch()` - 向量检索
- `update()` - 更新记忆强度

#### `packages/core-runtime/src/memory/memory-manager.ts`
核心业务逻辑：
- `onNewTurn()` - 每条对话触发
- 检测显式记忆请求（"记住"、"别忘了"）
- 每 50 轮触发批量索引（`buildTopicIndex()`）
- 高频话题（mentionCount >= 3）自动升级到核心记忆

#### `packages/core-runtime/src/memory/recall.ts`
分层召回逻辑：
1. 先查 Layer 3（向量检索）
2. 没找到查 Layer 2（关键词匹配）
3. 召回后更新记忆强度（`strength += 0.1`）

### 4. 删除旧代码 ✅
```bash
# core-runtime
rm -f memory-atoms.ts memory-context.ts memory-erasure.ts proactive-memory.ts
rm -f __tests__/memory-*.test.ts __tests__/proactive-memory.test.ts

# persistence
rm -f jsonl-memory-atom-store.ts jsonl-summary-segment-store.ts
rm -f jsonl-deleted-memory-evidence-store.ts memory-store.ts
rm -f __tests__/memory-*.test.ts __tests__/jsonl-summary-segment-store.test.ts
```

## 未完成的工作

### 1. 更新导出文件 ❌
需要修改以下文件：
- `packages/persistence/src/index.ts` - 移除旧的 memory 导出，添加新的
- `packages/core-runtime/src/index.ts` - 添加 memory 模块导出（如果需要）

### 2. 修复编译错误 ❌
旧代码被删除后，肯定有其他文件还在引用旧的 memory 模块，需要：
- 运行 `pnpm typecheck` 找出所有编译错误
- 逐个修复或注释掉引用旧 memory 代码的地方

### 3. 集成到 runtime-loop ❌
需要修改 `packages/core-runtime/src/runtime-loop.ts`：
- 初始化 `MemoryManager`
- 在生成回复前调用 `recall()`
- 在每轮对话后调用 `onNewTurn()`

关键代码位置：
```typescript
// 在 GreyfieldRuntime 构造函数中初始化
this.memoryManager = new MemoryManager(
  topicStore,
  coreStore,
  llm,
  sessionId,
  characterId
);

// 在 handleTextInput 中召回记忆
const recallResult = await recall(userMessage, this.memoryManager);

// 在生成回复后记录对话
await this.memoryManager.onNewTurn(turn);
```

### 4. 实现 Memory Library UI ❌
需要复用现有 `SettingsWindow.vue` Memory Library，或后续设计 V2 专属入口：
- 显示核心记忆列表（text, strength, lastRecalledAt）
- 显示话题索引列表（topic, keywords, mentionCount）
- 删除记忆功能
- 查看来源对话功能

### 5. LLM 话题提取 ❌
`memory-manager.ts` 中的 `extractTopics()` 目前是简单的启发式实现，需要：
- 调用 LLM 批量提取话题
- 设计合适的 prompt
- 解析 LLM 返回的 JSON

## 关键决策与发现

### 1. 为什么不用本地 embedding 模型？
- 用户提供了 SiliconFlow API key，明确要用远程 API
- 避免 `@xenova/transformers` 的模型下载和初始化时间

### 2. 为什么不用 hnswlib-node？
- 需要 C++ 编译，用户的 Visual Studio 缺少 C++ 组件
- 改用 SQLite-vss 扩展 + fallback 余弦相似度
- 对于 1000 条以内的记忆，性能足够

### 3. 向量扩展加载失败不影响功能
- `sqlite-vss` 加载失败会自动 fallback 到纯 JS 余弦相似度
- 性能略差但功能完整

### 4. 批量索引触发阈值
- 设置为 50 轮对话触发一次
- 可以通过 `MemoryManager` 构造函数的 `batchSize` 参数调整

### 5. 记忆强度机制
- 显式记忆（用户说"记住"）：strength = 1.0
- 自动提取记忆（高频话题）：strength = 0.7
- 每次召回：strength += 0.1（最大 1.0）
- 过滤阈值：strength > 0.3

## 下一步建议

### 优先级 P0（必须完成才能跑起来）

1. **修复导出文件**
   ```bash
   # 编辑 packages/persistence/src/index.ts
   # 删除旧导出，添加新导出
   export * from "./memory";
   ```

2. **运行编译检查**
   ```bash
   cd /e/Greyfield-next
   pnpm typecheck
   ```

3. **修复编译错误**
   - 搜索所有引用旧 memory 模块的文件
   - 逐个修复或注释掉

4. **集成到 runtime-loop**
   - 参考上面"未完成的工作"中的代码片段
   - 需要在 desktop 的 runtime-service 中初始化 stores

### 优先级 P1（基础功能）

5. **实现 LLM 话题提取**
   - 修改 `extractTopics()` 函数
   - 调用用户的 LLM provider

6. **添加基础测试**
   - 测试 embedding API 调用
   - 测试 SQLite 存储读写
   - 测试召回逻辑

### 优先级 P2（可选）

7. **实现 Memory Library UI**
8. **优化 LLM prompt**
9. **添加记忆衰减机制**

## 关键文件清单

### 新增文件
```
packages/core-runtime/src/memory/
├── types.ts                    # 数据结构定义
├── embedding.ts                # SiliconFlow API 调用
├── memory-manager.ts           # 核心业务逻辑（批量索引、热度升级）
├── recall.ts                   # 分层召回逻辑
└── index.ts                    # 导出

packages/persistence/src/memory/
├── jsonl-topic-index-store.ts  # Layer 2 存储
├── sqlite-core-memory-store.ts # Layer 3 存储 + 向量检索
└── index.ts                    # 导出
```

### 需要修改的文件
```
packages/persistence/src/index.ts          # 更新导出
packages/core-runtime/src/runtime-loop.ts  # 集成 MemoryManager
apps/desktop/src/main/runtime-service.ts   # 初始化 stores
```

### 参考文档
```
docs/plans/v2-memory-refactor-plan.md      # 完整计划书
docs/plans/v2-memory-refactor-minispec.md  # 技术 minispec
.agents/memory-refactor.md                 # 简洁版进度跟踪
```

## API Key

**SiliconFlow Embedding API**:
- Base URL: `https://api.siliconflow.cn/v1`
- API Key: 通过 `SILICONFLOW_API_KEY` 配置，不写入仓库
- 支持模型: `BAAI/bge-m3`, `Qwen/Qwen3-Embedding-0.6B`
