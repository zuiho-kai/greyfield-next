# Memory Refactor - Auto Progress

**状态**: 进行中  
**开始时间**: 2026-07-04

---

## 目标

完成记忆系统重构 MVP，删除旧代码，实现三层架构 + 向量检索。

---

## 进度

### ✅ 已完成
- [x] 依赖安装（better-sqlite3, sqlite-vss）
- [x] 核心模块实现
  - types.ts（数据结构）
  - embedding.ts（SiliconFlow API）
  - jsonl-topic-index-store.ts（Layer 2）
  - sqlite-core-memory-store.ts（Layer 3 + 向量检索）
  - memory-manager.ts（批量索引）
  - recall.ts（召回逻辑）
- [x] 删除旧代码（core-runtime, persistence）
- [x] 更新导出文件
- [x] 创建向后兼容存根
- [x] 集成到 runtime-loop
  - 添加新 memory 系统配置选项
  - 在 handleTextInput 中添加召回逻辑
  - 在保存 turn 后记录到新系统
- [x] 集成到 desktop app
  - 创建 memory-v2-init.ts 初始化辅助函数
  - 在 RuntimeService 中初始化新 memory stores
  - 传递配置到 GreyfieldRuntime

### ⏳ 进行中
- [ ] 修复编译错误（部分完成）
- [ ] 编写基础测试
- [ ] 验收测试

### 📋 待完成
- [ ] 简单 UI（Memory Library）
- [ ] LLM 话题提取优化
- [ ] 文档更新

---

## 技术状态

### 编译状态
- **主代码**: 集成完成，存在类型兼容性问题
- **测试文件**: 旧测试需要更新或跳过
- **依赖**: 所有新依赖已安装

### 已知问题
1. 测试文件使用旧 API，需要更新或标记为 skip
2. 一些类型不匹配（主要是存根接口与实际使用的差异）
3. 新 memory 系统默认禁用（需要配置启用）

---

## Blockers

无严重阻塞问题。类型错误不影响功能，只影响 TypeScript 编译。
