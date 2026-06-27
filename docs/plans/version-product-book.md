# Greyfield Next 版本产品书

更新时间：2026-06-26

## 产品定位

Greyfield Next 要从一个稳定的 Live2D 桌面桌宠，逐步发展成一个可长期陪伴、可理解用户工作上下文、可在用户授权下辅助操作电脑的本地 AI 伴侣。

产品不能变成普通聊天壳，也不能一口气变成失控的自动 agent。每个版本都必须保持三个约束：

1. 桌宠本体始终是第一入口：透明、低打扰、可拖动、可隐藏、可恢复。
2. 智能能力必须可解释、可关闭、可审计。
3. 每个版本的完成标准必须能被测试、harness、截图或人工验收步骤证明。

## 版本总览

| Version | 版本名 | 用户价值 | 核心能力 | 不做什么 |
| --- | --- | --- | --- | --- |
| V1.0 | 活着的桌宠底座 | 用户能看到、移动、聊天、听到声音，并且不会被打扰或卡死 | Live2D 桌宠、透明穿透、文字聊天、语音输入输出、Stop、最近上下文 | 不做读屏、电脑操控、长期任务、多 agent、语音克隆 |
| V1.1 | 可交付桌宠产品化 | 普通用户能稳定安装、配置、恢复、排错 | 安装/更新、模型管理 UX、设置 polish、日志/诊断、真实 provider release 证据 | 不新增大能力，不改变 V1 主链路 |
| V2.0 | 角色与长期记忆 | 用户感觉它认识自己、记得关系和偏好 | 记忆分层、记忆编辑、角色卡、人设自定义、角色资产绑定 | 不做屏幕读取和电脑执行 |
| V2.1 | 屏幕感知伴侣 | 用户主动让它看当前屏幕/窗口并解释 | 截图分析、窗口选择、读屏状态、隐私提示、视觉问答 | 不默认持续监控，不自动操作电脑 |
| V2.2 | 受控电脑操控 | 用户确认后，它能执行小而明确的桌面动作 | 操作计划、用户确认、受限点击/输入/打开应用、停止/回滚/日志 | 不做无人值守长期自动化，不绕过确认 |
| V2.3 | 高级语音与声音人格 | 用户能给角色选择或训练更贴合的人声 | TTS provider 管理、声音 profile、试听、语音克隆导入/同意/删除 | 不无授权克隆真人声音，不把音频上传行为藏起来 |
| V3.0 | 可扩展伴侣平台 | 高级用户能组合角色、工具和内容包 | 插件/技能沙箱、多角色、内容包、权限模型、社区资产策略 | 不牺牲本地隐私和桌宠低打扰体验 |

## V1.0：活着的桌宠底座

### 一句话目标

交付一个真正像桌宠的 Live2D AI 伴侣：透明站在桌面上，可拖动、可穿透、可文字/语音聊天、会记住最近上下文，并且 Stop 能停止文字、声音、嘴型和队列。

### 核心用户故事

- 用户打开应用，看到的是桌面上的 Live2D 角色，不是一个网页窗口。
- 用户能拖动、缩放、隐藏、恢复桌宠，不影响桌面正常使用。
- 用户能输入文字或语音，收到流式回复、短气泡和完整 Chat 历史。
- 用户能随时 Stop，且不会继续追加旧回复、重叠播放语音或嘴型卡住。
- 用户能配置 OpenAI-compatible provider，并看懂失败原因。

### 验收

- `docs/plans/v1-product-plan.md` 和 `docs/v1-completion-evidence.md` 是 V1 的具体完成依据。
- 前端可见改动必须跑 `pnpm harness:frontend-full` 或等价 CI 证据。
- V1 完成口径只能来自 merged `main` current-head evidence，不来自 PR-local evidence。

## V1.1：可交付桌宠产品化

### 一句话目标

把 V1 从“工程上可用”打磨成“普通用户可安装、可配置、可恢复、可排错”的小产品。

### 核心能力

| 能力 | 产品要求 | 验收方式 |
| --- | --- | --- |
| 安装与启动 | Windows 用户能下载/启动，不需要手动安装开发依赖 | 打包产物 smoke；首次启动截图；安装失败提示 |
| 模型管理 | Settings 有模型列表、导入、当前模型、重置、错误提示 | 用户路径 harness；导入有效/无效 `.model3.json` fixture |
| Provider 配置 | LLM/TTS/ASR 配置分区清楚，fake/real 状态不混淆 | Settings provider harness；真实 env smoke |
| 日志与诊断 | 用户能导出诊断包，秘密被 redacted | 日志 redaction test；诊断包结构测试 |
| 恢复能力 | 设置窗口、Chat、controls、tray 都能恢复应用控制 | Electron lifecycle harness |
| 发布证据 | release checklist 明确当前 head、命令、产物、截图 | release doc update + CI link |

### 不做什么

- 不新增读屏、电脑操控、插件市场。
- 不把打包当成重构入口。
- 不把更多模型/声音资源硬编码进源码。

## V2.0：角色与长期记忆

### 一句话目标

让 Greyfield 从“能聊天的桌宠”变成“有连续关系的角色”：它记得用户、记得自己、能被用户编辑人设，并且记忆行为可审计。

参考研究：

- [Clowder AI memory notes](../research/v2-memory/clowder-ai.md)
- [SillyTavern memory notes](../research/v2-memory/sillytavern.md)
- [MaiBot memory notes](../research/v2-memory/maibot.md)
- [Greyfield V2.0 memory synthesis](../research/v2-memory/synthesis.md)
- [V2 memory implementation goal](v2-memory-goal.md)

### 能力拆分

| 模块 | 产品形态 | 必须看护 |
| --- | --- | --- |
| 角色卡 | name、称呼、性格、背景、边界、问候语、说话风格 | schema test；Settings 编辑/保存/恢复 harness |
| 人设绑定 | 角色绑定 Live2D 模型、声音、provider 默认值、气泡风格 | 切换角色后模型/声音/人设一致 |
| 记忆分层 | persona memory、user memory、relationship memory、facts、preferences | 不同 memory 类型单独显示、编辑、删除 |
| 自动记忆 | 从对话中提出候选记忆，用户确认后写入 | 没有确认不能静默写长期记忆 |
| 摘要记忆 | 长对话压缩成可读摘要，保持最近上下文预算 | memory benchmark fixture；source traceability；token budget test |
| 记忆检索 | 根据当前对话召回少量相关记忆 | recall ranking fixture；false-positive rejection；不会注入无关大段历史 |
| 隐私控制 | 查看、导出、删除、禁用记忆 | export/delete tests；UI 明确状态 |

### 用户故事

- 用户能创建一个新角色，填写人设和称呼，绑定 Hiyori 或导入模型。
- 用户能告诉桌宠“我不喜欢它叫我老板”，系统会生成记忆候选，用户确认后长期生效。
- 用户能打开记忆页，看见它记住了什么，并删除错误记忆。
- 用户能切换角色，角色 A 的记忆不会污染角色 B。

### 验收标准

- 记忆写入必须有测试覆盖：自动候选、用户确认、拒绝、编辑、删除。
- Prompt 组装必须证明 persona、user memory、recent turns 分层注入且有 token 上限。
- UI harness 必须覆盖普通用户路径：创建角色、修改人设、确认记忆、删除记忆、重启后仍生效。
- 自动记忆、记忆分层、向量召回等后续 V2.0 能力必须先扩展并通过 `pnpm harness:memory-benchmark`，不能只靠人工聊天感觉验收。

## V2.1：屏幕感知伴侣

### 一句话目标

让用户可以主动把当前屏幕、窗口或区域交给桌宠理解，但不让应用默认持续监控屏幕。

### 能力拆分

| 阶段 | 能力 | 产品边界 |
| --- | --- | --- |
| V2.1a | 手动截图问答 | 用户点击“看屏幕”后截一次图并提问 |
| V2.1b | 选择窗口/区域 | 用户选择窗口、显示器或矩形区域，截图前有预览 |
| V2.1c | 屏幕上下文摘要 | 用户允许后，对当前截图生成短上下文供下一轮对话使用 |
| V2.1d | 可见读屏状态 | 桌宠/controls 显示是否正在看屏幕、看哪块区域、何时停止 |

### 隐私边界

- 默认不读屏。
- 不后台持续截图。
- 不把截图写入长期记忆，除非用户明确保存。
- 截图、OCR、视觉模型调用必须显示本地/云端状态。
- 日志和诊断包不能包含原始截图，除非用户主动导出并确认。

### 用户故事

- 用户点击 controls 的“看屏幕”，选择当前窗口，问“这个报错是什么意思”。
- 桌宠用气泡给短解释，Chat 里给完整分析。
- 用户能点 Stop 或关闭读屏状态，之后不会继续引用旧截图。

### 验收标准

- UI harness 覆盖截图按钮、预览、确认、取消、Stop。
- Provider harness 覆盖 fake vision path 和至少一个 OpenAI-compatible vision path。
- 隐私测试证明截图不会进入 session/diagnostic，除非显式保存。

## V2.2：受控电脑操控

### 一句话目标

在用户授权下，让桌宠能执行小而明确的电脑动作，但每一步都可见、可确认、可停止、可审计。

### 操作分级

| 等级 | 能力 | 是否需要确认 | 示例 |
| --- | --- | --- | --- |
| L0 | 只建议，不执行 | 不需要 | “你可以点击右上角设置” |
| L1 | 低风险本应用操作 | 需要轻确认 | 打开 Greyfield Settings、切换静音 |
| L2 | 系统 UI 操作 | 需要明确确认 | 点击指定窗口按钮、输入一段用户给的文本 |
| L3 | 文件/网页/应用操作 | 需要计划确认和日志 | 打开应用、保存文件、复制内容 |
| L4 | 长任务/跨应用自动化 | V2.2 不做 | 无人值守整理文件、自动发消息 |

### 产品形态

- 操作前显示计划：要操作哪个窗口、做几步、可能影响什么。
- 用户确认后执行，执行中 controls 显示“正在操作”。
- 每一步有日志：观察、计划、动作、结果。
- Stop 必须立即停止后续动作。
- 高风险动作需要二次确认或禁止。

### 安全边界

- 不绕过系统权限。
- 不输入隐藏密码。
- 不自动发送消息、付款、删除文件。
- 不在未知窗口盲点。
- 不持续后台操作。

### 验收标准

- fake desktop environment harness 覆盖观察、计划、确认、动作、Stop、日志。
- 真实 Windows smoke 只覆盖低风险动作，例如打开 Settings 或点击测试窗口按钮。
- 每个 action adapter 都有权限声明和 redaction 测试。

## V2.3：高级语音与声音人格

### 一句话目标

让角色声音从“能发声”升级为“符合角色的人声”，同时保护用户和第三方声音权益。

### 能力拆分

| 能力 | 产品要求 | 风险控制 |
| --- | --- | --- |
| TTS provider 管理 | 支持 provider 列表、speaker 列表、试听、健康检查 | 错误可读；不阻塞文字聊天 |
| 声音 profile | 角色绑定 voice id、语言、语速、情绪参数 | profile 和角色卡一起导出/导入 |
| 本地 TTS adapter | 支持本地 VITS/GPT-SoVITS/CosyVoice 类服务 | 本地服务状态清楚，不强制安装 |
| 语音克隆导入 | 用户导入授权音频，生成或选择声音 profile | 必须有同意声明、删除入口、用途提示 |
| 语音质量 QA | 首句不爆音、不重叠、可 Stop、嘴型同步 | 继承 V1 stop-audio + waveform mouth harness |

### 不做什么

- 不内置无授权真人声音。
- 不把用户音频默认上传到云端。
- 不把语音克隆做成隐藏功能。
- 不让 TTS 失败破坏文字回复。

### 验收标准

- Settings 覆盖 provider health、speaker list、Test Voice、失败回退。
- 声音 profile 导入/导出不泄露 API key。
- 克隆音频删除后，相关本地文件和 profile 引用都被清理。

## V3.0：可扩展伴侣平台

### 一句话目标

在 V1/V2 的稳定桌宠、记忆、屏幕感知和受控操作基础上，开放角色包、工具包和社区扩展，但不牺牲隐私和控制感。

### 可能能力

- 多角色同时显示或切换。
- 角色包：Live2D 模型、人设、声音、动作、气泡样式、默认 provider。
- 工具包：受限工具声明、权限、UI、测试夹具。
- 内容包导入：世界书、知识库、台词库。
- 本地 sandbox 或权限系统。
- 资产 license 检查和社区内容策略。

### 进入条件

- V2.0 记忆和角色卡稳定。
- V2.1 屏幕感知隐私边界稳定。
- V2.2 操作权限和日志稳定。
- V2.3 声音权益和 provider 管理稳定。

## 对标参考维度

Greyfield 对标常见 AI 桌宠/虚拟伴侣项目时，比较维度应该是产品能力矩阵，不是照搬技术栈。

| 维度 | Greyfield 目标 | 参考启发 |
| --- | --- | --- |
| 桌宠存在感 | 透明、低打扰、可恢复、可交互 | AIRI Tamagotchi-style stage、Desktop Mate 类桌面角色 |
| 角色表现 | Live2D、动作、表情、触摸、嘴型、气泡 | AIRI Live2D/VRM 角色体，ZcChat/ZcChat2 角色表现 |
| 对话与语音 | LLM/TTS/ASR provider、流式响应、Stop 一致 | LogChat 类组合产品，VITS/Whisper adapter 形态 |
| 长期记忆 | 可编辑、可删除、可审计、可分层 | Letta 的 persona/human memory 分离 |
| 资产与角色 | 模型、声音、人设、记忆绑定成角色 | 桌宠/VTuber 资产包思路 |
| 屏幕感知 | 主动授权截图/窗口理解 | AI companion 的视觉上下文能力 |
| 电脑操控 | 计划确认、受限动作、日志、Stop | agent 工具调用，但收紧到桌面产品安全边界 |

## 版本推进规则

1. 每个版本先写产品书，再写 manifest/issue，再实现。
2. 每个版本都要有 fake/local harness，不能依赖外部 key 才能验收。
3. 每个会碰用户隐私的能力都要有可见状态、关闭入口、导出/删除策略。
4. 每个会操作电脑的能力都要有确认、停止、日志和禁止动作清单。
5. 不允许把下一个版本的能力偷塞进当前版本的完成口径。
6. 用户手工发现的问题必须补最近的 harness 或验收步骤。

## 推荐 Issue 拆分

### V1.1

- V1.1 安装/启动 smoke 与 release checklist。
- V1.1 模型管理 UX：模型列表、导入、当前模型、错误提示。
- V1.1 诊断包与日志 redaction。
- V1.1 provider release evidence：真实 LLM/TTS/ASR env rerun。

### V2.0

- V2.0 角色卡 schema 与 Settings 编辑 UI。
- V2.0c 记忆评测 benchmark：长聊摘要、冲突更新、噪声过滤、禁用/删除、召回排序、false positive、prompt budget、source traceability。
- V2.0 长期记忆分层 store、编辑、删除、导出。
- V2.0 自动记忆候选与用户确认。
- V2.0 prompt memory injection 与 token budget harness。
- V2.0 角色资产绑定：模型、声音、人设、气泡风格。

### V2.1

- V2.1 手动截图问答与 fake vision harness。
- V2.1 窗口/区域选择和截图预览。
- V2.1 屏幕感知隐私状态与 Stop。
- V2.1 视觉上下文不进长期记忆的隐私测试。

### V2.2

- V2.2 action plan UI：计划、确认、执行、Stop、日志。
- V2.2 本应用低风险操作 adapter。
- V2.2 Windows 测试窗口点击/输入 harness。
- V2.2 禁止动作和权限声明测试。

### V2.3

- V2.3 TTS provider/speaker 管理。
- V2.3 voice profile schema 与角色绑定。
- V2.3 本地 TTS service adapter。
- V2.3 语音克隆导入、同意、删除与 redaction。
