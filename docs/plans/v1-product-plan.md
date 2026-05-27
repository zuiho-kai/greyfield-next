# Greyfield Next V1 产品计划

更新时间：2026-05-27

## 一句话目标

V1 要交付一个真正像桌面宠物的 Live2D 伴侣：透明地站在桌面上，可拖动、可互动、可文字聊天、会记住最近上下文，并且不会越界去做桌面控制、浏览器控制、屏幕读取或长期任务代理。

## 当前能做到什么程度

| 能力 | 当前状态 | 产品判断 |
| --- | --- | --- |
| 桌面宠物窗口 | 已完成核心体验：透明、无标题栏、置顶、非模型透明区域可穿透，模型区域可交互。 | 已经像桌宠，不再是普通网页窗口。 |
| Live2D 展示 | 已能加载真实 `.model3.json`，有非 fallback 渲染、表情、动作、触摸反应。 | 可以作为 V1 的模型展示底座。 |
| 模型交互 | 支持模型像素命中、拖动窗口、滚轮缩放、穿透模式；拖动不会改变模型缩放或窗口尺寸。 | 桌宠基础交互可用。 |
| 文字输入 | Chat 窗口可以输入文本，消息经 renderer -> preload IPC -> Electron main -> runtime；runtime 报错后会把上一条用户输入恢复到草稿，方便重试。 | 主链路已打通，基础失败恢复已可用。 |
| 文字输出 | 支持流式输出、最终回复、错误提示；默认 fake provider 稳定回复，OpenAI-compatible provider 已在 main process 接入；已用用户提供的 OpenAI-compatible endpoint 跑通过真实 Electron 聊天 harness；provider 失败会显示错误、恢复草稿且不写半截 session；Stop 已证明会关闭 active provider HTTP 请求。 | 真实文字链路已可演示；还需要补设置页视觉 polish。 |
| 最近上下文 | 已接入角色 YAML、`data/memory.md`、JSONL session；重启后能把上一轮 user/assistant turn 带入下一次 prompt。 | V1 的“最近上下文连续性”已成立。 |
| 设置页 | 已有 provider/model/key、角色文件、模型路径、语音/麦克风等设置入口；Test LLM 走 main process；聊天回复中 Test LLM 会显示先 Stop 或等待的可操作提示。 | 功能骨架可用，但整体视觉和模型管理手感还不够。 |
| 聊天窗口 | 已从宠物窗口拆出，能显示消息、状态、错误，Stop 按钮能打断当前回复。 | 可用，但还需要视觉和交互 polish。 |
| 气泡 | 宠物旁有短回复气泡，支持文本压缩、长度上限；位置固定在宠物窗口上方稳定槽位，不跟随模型移动，只在窗口/屏幕边缘内水平和垂直夹紧；长 streaming 回复会进气泡首 token、保持短文本，完整内容留在 Chat。 | 基础可用，躁动感已降低；还需要屏幕边缘截图和开关/点击穿透视觉复核。 |
| 语音输出 | runtime 有句子级 TTS 队列和假 TTS，嘴型可被假音频驱动。 | 还不是产品可用的真实语音。 |
| 语音输入 | 只有 VAD/音频边界基础。 | V1 后段任务，不能先做。 |
| CI | 本地验证链路可跑；GitHub workflow 文件因 token 缺 `workflow` scope 还没入仓。 | 需要优先补，不然后续 PR 缺自动保护。 |

## 现在不能宣称什么

- 不能宣称“真实 LLM 已完成”：OpenAI-compatible provider 已接入，真实 Electron 聊天 harness 已通过一次，missing-key/401/403/404/timeout/malformed-stream 已有 Electron 失败验收，Stop 已证明会关闭 active provider HTTP 请求，长回复气泡已有 Electron 验收；但还缺更完整的设置页视觉 polish。
- 不能宣称“语音伴侣已完成”：真实 TTS、播放队列、interrupt 停止播放、ASR 都还没达到产品验收。
- 不能宣称“设置页完成”：现在是功能骨架，模型管理、provider 状态、错误恢复和视觉体验还需要打磨。
- 不能宣称“气泡完成”：短文本路径、长 streaming 回复、基础边缘 clamp 有了，但还缺不同模型位置、不同屏幕位置下的截图复核和点击穿透复核。
- 不能把桌面控制、浏览器控制、屏幕读取、长期任务、多智能体、直播、VRM/Godot 放进 V1。

## V1 剩余工作

### P0：先恢复工程保护

1. 解决 GitHub token `workflow` scope。
2. 把 `.github/workflows/ci.yml` 正式入仓。
3. CI 至少覆盖 typecheck、unit test、acceptance、pet quick harness。

验收标准：

- 新 PR 自动跑基础检查。
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

还需要继续补：

1. 完成气泡视觉 QA：
   - 靠近屏幕边缘时翻转和 clamp 的真实窗口截图正常；
   - 气泡开关不破坏点击穿透；
2. 打磨聊天窗口：
   - Stop 始终可见；
   - thinking / speaking / error 状态清晰；
   - 错误后用户能自然重试。
3. 打磨设置页：
   - provider 配置状态清晰；
   - Test LLM 的成功、失败、进行中、被拒绝状态都能看懂；
   - 模型选择和路径显示不让用户困惑。

验收标准：

- 一个普通用户能打开应用、看到桌宠、发文字、看到回复、停止回复、理解错误。
- 宠物窗口仍然只像桌宠，不像控制面板。

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

验收标准：

- 用真实 OpenAI-compatible endpoint 聊天可以作为 V1 文本能力演示。
- 失败时用户知道原因和下一步，不需要看日志。

### P3：再进入真实语音

只有 P2 稳定后才做。

1. 接入真实 TTS provider。
2. 播放第一句时不等整段回复完成。
3. Stop 能停止 provider stream、TTS 队列、正在播放的音频和嘴型。
4. 嘴型来自实际播放或音频能量，不是假字节。

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

如果现在有 GitHub token 权限，先做 P0 CI。

如果没有权限，继续做 P2 provider retry UX：用错误 key、错误 base URL、慢响应/超时和 malformed stream 把失败路径做成用户能看懂、能重试的状态。

P1 的气泡视觉 QA 和设置页 polish 继续保留，但不阻塞真实文字链路验证。

不要现在开始 TTS/ASR；先把真实文字聊天和错误恢复做稳。

## V1 完成判定

V1 完成不是“代码里有功能”，而是下面这些路径都能被验证：

1. 用户打开应用，看到透明 Live2D 桌宠，不是网页窗口。
2. 用户能拖动宠物、缩放模型、切换穿透，不破坏桌面交互。
3. 用户能输入文字并收到流式回复。
4. 用户能停止当前回复。
5. 用户重启后，最近上下文仍能进入下一轮对话。
6. 用户能配置真实 OpenAI-compatible endpoint，并能看懂成功或失败。
7. 短回复能出现在宠物气泡里，完整历史在 Chat 窗口里。
8. 所有 V1 路径有测试、harness 或明确手动验收步骤。
