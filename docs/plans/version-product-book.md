# Greyfield Next Version Product Book

更新时间：2026-06-29

## 产品定位

Greyfield Next 的目标不是普通聊天壳，而是一个长期存在在桌面上的 Live2D AI 伴侣。它要先像桌宠一样稳定可控，再逐步拥有记忆、单人设、交互/截图感知、声音人格和受控电脑操作。

产品推进遵守三条硬规则：

1. 桌宠入口优先：透明、可拖动、可隐藏、可恢复、低打扰。
2. 能力必须可关、可查、可删、可测试。
3. 每个版本必须有 issue、验收口径和自动化看护，不能靠聊天感觉宣布完成。

## 版本编号规则

- 大版本表示产品层级：V1 是可用桌宠，V2 是长期伴侣，V3 是可扩展平台。
- 小版本表示一个用户价值闭环，例如 V2.1 是长期记忆。
- 字母阶段表示可派工的子目标，例如 V2.1c 是长期记忆抽取与写入。
- 每个阶段必须写清楚：背景、要做什么、预期效果、验收看护、不做什么。

## 版本总览

| Version | 版本名 | 用户价值 | 当前优先级 |
| --- | --- | --- | --- |
| V1.0 | 活着的桌宠底座 | 能看见、能拖动、能聊天、能听说、能 Stop | 已完成，后续只做回归 |
| V1.1 | 产品化收尾 | 普通用户能安装、配置、恢复、排错 | 后台推进，不阻塞 V2 设计 |
| V2.1 | 长期记忆与关系连续性 | 它记得用户、关系、共同经历，并能在未来自然想起 | 最高优先级 |
| V2.2 | 单人设与角色稳定 | 用户能塑造当前伴侣是谁，而不是管理一堆角色 | V2.1 稳定后 |
| V2.3 | 交互模型与截图感知 | 先用低开销 interaction model 理解用户正在做什么，必要时用户主动给截图 | V2.2 后 |
| V2.4 | 声音人格与内置音频版本 | 角色声音更稳定，并有几个内置声音版本可选 | 可与 V2.2 局部并行 |
| V2.5 | 受控电脑操作 | 用户确认后，它能做小而明确的桌面动作 | V2.3/V2.4 后 |
| V3.0 | 可扩展伴侣平台 | 角色包、工具包、内容包和插件生态 | V2 能力稳定后 |

## 产品书读法

本产品书先回答用户问题，再回答工程问题。

每个版本必须按这个顺序判断：

1. 用户会感觉到什么变化。
2. 现在打开应用能不能感受到这个变化。
3. 哪些能力只是后台地基或 benchmark 证据，还不是产品体验。
4. 哪些缺口会让用户仍然觉得它“不像真的记得我”。
5. 下一步 issue/PR 只服务一个明确的用户可感知变化。

不能用“合了几个 PR”“跑了几个测试”“加了几个包”代替产品进度。工程证据只回答可信度，不回答用户价值。

## V1.0：活着的桌宠底座

### 背景

V1 解决的是“这是不是一个真正的桌宠”。如果透明、拖动、输入、语音、Stop、Settings 这些基础体验不稳定，后续智能能力没有意义。

### 要做什么

- Live2D 模型站在桌面上，而不是网页窗口里。
- 透明区域穿透，模型区域可拖动。
- 桌面浮动输入控件支持文字、麦克风、语音输出、设置、穿透、隐藏、Stop。
- OpenAI-compatible LLM/TTS/ASR 能走真实链路。
- Stop 能停止文字、语音、嘴型和队列。

### 预期效果

用户打开应用后，不需要先打开 Chat 或 Settings，就能直接和桌宠互动；出错时也能停止和恢复。

### 验收看护

- `packages/dev-harness/v1-features.json`
- `pnpm harness:frontend-full`
- `docs/v1-completion-evidence.md`
- 只用 merged `main` current-head evidence 写完成口径。

### 不做什么

- 不做长期记忆、读屏、电脑操作、插件市场。
- 不把 V2 能力塞进 V1 完成标准。

## V1.1：产品化收尾

### 背景

V1 已经证明桌宠主链路可用，但普通用户还需要更稳定的安装、配置、诊断和模型管理体验。

### 要做什么

- 打包和首次启动 smoke。
- Settings 模型列表、导入、当前模型、重置和错误提示。
- Provider 配置分区，fake/real 状态不混淆。
- 诊断包和日志 redaction。
- 设置、Chat、controls、tray 的窗口恢复。

### 预期效果

用户不需要开发环境，也能启动、配置、排错；遇到问题能导出不含密钥的诊断信息。

### 验收看护

- 打包产物 smoke。
- Settings 普通用户路径 harness。
- 日志 redaction test。
- release checklist 写明 head、命令、产物和截图。

### 不做什么

- 不新增大智能能力。
- 不把打包当成重构入口。

## V2.1：长期记忆与关系连续性

### 一句话目标

让 Greyfield 从“会聊天”变成“和用户有共同历史”：它能记住事实、偏好、纪念日、承诺、情绪场景和原始聊天证据，并在未来相关时自然想起。

### 用户体验目标

V2.1 成功时，用户不需要打开调试面板，也不需要审批一堆候选记忆。用户只会感觉：

- 我明确说“记住”的事情，它以后真的会用。
- 我随口讲过的重要经历，它不会马上忘。
- 它想起旧事时能说出当时的细节，而不是只给一条模糊 summary。
- 它在合适时机轻轻提起共同经历，不像通知机器人刷存在感。
- 它记错时，我能看见来源、修改、禁用、删除或导出。

### 当前人话状态

截至 2026-06-29，current-head `73e275b44e0d04191af0fb874f96d722229a4e04` 已达到最低 MaiBot-style long-chat memory loop，可以作为 V2.1 收口；但它不是完整的长期记忆产品，也不是完整 MaiBot/A_Memorix parity。

用户已经能感知到的是：

- 原始聊天不会被 summary 覆盖，summary 和 memory atom 可以带来源。
- Settings Memory Library 已经能查看和管理 summary/current-role atom memory：编辑、禁用、启用、删除、导出、清空当前角色 atom、角色隔离、重启后持久化。
- 桌面路径已经能显示低打扰 proactive memory bubble，并证明冷却、全局禁用和不污染聊天历史。
- 旧游戏吐槽、生日/第一次相遇、玫瑰偏好、重要日子/礼物仪式、雨天虚拟家火锅这类样例已经能被 benchmark 看护：召回时可以带来源、预算、跳过原因和原文片段。
- 删除 summary/atom 后，已记住的来源证据不会再通过召回、来源视图、导出、prompt 或 proactive recall 暴露。

仍然不能完整承诺的是：

- deterministic semantic/relationship graph-equivalent 最小路径已经能覆盖关系仪式召回；广义 embedding/vector DB、完整 node-edge relationship graph 和完整关系事件层还没有实现，这组 A-Memorix 级基础设施后移到 V3 遗留，不作为 V2.2 要求。
- 桌面路径已有受控 scene-signal scheduler 和 proactive bubble；真实外部天气、虚拟家、屏幕、久别天数等信号采集还没有实现。
- Memory Library 已有 harnessed source views；每种记忆都能在 renderer 里点开“为什么想起这个”的 polished UI 仍未完成。
- LLM-backed atom extraction 仍是显式 runtime 模式和 scripted provider 证据，不是默认 Settings/桌面产品流。
- Privacy classification 仍有限；raw session JSONL 仍作为本地非产品存储存在，但删除后的已记住证据不会出现在产品召回、来源、导出或 prompt 路径里。

所以 V2.1 的人话结论是：Greyfield 已经有最低长期聊天记忆闭环，用户能看到可管理记忆和主动气泡；核心记忆质量主要由 benchmark/backend 证明；完整“像共同生活很久一样自然想起”的产品体验进入 V2.2+。

### #125 MaiBot parity 收口矩阵

| #125 对标线 | V2.1 状态 | Current-head 证据 | 后移项 |
| --- | --- | --- | --- |
| 长聊压缩 | done | `pnpm harness:memory-benchmark` 通过 summary regression 和 long-chat source traceability；summary segment 带 source turn ids 和 recall cues。 | LLM summarizer 可后续提升质量，但最低 source-linked compression 已成立。 |
| 结构化长期记忆 | partial | benchmark 覆盖 preference、relationship date、rose preference、game opinion、privacy rule、episodic scene 等 source-linked atoms；invalid LLM 输出会 fallback。 | 默认桌面 LLM extraction UX、更多 promise/relationship/scene 覆盖和更强 privacy classification 后移。 |
| 触发召回 | partial | 覆盖 exact/cue/alias/secondary、calendar、deterministic semantic/relationship ritual recall、false-positive rejection、budget、disabled skip、pure core scene proactive candidates，以及 production scene-signal scheduler + desktop proactive message。 | 完整 embedding/vector DB 与 node-edge relationship graph 后移到 V3；真实环境/虚拟家 signal feed 仍是后续产品化工作。 |
| 原文回查 | partial | atom recall 可把 linked raw source fragments 注入 prompt material；Memory Library source 状态和截图由 Electron harness 覆盖。 | 每种 memory type 的 polished source-explanation UI 后移。 |
| 可管理和可退化 | partial | `harness:electron:memory-control` 与 `harness:electron:memory-atom-library` 证明编辑、禁用、启用、删除、导出、当前角色清空、角色隔离、reload persistence、secret 排除、无 pending approval、hard-erased remembered evidence 不再进入产品召回/来源/导出/prompt；系统不依赖 vector/embedding。 | raw JSONL 本地非产品存储、默认 LLM extraction UX、所有 memory type 的完整来源管理和更广 privacy classification 后移。 |

### 三个必须打穿的体验样例

1. 纪念日和承诺：用户说“今天是我们第一次见面，我送你玫瑰，明年也记得送我礼物或玫瑰”。明年同一天，它能想起这个关系事件和仪式。
2. 观点和原文：用户说某游戏很烂并列了很多原因。一年后用户说新游戏像那个很烂的游戏，它能召回旧游戏、旧观点，并从原始聊天找回具体原因。
3. 情境和宿命感：某天下雨，用户说他们在虚拟家里开窗吃火锅。很久后虚拟世界又下雨，它能低打扰地想起那次共同经历。

### 产品原则

1. 用户不应该每天审批“候选记忆”。后台负责抽取，用户负责纠错、删除、关闭和明确保存。
2. 明确说“记住、以后、每年、别忘了、不要再”时，必须写入长期记忆。
3. 记忆不是只有 summary。压缩记忆必须能回查原始聊天。
4. 触发不只靠关键词，还包括日期、环境、语义相似、角色关系和场景意象。
5. Benchmark 分数必须从低分开始，功能提升后再提高 baseline，禁止用满分伪装完成。

### V2.1a：记忆 Benchmark 与验收骨架

**背景**
记忆效果用户很难每次手工验收，尤其是一年后召回、原文追溯、场景触发和错误写入。没有 benchmark，就会出现“功能没做完但测试满分”的假完成。

**要做什么**

- 建立 fixture-driven memory benchmark。
- 分数拆成 summary、extraction、trigger recall、calendar recall、evidence drilldown、noise rejection、privacy/delete。
- Fixture 必须包含低分基线，未实现能力不能拿满分。
- CI 跑 benchmark，后续 PR 不能低于当前 baseline。

**预期效果**
每次记忆改动都能知道“哪些能力变好了，哪些还没做”，用户不需要靠人工聊天判断。

**验收看护**

- `pnpm harness:memory-benchmark`
- baseline scores 写在 fixture 中。
- CI 低于 baseline 失败。
- 新能力 PR 必须同时更新 case 和 accepted score。

**不做什么**
不把 benchmark 写成硬编码台账，不用一条假 summary 覆盖所有记忆能力。

### V2.1b：原始聊天索引与层级记忆

**背景**
长期记忆如果只存摘要，会丢失细节。用户一年后提到“那个很烂的游戏”，系统需要先命中压缩记忆，再回查当时原话找具体缺点。

**要做什么**

- 保留 append-only raw chat turns。
- 每条 summary、memory atom、scene memory 都带 `sourceTurnIds`。
- 建立 source index，支持从记忆回查原始聊天片段。
- 长对话按时间段生成 summary segment，summary 不替代原文。

**预期效果**
系统能用 summary 节省上下文，也能在需要细节时找回原始证据。

**验收看护**

- 删除 summary 不删除 raw turns。
- 记忆召回能返回 source turn id。
- evidence drilldown benchmark 验证能找回原始细节。

**不做什么**
不把 summary 当事实真相，不让原始聊天被压缩覆盖。

### V2.1c：长期记忆抽取与写入

**背景**
长期记忆不能停留在“手动编辑一段 memory.md”。Greyfield 需要像 MaiBot/A_Memorix 那样从对话里抽取概念、关系和事件，但不能打扰用户审批每条候选。

**要做什么**

- 用 LLM 抽取 memory atom，而不是只靠关键词规则。
- 支持事实、偏好、观点、禁忌、承诺、关系事件、重要日期、情境场景。
- 明确保存语句必须直接写入长期记忆。
- 后台自动写入要有重要性阈值、冷却和去重。
- 每条记忆保留简短自然语言、结构化字段、trigger keys、source turn ids。

**预期效果**
用户说“以后叫我博士”“我今天生日”“我送你一朵玫瑰”“我讨厌这个游戏的付费和剧情”，系统能转成可召回的长期记忆。

**验收看护**

- extraction benchmark 覆盖明确保存、生日/纪念日、游戏观点、临时噪声不写入。
- store tests 覆盖写入、更新、去重、删除。
- prompt tests 证明只有相关记忆进入上下文。

**不做什么**
不做 Settings 里的 pending approval 列表；不要求用户逐条确认后台提取结果。

### V2.1d：触发召回与原文追溯

**背景**
酒馆 World Info 的价值在于“相关时自动触发”。Greyfield 记忆也必须能通过关键词、别名、语义、日期和环境触发，而不是只有用户问“你记得吗”。

**要做什么**

- 建立 trigger lanes：exact/alias、secondary keys、semantic、calendar、environment、relationship graph。
- 支持 source drilldown：压缩记忆命中后，必要时回查 raw turns 补足细节。
- Prompt 注入要有预算和 trace，避免塞入无关历史。

**预期效果**
一年后用户说“这个新游戏也很傻逼，好像之前某个游戏”，系统能想起旧游戏，并回查当时提到的具体缺点，例如节奏、付费、剧情。

**验收看护**

- trigger recall benchmark 覆盖别名、语义相似、false positive。
- evidence drilldown benchmark 要求回答材料包含原始缺点。
- prompt budget test 证明无关记忆被跳过且有原因。

**不做什么**
不把所有历史都塞进 prompt；不靠最近聊天碰巧命中。

### V2.1e：情境记忆与主动关系触发

**背景**
长期陪伴的核心不是背事实，而是像小说一样记得共同经历：某天下雨，虚拟世界的家里开着窗吃火锅。很久以后又下雨，它应该能自然想起，而不是等用户输入关键词。

**要做什么**

- 抽取 `episodic_scene`：地点、天气、物品、动作、情绪、关系意义、时间。
- 支持环境触发：虚拟世界下雨、用户长期未上线、当前场景是家/窗边。
- 支持低打扰主动消息：有冷却、有重要性阈值、可关闭。
- 主动消息用角色语言表达，不暴露 memory id 或数据库术语。

**预期效果**
用户很久没上，虚拟世界下雨时，桌宠可以发出类似“窗外又下雨了，我想起那次我们在家里开着窗吃火锅”的消息。

**验收看护**

- scene extraction benchmark 覆盖雨、窗、火锅、虚拟家、共同经历。
- proactive trigger benchmark 覆盖“30 天未上线 + 下雨”命中。
- 负例覆盖“昨天刚上线”或“普通天气变化”不打扰。

**不做什么**
不做高频通知，不做未经允许的外部推送，不把环境触发写成硬编码彩蛋。

### V2.1f：记忆管理 UX 与隐私

**背景**
用户不应该审批候选，但必须能看见、修改、删除、导出、关闭记忆。信任来自可纠错，而不是每条都打扰。

**要做什么**

- Settings 提供 Memory Library：事实、偏好、关系、事件、场景、summary 分组。
- 每条记忆显示自然语言、来源、最近使用、启用状态。
- 支持编辑、删除、禁用、导出、清空角色记忆。
- 角色/用户/会话记忆隔离。

**预期效果**
系统平时自动记，用户发现不对时能修；换角色时不会串记忆。

**验收看护**

- Electron harness 覆盖编辑、禁用、删除、导出、重启后持久化。
- privacy tests 覆盖导出不含 API key，删除不残留可召回数据。
- role isolation test 覆盖角色 A/B 记忆不互相污染。

**不做什么**
不做 pending candidates 区，不把 Settings 变成调试面板。

### V2.1g：记忆分数门禁与回归流程

**背景**
记忆是主观体验，但工程上必须有可回归分数。否则每次重构都会退化成“我感觉还行”。

**要做什么**

- 记录每个 benchmark 维度的 baseline。
- 每个 PR 改记忆能力时必须说明分数变化。
- 分数提升后更新 baseline；分数下降必须解释并修复。
- 合入前看 CI/CodeRabbit，开发过程中不因远端等待卡住主线。

**预期效果**
记忆能力像 vLLM Omni 的 benchmark 一样可追踪，sub agent 可以按分数和 issue 拆工。

**验收看护**

- CI 跑 `pnpm harness:memory-benchmark`。
- PR body 写当前分数、变化原因和未覆盖能力。
- `docs/progress.md` 记录当前 main 分数。

**不做什么**
不在开发中长时间刷 CI；等待远端检查交给低频 watcher 或 sub agent。

## V2.2：单人设与角色稳定

### 背景

长期记忆需要落在一个稳定的人设上。V2.2 先参考 MaiBot 的单伴侣/单人设路线：用户不是在管理角色库，而是在把当前 Greyfield 调成“她是谁、怎么称呼用户、怎么说话、有哪些边界”。

这一步不做多人设切换。V2.1 已有 current-role memory isolation 的地基，但 V2.2 的产品目标是让一个默认伴侣稳定下来，而不是提前做角色市场或多角色管理。

### 子目标

| ID | 目标 | 要做什么 | 验收看护 |
| --- | --- | --- | --- |
| V2.2a | 单人设 schema | name、用户称呼、背景、性格、边界、问候语、说话风格 | schema tests；import/export tests |
| V2.2b | 当前伴侣资产绑定 | 当前 Live2D 模型、voice profile、provider 默认值、气泡风格绑定到同一个人设 | settings persistence tests；asset binding tests |
| V2.2c | 人设注入与风格稳定 | persona、memory、recent turns 分层组装 prompt，避免记忆压过人设 | prompt snapshot；token budget |
| V2.2d | Settings 单人设编辑 | 普通用户能编辑当前伴侣，不需要创建/切换/删除多个角色 | Electron harness；视觉截图 |

### 预期效果

用户能塑造“这个桌宠是谁”，并且她的记忆、声音、模型和说话方式是一致的。

### 不做什么

不做多角色同时在线，不做角色库切换，不做插件化角色市场。

## V2.3：交互模型与截图感知

### 背景

用户希望桌宠能理解“我现在在干什么”，但持续截图/视觉理解成本高、隐私重、速度也慢。V2.3 先建立低开销 interaction model：从用户主动聊天、桌宠交互、窗口/模式状态、最近操作意图、受控场景信号中形成轻量上下文；截图作为用户主动触发的高成本补充输入，而不是默认背景能力。

### 子目标

| ID | 目标 | 要做什么 | 验收看护 |
| --- | --- | --- | --- |
| V2.3a | Interaction model | 记录低开销交互上下文：用户主动输入、桌宠状态、当前窗口模式、最近操作意图、受控 scene signals | runtime/context tests；prompt snapshot |
| V2.3b | 手动截图问答 | 用户点击“看屏幕/给截图”后截一次图或导入截图并提问 | fake vision harness |
| V2.3c | 截图范围与预览 | 选择窗口、显示器或矩形区域，截图前预览，默认不后台采集 | UI harness；privacy harness |
| V2.3d | 感知与记忆边界 | interaction context 和截图默认不进长期记忆，显式保存才写入 | redaction/export tests；memory benchmark case |

### 预期效果

大多数时候 Greyfield 通过轻量交互上下文知道“你是在聊天、设置、调模型、刚刚让她安静、刚才提到某个任务”；只有用户主动给截图时，它才看具体画面。截图用完后不会被默认长期记住。

### 不做什么

不默认持续截图，不后台监控，不无提示上传截图，不把截图/窗口标题当成长期记忆自动写入。

## V2.4：声音人格与内置音频版本

### 背景

V1 解决“能发声”。V2.4 解决“声音像这个伴侣”，先提供几个内置音频版本和稳定试听/切换体验，而不是一开始做复杂语音克隆产品。

### 子目标

| ID | 目标 | 要做什么 | 验收看护 |
| --- | --- | --- | --- |
| V2.4a | 内置声音版本 | 提供几个随包可选的声音/音频风格版本，能试听、切换、回退 | Settings harness；audio fixture tests |
| V2.4b | Voice profile | 当前单人设绑定 voice id、语言、语速、情绪参数 | import/export tests |
| V2.4c | TTS provider/speaker 管理 | provider 列表、speaker 列表、健康检查、失败降级 | Settings harness |
| V2.4d | 授权扩展声音 | 后续可导入授权音频或本地 TTS 服务，但必须有同意、删除和用途提示 | redaction/delete tests |

### 预期效果

用户可以在 Settings 里给当前 Greyfield 选择一个更合适的声音版本，试听后保存；TTS 失败不破坏文字聊天，也不会把未授权真人声音做成默认能力。

### 不做什么

不内置无授权真人声音，不把语音克隆做成默认路径，不隐藏上传行为。

## V2.5：受控电脑操作

### 背景

桌宠可以帮助用户操作电脑，但必须像“可停、可审计的小助手”，不是无人值守 agent。V2.5 放在声音和交互感知之后，避免在上下文、人设、确认 UI 都不稳定时提前做高风险操作。

### 子目标

| ID | 目标 | 要做什么 | 验收看护 |
| --- | --- | --- | --- |
| V2.5a | 操作计划 UI | 执行前显示窗口、步骤、风险、确认按钮 | UI harness |
| V2.5b | 本应用低风险动作 | 打开 Settings、切换静音、隐藏/恢复桌宠 | Electron harness |
| V2.5c | 外部窗口点击/输入 | 用户确认后对指定窗口执行小动作 | fake desktop harness |
| V2.5d | 权限、Stop、日志 | 每步记录观察/动作/结果，Stop 立即停止 | action log tests |

### 预期效果

用户能让它做明确的小任务，并随时看到它要做什么、正在做什么、做了什么。

### 不做什么

不自动发消息、付款、删文件、输入密码，不做长期无人值守任务。

## V3.0：可扩展伴侣平台

### 背景

只有当桌宠、记忆、单人设、交互/截图感知、声音和操作都稳定后，Greyfield 才适合开放内容包和工具生态。

V3 同时承接 A-Memorix 级记忆基础设施遗留：V2.1 已经打通最低 MaiBot-style 记忆闭环，但不追完整 embedding/vector DB、vector recall、node-edge long-term memory graph、graph retrieval fusion、backfill/migration 和 graph/source/profile 管理体验。

### 要做什么

- 角色包：Live2D、人设、声音、动作、气泡样式。
- 内容包：世界书、知识库、台词库。
- 工具包：权限声明、测试夹具、UI 声明。
- 记忆基础设施：embedding provider、vector store、vector recall、node-edge relationship graph、source/evidence graph、backfill/migration、graph/vector retrieval fusion。
- 本地 sandbox 和资产 license 检查。

### 预期效果

高级用户能组合自己的伴侣，而不是修改源码。

### 不做什么

不牺牲本地隐私，不开放无权限工具执行，不在 V2 未稳定前做插件市场。

## Issue 跟踪规则

1. 每个小版本开一个主 issue，每个字母阶段开一个子 issue 或独立 issue。
2. Issue body 必须包含背景、要做什么、预期效果、验收看护、不做什么。
3. Sub agent 拆工时只认 issue 范围，不从长聊天里猜需求。
4. 涉及前端可见体验的 issue 必须写明需要 `pnpm harness:frontend-full` 或截图验收。
5. 涉及记忆的 issue 必须写明 `pnpm harness:memory-benchmark` 维度和分数变化。

## 已开 Issue

| Issue | 跟踪内容 |
| --- | --- |
| [#79](https://github.com/zuiho-kai/greyfield-next/issues/79) | V2.1 长期记忆与关系连续性 roadmap |
| [#72](https://github.com/zuiho-kai/greyfield-next/issues/72) | V2.1a Memory benchmark 与低分基线 |
| [#73](https://github.com/zuiho-kai/greyfield-next/issues/73) | V2.1b 原始聊天索引与 source drilldown |
| [#74](https://github.com/zuiho-kai/greyfield-next/issues/74) | V2.1c 长期 memory atom 抽取与写入 |
| [#75](https://github.com/zuiho-kai/greyfield-next/issues/75) | V2.1d 触发召回、日期召回与原文追溯 |
| [#76](https://github.com/zuiho-kai/greyfield-next/issues/76) | V2.1e 情境记忆与低打扰主动触发 |
| [#77](https://github.com/zuiho-kai/greyfield-next/issues/77) | V2.1f Memory Library UX 与隐私控制 |
| [#78](https://github.com/zuiho-kai/greyfield-next/issues/78) | V2.1g 记忆分数门禁与 PR 回归流程 |
| [#125](https://github.com/zuiho-kai/greyfield-next/issues/125) | V2.1 minimum MaiBot parity gate |

## V2.1 issue 收口建议

不要在 closeout PR 里直接批量关闭父 issue；先用 #125 closeout PR 记录 current-head 证据和后移边界。#125 合入后建议：

| Issue | 建议 | 理由 |
| --- | --- | --- |
| #75 | 关闭 V2.1 最低切片；完整 renderer drilldown 作为后续产品化工作，semantic/vector DB 与 node-edge relationship graph 后移 V3。 | 日期召回、alias/secondary、false-positive、source fragment 和 prompt budget 已有证据；A-Memorix 级长期记忆基础设施不作为 V2.2 要求。 |
| #76 | 关闭 V2.1 最低切片，另开/后移真实外部 scene feed、天气、虚拟家状态和更完整场景触发。 | core proactive candidate、minimum production scene-signal scheduler 与 desktop bubble 已有证据；真实信号采集还没做。 |
| #77 | 关闭 V2.1 最低切片，另开/后移 broader privacy classification、完整 source management 和更广 privacy/delete 语义。 | Memory Library 已经用户可见并覆盖 summary/current-role atoms；hard-erased remembered evidence 已从产品召回/来源/导出/prompt 路径隐藏。 |
| #79 | #125 合入后关闭 roadmap。 | V2.1 最低闭环已有证据，剩余项应该拆成 V2.2+ atomic issues，避免 V2.1 无限扩张。 |
| #125 | 用 current-head evidence PR 关闭。 | close condition 是 merged closeout PR 说明是否达到最低 MaiBot-style loop，以及哪些 memory ideas 后移。 |
