# Greyfield Next V1 进展组会纪要

日期：2026-05-26

目的：对齐私仓/PR 状态、V1 功能进展、复杂度拆分结果、剩余风险和下一步执行顺序。

## 参会角色

- 产品 / 桌宠体验 owner：V1 产品形态、可见质量、设置/聊天体验。
- Desktop shell owner：Electron 窗口、preload IPC、settings/chat/pet renderer surfaces。
- Runtime owner：main-process runtime、OpenAI-compatible provider、interrupt/error/test path。
- QA / harness owner：feature manifest、Electron harness、acceptance harness、复杂度热点。
- Repo / release owner：私仓、分支、PR、CI 权限和后续合入。

## 北极星

V1 仍然只做“活着的 Live2D 桌面桌宠”：

- 真实透明桌面 Live2D 角色
- 文本聊天和流式回复
- 句子级 TTS
- 可打断
- 人格、短记忆、最近上下文连续性
- 行为像桌面对象，而不是网页或 agent 平台

继续禁止：桌面控制、浏览器控制、读屏、长期任务系统、多 agent、直播、Godot/VRM、消息平台 gateway、技能自生成。

## 当前仓库状态

| 项目 | 状态 | 证据 / 备注 |
| --- | --- | --- |
| GitHub repo | 已创建，私仓 | `https://github.com/zuiho-kai/greyfield-next`，visibility=`PRIVATE` |
| main branch | 已推送初始代码 | `main` 跟踪 `origin/main` |
| PR #1 | 已打开 | `feature/settings-test-llm` -> `main`，标题：`Add settings LLM test and split renderer surfaces` |
| CI workflow | 暂未进仓库 | 当前 token 缺 `workflow` scope，`.github/workflows/ci.yml` 留在 base checkout 未跟踪 |
| 当前工作目录 | feature worktree | `E:\greyfield-next-test-llm` |

## 当前基线

| 模块 | 状态 | 证据 | 剩余风险 |
| --- | --- | --- | --- |
| 透明 pet window | 稳定迭代中 | Electron harness: `ok=true`; drag width/height 稳定 | 仍需守住 native shape 默认关闭。 |
| Live2D stage | V1 可用 | 既有 `harness:live2d` 基线；PR #1 未改 stage package | 用户模型导入和更多 fixture 仍待打磨。 |
| Speech bubble | 进行中，已改善 | 气泡文本 normalize/cap；稳定 bubble rect 进入 pet shape；Electron harness 通过 | 需要真实长文本/屏幕边缘视觉 QA。 |
| Settings/chat shell | 进行中，结构已拆 | `App.vue` 拆出 pet/chat/settings 三个窗口组件；Electron harness 验证隔离和 fake chat | AIRI 风格视觉 pass、model manager UX 仍待做。 |
| Main runtime / LLM | 进行中，确定性 Test LLM 路径完成 | Settings `Test LLM` 经 main runtime service 探测 provider；provider timeout/malformed SSE 可读错误；interrupt abort 已有测试；Test LLM 已加 single-flight guard | 真实网络手动 QA、retry UX、持久化 session/memory 仍未完成。 |
| Persona / recent context | Core prompt assembly 完成，desktop continuity 另列进行中 | `GFN-V1-007` 只代表 core prompt assembly；新增 `GFN-V1-015` 跟踪 persona/memory/JSONL session/restart harness | Electron main runtime 仍未接入持久化 memory/session。 |
| Fake runtime chain | 稳定 | `pnpm harness:acceptance` 通过 | 真实 TTS/ASR 仍不属于完成状态。 |
| 复杂度热点 | 已先拆第一轮 | `App.vue` 278 行；`desktop-runtime-bridge.ts` 261 行；`electron-check.ts` 304 行 | `Live2DStageView.vue` 仍是下一批拆分候选。 |

## 本轮完成

- 私有 GitHub 仓库已创建并推送初始 `main`。
- PR #1 已打开，用 feature branch 承载新功能和拆分，未直接推 main。
- 新增 settings `Test LLM`：
  - renderer 发送 `provider:test-llm`;
  - Electron main 调用 `RuntimeService.testLLM()`;
  - fake provider 返回 first token；
  - OpenAI-compatible 缺 API key 时返回可读失败；
  - active chat response 或并发 provider test 时拒绝执行；
  - 探测不写 session history。
- PM/架构 review 后修正 V1 manifest：
  - `GFN-V1-007` 改为 core persona/memory prompt assembly，不再暗示 desktop restart continuity 已完成；
  - 新增 `GFN-V1-015 Desktop persistent recent context`，承接 persona file、memory.md、JSONL session、restart harness；
  - speech bubble acceptance 增补 whitespace normalize、long reply cap、stable bubble shape；
  - settings shell acceptance 增补 Test LLM UI result。
- 更新 Electron harness，增加 `providerTestWorked: true` 验收。
- 拆 `App.vue`：
  - `PetWindow.vue`
  - `ChatWindow.vue`
  - `SettingsWindow.vue`
  - `App.vue` 保留 role routing、共享 state、IPC 事件协调。
- 拆 `desktop-runtime-bridge.ts`：
  - `settings-state-mapper.ts`
  - `runtime-event-reducer.ts`
  - `preview-runtime-events.ts`
- 拆 preload API：
  - `desktop-api.ts` 承载纯 contract；
  - `index.ts` 只做 Electron `contextBridge` 暴露；
  - 单测不再顶层 import Electron。
- 拆 Electron harness helper：
  - `electron-check-helpers.ts` 承载 Playwright/config 等通用 helper；
  - `electron-check.ts` 回到主验收流程。
- 修正 harness 包边界：
  - 从 `../../persistence/src/config-schema` 改为 `@greyfield/persistence/config-schema`；
  - `@greyfield/dev-harness` 显式依赖并引用 `@greyfield/persistence`。

## 验证结果

本轮 PR #1 验证：

```bash
pnpm typecheck
pnpm test
pnpm harness:acceptance
$env:ELECTRON_OVERRIDE_DIST_PATH='E:\在线live2d桌宠\node_modules\.pnpm\electron@42.2.0\node_modules\electron\dist'; pnpm harness:electron
```

结果：

- `pnpm typecheck`：通过。
- `pnpm test`：38 test files / 113 tests passed。
- `pnpm harness:acceptance`：`ok=true`。
- Electron harness：`ok=true`，`providerTestWorked=true`。
- PM/架构 review 修正后新增 targeted verification：`runtime-service` + manifest tests，2 files / 11 tests passed；`pnpm harness:pet:quick` 也通过，drag moved window 且尺寸不变。

说明：fresh worktree 里的 Electron binary 未下载成功，Electron harness 使用同版本 Electron 42.2.0 的本地已有 binary 覆盖路径完成验证。这证明代码路径和 harness 通过，但 fresh worktree 的 Electron 安装缓存/下载问题仍需另行处理。

## 复杂度对齐

Review 结论被采纳：没有 1k 行级源码文件，但热点已到该拆的前夜。

本轮拆完后的行数：

| 文件 | 行数 | 备注 |
| --- | ---: | --- |
| `apps/desktop/src/renderer/App.vue` | 278 | 从三窗口巨组件降为 role router + shared coordinator |
| `apps/desktop/src/renderer/PetWindow.vue` | 51 | pet surface |
| `apps/desktop/src/renderer/ChatWindow.vue` | 47 | chat surface |
| `apps/desktop/src/renderer/SettingsWindow.vue` | 234 | settings surface |
| `apps/desktop/src/renderer/desktop-runtime-bridge.ts` | 261 | bridge 保留协调逻辑 |
| `packages/dev-harness/src/electron-check.ts` | 304 | 主验收流程 |
| `packages/dev-harness/src/electron-check-helpers.ts` | 232 | Playwright/config helpers |

暂缓拆分：

- `Live2DStageView.vue` 仍有职责密度：renderer lifecycle、fallback、alpha hit-test、touch/drag/wheel、shape 估算。下一轮如果碰 stage/pet interaction，优先拆它。

## 风险

| 风险 | 严重度 | 处理 |
| --- | --- | --- |
| PR #1 未合并，main 还没有这些改动 | 中 | 不把 PR 内容说成 main 已完成；合并前继续在 feature branch 验证。 |
| GitHub token 缺 `workflow` scope | 中 | CI workflow 暂未 push；需要刷新 token scope 或后续单独提交 workflow。 |
| fresh worktree Electron binary 下载失败 | 中 | 本轮用同版本本地 binary 验证；后续可做 install/cache runbook。 |
| Settings Test LLM 仍偏功能骨架 | 中 | 下一步补 retry UX、真实网络手动 QA。 |
| Main runtime 仍用 in-memory session/fake memory | 中高 | Phase E 进入 persistence-backed persona/memory/session。 |
| `GFN-V1-007` 曾把 core prompt assembly 和 desktop continuity 混在一起 | 中 | 已拆成 `GFN-V1-007` core-only 和 `GFN-V1-015` desktop persistent recent context。 |
| Live2DStageView 仍是复杂热点 | 中 | 下次触碰 stage/pet interaction 时拆 helper，不在无关任务里大改。 |

## 决策记录

- PR #1 先保持一个 cohesive batch：settings Test LLM + renderer/harness complexity split。
- 不把 CI workflow 强行推入仓库，避免绕过 GitHub token scope 限制。
- settings Test LLM 只做 provider 探测，不写 session，不触发 TTS，不污染聊天历史。
- settings Test LLM 不与 active chat response 或另一个 provider test 并发。
- fake provider 仍然是 harness 和 CI 的默认确定性路径。
- 下一步不要直接进真实 TTS；先完成 persistence-backed persona/recent context，或补 settings/provider retry UX 和真实网络 QA。

## 下一步顺序

1. 合并或继续 review PR #1。
2. 处理 CI workflow 入仓问题：
   - 刷新 GitHub token `workflow` scope，或
   - 单独由有权限的凭据提交 `.github/workflows/ci.yml`。
3. 补 settings Test LLM 的 retry UX 和真实网络手动 QA 路径。
4. 进入 Phase E：
   - main runtime 加载 `characters/greyfield.yaml`;
   - 加载 `data/memory.md`;
   - 使用 JSONL `SessionStore`;
   - 增加 restart harness 证明最近上下文连续性。
5. 如果下轮触碰 stage/pet interaction，拆 `Live2DStageView.vue` 的 helper。
