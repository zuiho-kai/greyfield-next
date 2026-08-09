# Greyfield 首次体验重置设计

状态：已获用户确认，进入实施  
日期：2026-08-09  
范围：首次十分钟体验；不重写 Greyfield，不整体 fork 竞品

## 结论

Greyfield 保留现有 TypeScript/Electron/Live2D 技术脊柱，但停止把测试型工程包装成成品。本轮把产品收敛为一条可信路径：

> 下载一个 Windows 文件，双击看见角色，清楚知道当前是试玩还是真实服务；完成一次最小配置后得到真实回复，重启后配置仍在，Stop 仍能立即停止。

本轮不恢复长期记忆卖点。默认桌面运行时目前关闭长期记忆；产品文案必须如实说明。只有首次真实对话与可下载交付物通过独立验收后，才进入“记住一个细节、解释来源、服从删除”的第二批工作。

## 快速穿刺

### 1. 我们试图发现什么未知事实？

我们要验证：保留 Greyfield 底层、重做首次体验，能否让普通 Windows 用户在十分钟内完成一次真实对话，而不需要 Node.js、pnpm、终端或理解八个任务模型槽位。

### 2. 如果成功，会改变什么判断？

成功说明 Greyfield 的主要问题是产品入口、交付和诚实状态，而不是底层架构。项目应继续在现有代码上收敛。失败才值得重新评估底座或迁移。

### 3. 最小验证是什么？

在干净的临时用户数据目录中，从 Windows 发行文件启动：

1. 三分钟内看到透明 Live2D 与紧凑控制入口。
2. 试玩状态明确可见，麦克风和回复不会伪装成真实 AI。
3. 用户只填写 Base URL、API Key、模型并运行一次 Test LLM。
4. 用户发送消息并得到真实 provider 的流式回复。
5. 重启应用后配置仍在，且不会回退到 fake。
6. 回复生成或播音时按 Stop，后续文本、音频和嘴型全部停止。

### 4. 如果失败，能排除什么？

- 若发行文件无法启动，可把问题缩小到打包、资源路径或原生依赖，而非 Live2D 交互设计。
- 若配置后仍不能真实对话，可把问题缩小到 provider 设置与运行时边界，而非用户不会使用桌宠。
- 若用户找不到入口，可否定当前信息架构，不能再用“DOM 中有按钮”作为可发现性证据。
- 若完成以上路径仍没有角色感，再投入默认角色、人设、声音和表演，而不是继续堆系统功能。

### 5. 为什么值得研究？

当前五个断点都发生在首次十分钟：没有可下载发行物、默认回复是假、麦克风是假、配置会被启动器覆盖、长期记忆文案与默认运行时矛盾。修复这些断点能直接改变用户对产品的判断；增加屏幕感知、插件或 Agent 不能。

## 当前证据

以下判断来自 2026-08-09 的 `origin/main`（`8e2f77f`）、当前源码和视觉 harness：

- `README.md` 要求 Node.js、pnpm 和源码安装；GitHub Releases 没有用户发行物。
- `packages/persistence/src/config-schema.ts` 默认使用 fake LLM 与 fake ASR。
- `apps/desktop/src/main/runtime-providers.ts` 的 fake LLM 和 ASR 返回固定内容。
- `apps/desktop/scripts/dev-live2d-electron.mjs` 在普通开发启动时重写缓存配置，覆盖用户保存的 provider、声音和 persona 设置。
- `apps/desktop/src/main/index.ts` 显式传入 `memoryEnabled: false`，但 README 与 Settings 仍把长期记忆描述为已完成或已开启。
- 当前视觉 harness 证明透明 Live2D、窗口命中、Controls、Chat 和 Settings 存在；它也显示 Controls 为约 `456×140`，Settings 内容高约 `4326px`。元素存在不等于首次体验可用。
- Stop、透明窗口、Live2D、JSONL recent context 与 main-process provider ownership 已有可执行证据，应冻结保留。

## 竞品只借机制，不借代码和品牌

### 从 N.E.K.O 借什么

[N.E.K.O](https://github.com/Project-N-E-K-O/N.E.K.O) 的有效机制是“角色先于系统、表演先于设置”：默认角色先出现，低频配置后置，等待状态由角色动作或气泡表达。Greyfield 本轮只借三点：

- 桌宠本体附近提供唯一主入口。
- 首次使用先完成真实互动，再展示高级能力。
- 用清晰状态表达“试玩、准备、思考、说话、已停止”。

不复制 YUI、声音、台词、教程资源、品牌或社区机制，也不引入插件、Workshop、小游戏和七日教程。

### 从 Open-LLM-VTuber 借什么

[Open-LLM-VTuber](https://github.com/Open-LLM-VTuber/Open-LLM-VTuber) 的有效机制是同一会话跨完整窗口与桌宠形态、端到端中断、首段尽早反馈，以及主动说话默认关闭。Greyfield 已有 Stop 与分句 TTS 基础，本轮只强化：

- 试玩与真实 provider 共用同一会话入口，但状态不能混淆。
- Stop 同时取消 LLM、TTS、播放队列与嘴型。
- 主动说话、屏幕感知继续默认关闭并退出首次路径。

不 fork 其前端。其前端许可证含商业限制，Live2D 样例资产另有许可；Greyfield 只独立实现交互思想。

## 方案选择

### 方案 A：只换皮

缩短 Settings、换图标、调整颜色。成本低，但假回复、配置覆盖和无发行物仍在。用户会更快看见一个更漂亮的 demo。拒绝。

### 方案 B：保留底层，重置首次体验

保留 Electron、Live2D、runtime、Stop 和 harness，先修产品真相、配置持久化、真实聊天入口与 Windows 发行物。它直接命中首次十分钟，改动可拆成四个原子 PR。采用。

### 方案 C：整体 fork 竞品

能快速得到更多功能，也会继承多服务安装、上游复杂度、资产和许可证边界。它不能继承角色内容、受众或社区，也没有证据能更快交付 Greyfield 的差异价值。拒绝。

## 目标用户路径

```mermaid
flowchart LR
  A["下载 Windows 发行文件"] --> B["双击后出现透明角色"]
  B --> C{"当前服务状态"}
  C -->|"试玩"| D["明确提示试玩，不伪装真实 AI"]
  D --> E["打开最小模型设置"]
  E --> F["填写 Base URL / API Key / 模型"]
  F --> G["Test LLM 成功"]
  G --> H["发送消息并得到真实回复"]
  H --> I["Stop 可立即中断"]
  I --> J["重启后配置和真实服务状态仍在"]
```

## 本轮四个原子交付

### 1. 产品真相、试玩状态与最近对话连续性

用户结果：用户在 Controls、Chat 和 Settings 首屏都能一眼区分“本地试玩”和“真实聊天”；麦克风在 fake ASR 下不再伪装成真实听写；重启后 Chat 只提示已恢复的最近消息数，不回显隐私正文；README 与记忆区不再宣称默认运行时已经启用长期记忆。

设计：

- 把 fake 定义为“试玩模式”，而不是默认产品能力。
- Controls 提供短状态和一个“配置真实聊天”入口。
- Chat 的固定回复带试玩标识，不把测试桩包装成人格回复。
- Chat 在重启后显示“已恢复最近 N 条对话消息”，并明确它不是长期记忆；消息数遵守现有 recent-turn 上限。
- 长期记忆区显示“当前桌面版暂未启用”，管理和 benchmark 代码仍保留为开发能力。
- fresh/default 主动说话与屏幕感知保持关闭；已有显式用户配置不被静默迁移。
- 删除所有与当前默认路径矛盾的完成声明，并用负向文本搜索保护。

非目标：不把完整历史灌进 renderer，不恢复长期记忆，不新增角色脚本，不改 fake provider 的确定性测试用途。

### 2. 配置持久化

用户结果：用户在 Settings 保存 provider、API Key presence、语音和 persona 后，普通双击重启不会回到 fake。

设计：

- 开发启动器只在配置文件不存在时写入安全默认值。
- 若配置已存在，启动器读取并保留；只由显式测试环境变量请求重置。
- 开发启动路径和打包路径各自使用稳定、可解释的配置位置。
- 新增真实磁盘证据：保存、退出、重启、重新读取，且未触碰无关 task fields。

非目标：不迁移旧版本任意配置格式，不引入云同步或系统凭据库重构。

### 3. 最小真实聊天设置

用户结果：试玩用户点一次入口即可看到最小配置，只需填写 Base URL、API Key 和聊天模型；Test LLM 成功后直接回到同一聊天路径。

设计：

- Settings 默认落在“开始聊天”，只显示 provider 类型、Base URL、API Key、聊天模型、Test LLM 和保存结果。
- 八个 task model、ASR/TTS 细节、原始 `file://` 路径、屏幕采样参数和窗口阈值进入“高级设置”，默认折叠。
- Test LLM 的失败文案分别覆盖缺失配置、401/403/404、超时和流错误；不会把失败写入聊天历史。
- Test LLM 成功只说明连接可用，不自动发送用户消息，也不自动开启语音或主动能力。
- fake ASR 时麦克风显示不可用于真实听写；配置真实 ASR 后才恢复普通入口。

非目标：不增加供应商目录、OAuth、一键购买、模型自动探测或更多 task slots。

### 4. 单文件 Windows 发行物与首次路径验收

用户结果：用户下载一个 Windows 发行文件并双击启动，不需要仓库、Node.js、pnpm、终端或 Vite dev server。

设计：

- 先交付一个版本化的 Windows portable `.exe`；代码签名、自动更新和安装器留到公开 beta 前。
- 打包 Electron main、preload、renderer 与内置 Live2D 资产；长期记忆暂停路径不得把 Windows 不支持的 SQLite native 依赖带入 production main。
- 生产配置放在 Electron `userData`，绝不写仓库 `.cache`。
- 增加 packaged smoke harness：对同一个仓库外 portable exe，从临时 `userData` 完成启动、试玩披露、Test LLM、真实 nonce 回复、Stop、退出与重启；同时证明 Pet/Controls 位于可见屏幕、`usedFallback=false` 且 Live2D 有非空模型像素。
- 生成 artifact 清单、大小和 SHA-256；不把本地绝对路径写进用户界面。

非目标：不承诺代码签名、自动更新、macOS/Linux、安装器卸载流程或公开 Release 发布。

## 架构边界

- `apps/desktop` 继续拥有 Electron 窗口、renderer UI、IPC 和打包入口。
- `packages/persistence` 继续拥有配置 schema、读写与合并语义。
- `packages/core-runtime` 继续拥有对话和中断规则；本轮不把 provider 逻辑搬进 renderer。
- `packages/dev-harness` 继续拥有可执行验收和截图证据。
- renderer 只接收脱敏配置。原始 API Key 不回传 renderer，也不进入日志、截图或 session JSONL。
- 不重写 package 边界，不引入新的后端进程，不引入插件框架。

## 状态与数据流

配置状态只有三种用户含义：

| 状态 | 条件 | 用户看到什么 | 允许的动作 |
| --- | --- | --- | --- |
| 试玩 | LLM 为 fake | 明确的试玩标识；固定回复标识为演示 | 配置真实聊天、浏览桌宠、Stop |
| 未就绪 | 选择真实 provider，但缺字段或测试失败 | 缺失项或可读错误 | 编辑、保存、重试 Test LLM |
| 已就绪 | 配置完整且本次 Test LLM 成功 | 可开始真实聊天 | 发送消息、Stop、重测 |

“已就绪”不是永久健康认证。应用重启后只能显示“真实配置已保存，待测试”；本次 Test LLM 成功后才显示“已就绪”。请求失败回到可重试状态，不静默降级成 fake；改动 provider、Base URL、API Key 或聊天模型后，旧测试成功状态立即失效。

## 错误处理

- 缺配置：阻止请求并指出具体字段。
- provider 失败：保留用户草稿，不追加半轮 session，不回退 fake。
- 配置写入失败：显示保存失败，不更新 renderer 的“已保存”状态。
- packaged 资源缺失：启动失败必须写明缺哪个资源；harness 失败，不允许 fallback 图冒充真实 Live2D。
- Stop：请求 abort 后，旧流的任何 chunk、TTS 任务、播放队列和嘴型更新都不得继续。
- 记忆：当前禁用时只显示不可用状态，不展示“已开启”或暗示本轮会跨重启记住偏好。

## 验收与停止条件

### 自动验收

- 单元测试：配置首次创建、已有配置保留、显式测试重置、无关字段不变。
- Settings 测试：试玩、未就绪、已就绪和 provider 错误状态。
- Electron restart harness：保存真实 provider 配置后重启仍在，且没有回到 fake；Chat 显示有界的最近对话恢复提示，第二次 provider 请求仍携带上一轮 recent context。
- 首眼视觉 harness：从默认状态看见试玩状态与真实聊天入口，无需滚动或开发快捷键。
- packaged smoke harness：同一个发行 exe 完成真实 Test LLM、真实回复、Stop 与重启；截图显示非空 Live2D 像素并明确 `usedFallback=false`。
- Stop 现有 provider-abort 与 stop-audio 门禁继续作为模块回归，但不能替代 portable 自身的 Stop 证据。

### 独立验收

最终验收由未参与实现的 sub-agent 完成。该 agent 必须从发行 artifact 和临时用户目录开始，不读取实现者的开发状态；检查普通用户路径、截图、配置重启、真实 provider stub、Stop 和负向文案搜索。实现者自测不能替代该验收。

### 本轮通过条件

- Windows artifact 可在没有项目依赖的路径启动。
- 默认界面不再把 fake LLM、fake ASR 或禁用的长期记忆包装成真实能力。
- 一条最小 provider 设置路径可完成 Test LLM 与真实流式回复。
- 重启后配置不丢。
- Stop 回归门禁通过。
- 独立 sub-agent 给出“通过”，且没有 P0/P1 首次使用缺陷。

若以上任一项失败，本轮不得宣称“可下载 MVP”。若三名新用户中无人能在十分钟内完成真实对话，下一步应继续删减入口，而不是启动记忆、屏幕感知或插件工作。

## 后续批次

本轮通过后才启动第二批：恢复一个受控的长期记忆闭环——记住一个名字或偏好、重启后自然想起、显示来源、删除后不再召回。该批次仍不包含屏幕主动观察、插件、桌面控制、多角色、移动端、Agent 或 VR/AR。
