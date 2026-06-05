# Greyfield Next V1 完成前验收清单

更新时间：2026-06-05

这份清单用于回答一个问题：V1 能不能对外说“完成”。结论必须来自命令、harness、截图或明确的手动验收步骤；不能因为文档写了、代码存在、或者单个窗口能打开就宣称完成。

## 使用方式

1. 先用 `packages/dev-harness/v1-features.json` 确认功能状态。
2. 再按下面的用户路径逐条补证据。
3. 已有自动验收的路径写清命令。
4. 只能手动判断的路径必须补截图、录屏或明确操作步骤。
5. 缺证据的路径保持“不能宣称完成”。

## V1 完成判定路径

| 用户路径 | 当前判断 | 已有证据 | 仍需证据 |
| --- | --- | --- | --- |
| 打开应用后看到透明、无标题栏、置顶的 Live2D 桌宠，而不是普通网页窗口 | 基础成立 | `GFN-V1-001`; `pnpm harness:electron`; `pnpm harness:pet:quick`; `docs/progress.md` transparent pet window 行 | 最终发布前补一张真实桌面截图，确认没有网页边框、滚动条或控制面板 |
| 真实 `.model3.json` Live2D 模型加载并动画，不走 fallback | 成立 | `GFN-V1-002`; `GFN-V1-003`; `pnpm harness:live2d`; `docs/progress.md` real Live2D stage 行 | 最终发布前记录所用模型 fixture 路径和一张非 fallback 截图 |
| 透明非模型区域能点击穿透，模型像素仍可交互 | 基础成立 | `GFN-V1-010`; `GFN-V1-011`; `pnpm harness:pet:quick`; `pnpm harness:electron`; `docs/qa-retro.md` 新 QA 规则 | 气泡开关后的点击穿透仍需截图或窄 harness 复核 |
| 用户能拖动宠物窗口，拖动不改变窗口尺寸或模型缩放 | 成立 | `GFN-V1-012`; `pnpm harness:pet:quick`; `pnpm harness:electron`; `docs/qa-retro.md` native shape regression 记录 | 最终发布前补一次真实屏幕拖动截图或录屏 |
| 用户能在模型像素上滚轮缩放，范围受限，穿透或拖动时不误触 | 成立 | `GFN-V1-013`; `vitest pet-interaction`; `pnpm harness:pet:quick`; `pnpm harness:electron` | 可选补截图：缩放前后模型仍在窗口内且没有网页感 |
| 用户能输入文字，Chat 显示用户消息并逐步显示 AI 回复 | 基础成立 | `GFN-V1-004`; `pnpm harness:electron`; `pnpm harness:electron:real-llm`; `docs/progress.md` OpenAI-compatible LLM 行 | Chat 状态、Stop、错误重试 polish 仍未完成，不可宣称 Chat 体验最终完成 |
| 用户能点击 Stop 停止正在生成的回复 | 文字链路基础成立 | `GFN-V1-006`; `pnpm harness:electron:provider-abort`; `vitest runtime-loop desktop-runtime-bridge runtime-service interrupt` | `#27` 仍需确认 Stop 在 streaming 时始终明显、可点，且 UI 不继续追加同一条内容 |
| provider 错误后用户看得懂原因，并能修改后重试 | 基础成立 | `GFN-V1-004`; `pnpm harness:electron:provider-failure`; Settings Test LLM retry guidance in `docs/progress.md` | `#27` / `#28` 仍需产品化文案和截图，不能宣称普通用户无需引导即可完成 |
| 用户重启后，最近上下文进入下一轮 prompt | 成立 | `GFN-V1-007`; `GFN-V1-015`; `pnpm harness:electron:restart-context`; `docs/progress.md` persona/recent context 行 | 最终发布前可补一份手动验收记录：第一轮对话、重启、第二轮引用上下文 |
| 用户能配置 OpenAI-compatible endpoint，并用 Test LLM 看懂成功或失败 | 功能骨架成立 | `GFN-V1-008`; `pnpm harness:electron:settings-active-chat-test`; `pnpm harness:electron:provider-failure`; `docs/plans/v1-product-plan.md` P2 | `#28` 仍需 Settings provider/Test LLM 产品化，不能宣称设置页完成 |
| 短回复显示在宠物气泡，长回复完整保留在 Chat | 基础成立 | `GFN-V1-014`; `pnpm harness:electron:bubble-long-reply`; `vitest speech-bubble-placement speech-bubble-text pet-window-shape` | `#26` 仍需屏幕边缘、气泡开关、点击穿透视觉 QA |
| 真实 TTS 输出可控，失败不影响文字聊天 | 未完成 | `GFN-V1-005` 目前只有 package 层 sentence/VAD 基础 | `#29` 未完成前不能宣称真实语音输出完成 |
| Stop 同时停止 LLM、TTS 队列、正在播放音频和嘴型 | 未完成 | `GFN-V1-006` 已覆盖文字 interrupt 和 provider abort | 依赖 `#29`; `#30` 未完成前不能宣称语音 Stop 完成 |
| 语音输入通过同一 runtime text path 发起对话 | 未完成 | 只有 VAD/音频边界基础 | V1 当前不能宣称 ASR 或语音输入完成 |

## 当前不能宣称完成的路径

- 不能宣称 V1 完成：`GFN-V1-004`, `GFN-V1-005`, `GFN-V1-006`, `GFN-V1-008`, `GFN-V1-014` 仍有 in-progress 项。
- 不能宣称 Chat 体验完成：`#27` 仍要求 thinking / speaking / error / interrupted / retry 状态和 Stop 可见性 polish。
- 不能宣称 Settings 完成：`#28` 仍要求 provider readiness、Test LLM 进行中/成功/失败/被拒绝状态的产品化展示。
- 不能宣称气泡完成：`#26` 仍要求真实屏幕边缘、气泡开关、点击穿透 QA。
- 不能宣称真实语音完成：`#29` 和 `#30` 还未交付。
- 不能宣称语音输入完成：ASR 不是当前已完成路径。

## 推荐证据包

发布前至少保留以下证据，便于项目成员和非开发同事复核：

| 证据 | 目的 |
| --- | --- |
| `pnpm typecheck` 输出 | 证明 TypeScript 工程结构没有类型错误 |
| `pnpm test` 输出 | 证明单元测试通过 |
| `pnpm harness:acceptance` 输出 | 证明 fake provider 文本到语音/舞台基础链路通过 |
| `pnpm harness:live2d` 输出 | 证明真实 Live2D 非 fallback 渲染通过 |
| `pnpm harness:pet:quick` 输出 | 证明桌宠透明、命中、拖动、缩放等核心交互通过 |
| `pnpm harness:electron:provider-failure` 输出 | 证明 provider 错误不会静默失败或污染 session |
| `pnpm harness:electron:provider-abort` 输出 | 证明 Stop 会关闭 active provider request |
| `pnpm harness:electron:bubble-long-reply` 输出 | 证明长回复气泡不撑爆且 Chat 保留完整内容 |
| `pnpm harness:electron:settings-active-chat-test` 输出 | 证明 active chat 期间 Test LLM 不会并发请求 |
| 桌面截图或录屏 | 证明用户实际看到的是透明桌宠，不是网页窗口 |
| 气泡边缘/开关截图 | 证明 `#26` 的视觉和点击穿透路径 |
| Settings 成功/失败/被拒绝截图 | 证明 `#28` 的普通用户可理解状态 |
| Chat streaming/Stop/error retry 截图 | 证明 `#27` 的普通用户可理解状态 |

## 手动截图建议

- 桌宠站在真实桌面上，背景能透出，没有窗口边框或网页控件。
- 鼠标拖动前后，宠物位置改变但模型大小不乱跳。
- 屏幕右侧边缘附近，气泡不出屏、不遮挡到不可读。
- 气泡关闭后，透明区域仍不会吃鼠标事件。
- Settings 中分别展示 fake Preview、OpenAI-compatible 缺 Base URL、缺 API key、缺 Model、配置完整可测试。
- Test LLM 展示进行中、成功、失败、active chat 被拒绝。
- Chat 中展示 streaming 状态、Stop 可见、停止后不再追加、错误后保留重试入口。

## 复核顺序

1. 先跑 fast checks：`pnpm typecheck`, `pnpm test`, `pnpm harness:acceptance`。
2. 再跑桌宠核心：`pnpm harness:live2d`, `pnpm harness:pet:quick`。
3. 对 Settings / Chat / provider / 气泡改动，跑对应 Electron harness。
4. 最后补手动截图，不用截图替代自动测试。
5. 所有缺口关闭前，不把这份文档当作完成声明。
