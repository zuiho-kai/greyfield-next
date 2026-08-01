# Greyfield Next V1 开发者接单 Roadmap

更新时间：2026-05-30

## 目标

把 V1 剩余工作拆成开发者可以直接接单的小目标。每个目标必须能独立 PR、独立验收，且预计产品代码改动控制在 500 行以内，不包括测试、harness 和文档。

## 拆分原则

1. 按用户可见结果拆，不按文件列表拆。
2. 每个目标只服务一个主要体验，不把聊天、设置、语音、记忆混成一个 PR。
3. 每个目标都要映射到 `packages/dev-harness/v1-features.json` 里的 `GFN-V1-*`。
4. 每个目标都要有可执行验收：单测、Electron harness、截图 QA 或明确手动步骤。
5. 如果实现预计超过 500 行产品代码，必须继续拆小，不允许硬塞进一个 PR。
6. 不进入 V1 非目标：桌面控制、浏览器控制、屏幕读取、长期任务、多智能体、直播、VRM/Godot、插件市场。

## 当前基线

已经具备：

- 透明桌宠窗口、真实 Live2D、模型命中、拖动、缩放、穿透。
- Chat 文字输入、streaming 输出、Stop、provider 错误恢复。
- OpenAI-compatible provider、Settings Test LLM、active chat 期间拒绝并发 Test LLM。
- 角色 YAML、`data/memory.md`、JSONL session、重启 recent context。
- GitHub CI：Fast checks、Desktop pet quick、main checkpoint 保护已恢复。

仍未完成：

- 气泡边缘和点击穿透 QA 还需要收尾。
- Chat/Settings 还偏功能骨架，普通用户理解成本高。
- 真实语音输出还没有产品闭环。
- ASR 只能在真实 TTS 稳定后进入。

## 接单列表

| 顺序 | 目标 | Manifest | 建议 issue | 代码上限 | 当前建议 |
| --- | --- | --- | --- | --- | --- |
| 1 | 气泡边缘与点击穿透 QA 收尾 | `GFN-V1-014` | [#26](https://github.com/zuiho-kai/greyfield-next/issues/26) | <= 500 行产品代码 | 可立即接 |
| 2 | Chat 状态、Stop 与错误重试 polish | `GFN-V1-004`, `GFN-V1-006`, `GFN-V1-014` | [#27](https://github.com/zuiho-kai/greyfield-next/issues/27) | <= 500 行产品代码 | 可立即接 |
| 3 | Settings provider/Test LLM 产品化 | `GFN-V1-008` | [#28](https://github.com/zuiho-kai/greyfield-next/issues/28) | <= 500 行产品代码 | 可立即接 |
| 4 | 真实 TTS 输出最小闭环 | `GFN-V1-005` | [#29](https://github.com/zuiho-kai/greyfield-next/issues/29) | <= 500 行产品代码 | Chat/Settings 稳定后接 |
| 5 | Stop 同时停止语音、嘴型和队列 | `GFN-V1-006`, `GFN-V1-005` | [#30](https://github.com/zuiho-kai/greyfield-next/issues/30) | <= 500 行产品代码 | 依赖 TTS 最小闭环 |
| 6 | V1 完成前产品验收清单与截图证据 | 全部 V1 | [#31](https://github.com/zuiho-kai/greyfield-next/issues/31) | <= 500 行产品代码，优先 0 行 | checkpoint 前接 |

## Issue 1：气泡边缘与点击穿透 QA 收尾

目标：让宠物气泡在窗口边缘、开关切换和透明区域输入下都稳定，不破坏桌宠的点击穿透。

不做：

- 不重做 Chat。
- 不做气泡富文本。
- 不做语音。
- 不改 provider 或 runtime。

验收：

- 靠近屏幕右侧时，气泡不会出屏或遮挡不可读。
- 气泡开关关闭后，不留下会吃鼠标事件的隐藏区域。
- 气泡打开后，透明区域仍按 V1 规则穿透。
- 长回复仍只在气泡显示短提示，完整内容留在 Chat。
- 至少跑 `pnpm harness:pet:quick`，并补充窄 harness 或截图 QA 证据。

## Issue 2：Chat 状态、Stop 与错误重试 polish

目标：用户能看懂 Chat 当前在等待、生成、停止、失败还是可重试。

不做：

- 不改底层 provider 协议。
- 不做 Settings 重设计。
- 不做语音。
- 不新增长期记忆策略。

验收：

- streaming 时 Stop 始终可见、可点击。
- Stop 后 UI 不再继续追加同一条 assistant 内容。
- provider 错误后，失败输入保留在草稿或重试入口中。
- thinking / speaking / error / interrupted 状态文案清楚。
- 长回复完整保留在 Chat，气泡不承担完整历史。
- 单测覆盖 reducer/状态映射；必要时补 Electron harness。

## Issue 3：Settings provider/Test LLM 产品化

目标：普通用户能从 Settings 看懂当前 provider 为什么可用或不可用，并完成一次 Test LLM。

不做：

- 不接新 provider 类型。
- 不做插件市场。
- 不在 Settings 里写聊天历史。
- 不把 API key 写进文档、日志或仓库。

验收：

- fake provider 明确显示是 Preview。
- OpenAI-compatible 缺 Base URL / API Key / Model 时分别显示原因。
- 配置完整时，Test LLM 按钮状态和提示清楚。
- Test LLM 进行中、成功、失败、被 active chat 拒绝都有明确反馈。
- active chat 期间不会发送第二个 provider test 请求。
- 跑 `pnpm harness:electron:settings-active-chat-test`。

## Issue 4：真实 TTS 输出最小闭环

目标：AI 文字回复完成后，可以按设置朗读，失败不影响文字聊天。

不做：

- 不做语音输入。
- 不做声音克隆、音色市场或多角色声线。
- 不做复杂口型同步。
- 不让 TTS 失败污染聊天 session。

验收：

- 用户能在设置里打开/关闭朗读。
- 默认不突然出声，默认策略必须明确。
- 打开后，短回复能完成一次朗读。
- TTS 失败时，文字回复仍保留，只显示语音失败。
- 长回复有截断或分段上限，不会无限朗读。
- 包层单测先通过，再进入 Electron 验收。

## Issue 5：Stop 同时停止语音、嘴型和队列

目标：Stop 是用户的真正打断按钮，不只停止文字流，也停止正在播放或排队的语音状态。

不做：

- 不实现 ASR。
- 不改 Chat 的主要布局。
- 不做复杂任务调度。

验收：

- LLM streaming 中点击 Stop，会关闭 provider request。
- TTS 正在播放时点击 Stop，会停止音频。
- TTS 队列被清空。
- 嘴型恢复到静止状态。
- Stop 后不会继续出现上一轮语音或嘴型残留。
- 单测覆盖 interrupt 状态机；Electron harness 覆盖至少一个真实用户路径。

## Issue 6：V1 完成前产品验收清单与截图证据

目标：在宣布 V1 完成前，把用户实际看到的路径整理成可复核证据。

不做：

- 不实现新功能。
- 不替代自动测试。
- 不把未验证功能写成已完成。

验收：

- 列出 V1 完成判定的所有用户路径。
- 每条路径绑定已有测试、harness、截图或手动验收步骤。
- 明确哪些路径仍不能宣称完成。
- 更新 `docs/plans/v1-product-plan.md` 或新增 checkpoint note。
- 产品代码改动优先为 0 行。

## 推荐接单顺序

1. 先做 Issue 1，保证桌宠气泡不破坏核心桌宠感。
2. Issue 2 和 Issue 3 可以并行，一个负责 Chat，一个负责 Settings。
3. Issue 4 在文字体验稳定后开始。
4. Issue 5 必须等 Issue 4 有最小语音链路后做。
5. Issue 6 在每个阶段结束时更新，V1 checkpoint 前必须完成。
