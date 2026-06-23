# Greyfield Next V1 产品计划

更新时间：2026-06-23

## 一句话目标

V1 要交付一个真正像桌面宠物的 Live2D 伴侣：透明地站在桌面上，可拖动、可互动、可文字聊天、会记住最近上下文，并且不会越界去做桌面控制、浏览器控制、屏幕读取或长期任务代理。

## 当前能做到什么程度

| 能力 | 当前状态 | 产品判断 |
| --- | --- | --- |
| 桌面宠物窗口 | 已完成核心体验：透明、无标题栏、置顶、非模型透明区域可穿透，模型区域可交互。 | 已经像桌宠，不再是普通网页窗口。 |
| Live2D 展示 | 已能加载真实 `.model3.json`，有非 fallback 渲染、表情、动作、触摸反应。 | 可以作为 V1 的模型展示底座。 |
| 模型交互 | 支持模型像素命中、拖动窗口、滚轮缩放、穿透模式；拖动不会改变模型缩放或窗口尺寸。 | 桌宠基础交互可用。 |
| 文字输入 | Chat 窗口可以输入文本，消息经 renderer -> preload IPC -> Electron main -> runtime；runtime 报错后会把上一条用户输入恢复到草稿，方便重试。 | 主链路已打通，基础失败恢复已可用。 |
| 文字输出 | 支持流式输出、最终回复、错误提示；默认 fake provider 稳定回复，OpenAI-compatible provider 已在 main process 接入；provider 失败会显示错误、恢复草稿且不写半截 session；Stop 已证明会关闭 active provider HTTP 请求；Chat 状态、Stop、失败重试和集成验收已随 #41 合入 main。 | 文字链路可作为 V1 文本能力；真实 provider 仍需带 env 的 release 前复跑。 |
| 最近上下文 | 已接入角色 YAML、`data/memory.md`、JSONL session；重启后能把上一轮 user/assistant turn 带入下一次 prompt。 | V1 的“最近上下文连续性”已成立。 |
| 设置页 | 已有 provider/model/key、角色文件、模型路径、语音/麦克风等设置入口；Test LLM 走 main process；provider 配置会显示 Preview / blocked / ready-to-test 状态；测试中、成功、失败、active chat 被拒绝均有用户可读 UI 和 harness 证据。 | V1 provider/Test LLM 产品化已在 main；Settings 视觉和关闭/恢复稳定性属于 V1 closeout polish；模型管理 UX 可留到 V1 后。 |
| 聊天窗口 | 已从宠物窗口拆出，能显示消息、状态、错误；Waiting / Generating / Stopped / Failed / Retry-ready 状态已产品化；Stop 能打断文字流，也能在语音队列仍播放时保持可点击。 | V1 Chat polish 已在 main；后续只做缺陷修复，不再扩功能。 |
| 气泡 | 宠物旁有短回复气泡，支持文本压缩、长度上限；位置固定在宠物窗口上方稳定槽位，不跟随模型移动，只在窗口/屏幕边缘内水平和垂直夹紧；长 streaming 回复会进气泡首 token、保持短文本，完整内容留在 Chat；右侧边缘和开关/点击穿透已有专门 harness 和截图证据。 | V1 气泡 QA 已在 main；继续靠 `frontend-full` 和截图看护。 |
| 语音输出 | 已有句子级 TTS 队列、默认静音、Settings `Speak replies` 开关、renderer Web Speech 播放、TTS 失败隔离、长回复 TTS budget；Stop 会取消正在播放的语音、清空队列并重置嘴型。 | V1 真实 TTS 最小闭环已在 main；仍不是完整语音伴侣，ASR 留到 V1 后。 |
| 语音输入 | 只有 VAD/音频边界基础。 | V1 后段任务，不能先做。 |
| CI | GitHub Actions workflow 已入仓；PR 跑 Fast checks 和 Desktop pet quick harness；main / manual dispatch 额外跑 Full checkpoint harness。 | 自动保护已恢复，后续风险点是继续控制 Electron harness 的耗时和稳定性。 |

## 现在不能宣称什么

- 不能宣称“V1 已发布完成”：#41/#42/#43/#44 已合入 main，但当前仍有 Settings UI closeout 和关闭/恢复稳定性修复在进行；这些修复合入前后都需要重新跑对应证据。
- 不能宣称“真实 LLM release 证据是当前的”：当前环境没有 `GREYFIELD_REAL_LLM_*`，所以 `pnpm harness:electron:real-llm` 仍需在有凭据时复跑。
- 不能宣称“语音伴侣完整完成”：main 已覆盖真实 TTS 最小闭环和 Stop-audio，但 ASR、麦克风对话、真实音频能量嘴型仍是 V1 后工作。
- 不能宣称“模型管理 UX 完成”：Settings provider/Test LLM 已产品化，模型管理和更完整设置体验可留到 V1 后。
- 不能把桌面控制、浏览器控制、屏幕读取、长期任务、多智能体、直播、VRM/Godot 放进 V1。

## V1 剩余工作

### P0：先恢复工程保护

已完成：

1. `.github/workflows/ci.yml` 已正式入仓。
2. CI 覆盖 typecheck、unit test、acceptance、pet quick harness。
3. main / manual dispatch 会额外跑 Full Electron checkpoint harness。
4. CI Electron jobs 会显式执行 `install-electron` 并检查 `electron/path.txt`，避免 fresh runner 缺 Electron binary。

验收标准：

- 新 PR 自动跑基础检查。
- main 分支自动跑 checkpoint。
- 不再只依赖本地口头验证。

### P1：补齐当前最明显的产品缺口

已完成第一段：

1. 气泡位置会被夹在宠物窗口和屏幕可用区域内，不再只按右侧理想位置摆放。
2. runtime 报错后，Chat 会把刚失败的用户文本恢复成草稿，用户可以直接修改或重发。
3. pet quick harness 的模型命中点改为选择稳定的内部 alpha 点，避免取到 fallback 动画边缘导致误判。
4. 气泡改为窗口内稳定槽位，不跟随模型动画、缩放或位移细节，避免视觉上一直晃。
5. 新增长回复气泡 Electron harness：
   - 首个 streaming token 会进入宠物气泡；
   - 长回复不会撑爆气泡，气泡文本会压到短文本；
   - streaming 过程中气泡位置保持稳定；
   - Chat 保留完整 assistant 回复。

已在 main 补齐第二段：

1. 气泡视觉 QA：
   - 靠近屏幕右侧时翻转和 clamp 的窗口截图正常；
   - 气泡开关关闭后不保留 native shape rect；
   - 透明区域仍穿透；
2. 聊天窗口：
   - Waiting / Generating / Stopped / Failed / Retry-ready 状态清晰；
   - Stop 在文字 streaming 和语音队列播放期间都保持可用；
   - 失败后用户输入恢复到草稿，可自然重试。
3. 设置页：
   - fake provider 显示 Preview；
   - OpenAI-compatible 缺 Base URL / API key / model 时显示 blocked 原因；
   - Test LLM 的测试中、成功、失败、active chat 被拒绝状态都有用户可读 UI。

验收标准：

- 一个普通用户能打开应用、看到桌宠、发文字、看到回复、停止回复、理解错误。
- 宠物窗口仍然只像桌宠，不像控制面板。
- 这些标准目前由 main 上的集成证据和 `frontend-full` 保护；改动 Settings、Chat、Pet 或主进程生命周期后必须在改动分支重新跑对应证据。

### P2：把真实文字聊天做成可用功能

已完成第一段：

1. 用户提供的 OpenAI-compatible provider 已完成一次不落盘 smoke：
   - 根 URL 原样测试未收到首 token；
   - 带 `/v1` 的 base URL 测试成功；
   - `RuntimeService.testLLM()` 路径成功收到首 token；
   - API key 不写入 Markdown、不写入仓库配置。
2. 新增 env 驱动的真实 Electron harness：
   - `GREYFIELD_REAL_LLM_BASE_URL` / `GREYFIELD_REAL_LLM_API_KEY` / `GREYFIELD_REAL_LLM_MODEL` 注入 provider；
   - Chat 首轮真实回复可显示；
   - 成功 user/assistant turn 会写入 JSONL session；
   - 第二轮真实回复开始后，Stop 能把 UI 切到 interrupted；
   - harness 输出会 redacts API key。
3. 新增 provider failure Electron harness：
   - 缺 API key 显示可读错误，不发 provider 请求，恢复失败输入草稿，不写 JSONL session；
   - 401 unauthorized 显示可读错误，恢复失败输入草稿，不写 JSONL session；
   - 403 forbidden 显示可读错误，恢复失败输入草稿，不写 JSONL session；
   - 404 not found 显示可读错误，恢复失败输入草稿，不写 JSONL session；
   - provider timeout 显示可读错误，恢复失败输入草稿，不写 JSONL session；
   - malformed SSE 显示可读错误，恢复失败输入草稿，不写 JSONL session。
4. Settings 的 Test LLM 失败会附加“检查 API key / Base URL / Model 后重试”的操作提示。
5. 新增 provider abort Electron harness：
   - Stop 后服务端能观测到 active provider HTTP request close；
   - Stop 不在 Chat UI 显示错误。
6. 新增长回复气泡 Electron harness：
   - 真实 streaming 首 token 能显示到宠物气泡；
   - 长回复在宠物气泡内保持短文本；
   - 完整长回复仍保留在 Chat 历史。
7. 新增 settings active-chat Electron harness：
   - chat 正在 streaming 时点击 Test LLM 会显示先 Stop 或等待当前回复结束；
   - 拒绝期间不会向 provider 发送第二个测试请求。
8. restart-context Electron harness 已收紧：
   - 等待最终非 draft assistant 消息后才关闭第一轮应用；
   - 第二次启动 prompt 会带入上一轮 user 和 assistant turn；
   - 成功 turn 在 final 事件发给 UI 前先完成持久化。
9. 设置页新增 provider 状态面板：
   - fake provider 显示 Preview，避免用户误以为是真实 LLM；
   - OpenAI-compatible 缺 Base URL / API key / model 时显示 blocked 原因；
   - 配置齐全时提示可以运行 Test LLM。

验收标准：

- 用真实 OpenAI-compatible endpoint 聊天可以作为 V1 文本能力演示。
- 失败时用户知道原因和下一步，不需要看日志。

### P3：真实语音最小闭环

main 已完成 V1 最小闭环：

1. 句子级 TTS 队列会在完整句子形成时发出 audio chunk。
2. Desktop voice 默认关闭，避免应用突然发声。
3. Settings `Speak replies` 可启用真实 Web Speech 播放。
4. TTS 或播放失败只显示 voice-only error，不破坏文字回复和 session turn。
5. 长回复有 TTS 字符预算，避免播放无限延长。
6. Stop 能停止 provider stream、TTS 队列、正在播放的语音和嘴型。

不放进 V1 的内容：

- 真实音频能量驱动嘴型；
- 外部 TTS provider 选择；
- ASR / 麦克风语音输入。

验收标准：

- 文字回复开始后，第一句能较快发声。
- 打断在 500ms 内停止声音和嘴型。

### P4：最后做 ASR

只有真实 TTS 和 interrupt 稳定后才做。

1. 麦克风设备选择。
2. VAD 触发录音边界。
3. ASR provider。
4. 语音输入走同一条 runtime text path。

验收标准：

- 用户能用语音发起一轮普通对话。
- 语音路径不绕开文字路径的上下文、interrupt、错误处理和 session 持久化。

## 推荐下一步

当前推荐进入 V1 closeout：

1. 只修影响 V1 体验可信度的问题：Settings UI 可读性、窗口关闭/恢复稳定性、文档证据口径。
2. 不再新增 V1 后功能，例如 ASR、桌面控制、浏览器控制、长期任务代理或完整模型管理。
3. 提供 `GREYFIELD_REAL_LLM_BASE_URL` / `GREYFIELD_REAL_LLM_API_KEY` / `GREYFIELD_REAL_LLM_MODEL` 后，在最终目标分支复跑 `pnpm harness:electron:real-llm`。
4. 每个 closeout PR 合入前，按 [V1 Completion Evidence Checklist](../v1-completion-evidence.md) 跑它触及路径的 harness；前端可见改动必须跑 `pnpm harness:frontend-full` 或等同 CI 证据。

## V1 完成判定

V1 完成不是“代码里有功能”，而是下面这些路径都能被验证：

具体证据清单见 [V1 Completion Evidence Checklist](../v1-completion-evidence.md)。该清单只记录已有命令、harness、截图或明确手动验收步骤，不能替代最终 release 分支重跑。

1. 用户打开应用，看到透明 Live2D 桌宠，不是网页窗口。
2. 用户能拖动宠物、缩放模型、切换穿透，不破坏桌面交互。
3. 用户能输入文字并收到流式回复。
4. 用户能停止当前回复。
5. 用户重启后，最近上下文仍能进入下一轮对话。
6. 用户能配置真实 OpenAI-compatible endpoint，并能看懂成功或失败。
7. 短回复能出现在宠物气泡里，完整历史在 Chat 窗口里。
8. 所有 V1 路径有测试、harness 或明确手动验收步骤。
