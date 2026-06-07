# Greyfield Next V1 验收证据台账

更新时间：2026-06-07

这份文档服务于 GitHub issue `#31`。它不是 V1 完成声明，而是完成前的证据台账：把每条用户可见路径、已有自动验收、仍缺的截图或命令输出登记清楚，避免把“文档写过”误当成“产品验过”。

## 本 PR 的交付范围

本 PR 只做证据盘点和验收台账整理，不新增产品功能，不替代自动测试，也不把未验证路径写成已完成。

| 项目 | 本 PR 状态 |
| --- | --- |
| 新增 V1 验收证据台账 | 已完成 |
| 链接到 `docs/plans/v1-product-plan.md` | 已完成 |
| 重新运行全部 harness | 未执行 |
| 补真实桌面截图或录屏 | 未执行 |
| 宣称 V1 完成 | 不宣称 |

## 证据等级说明

| 等级 | 含义 | 是否足以宣称完成 |
| --- | --- | --- |
| 当前实测 | 本轮 PR 或本轮验收实际运行了命令、harness、截图或录屏 | 可以作为本轮证据 |
| 历史自动验收 | `v1-features.json`、`docs/progress.md` 或既有 harness 记录已经列出证据 | 可以作为已有证据线索，发布前建议重跑 |
| 手动待补 | 需要截图、录屏或人工操作复核 | 不能单独宣称完成 |
| 未完成 | manifest 或 issue 仍标记 in-progress / open | 不能宣称完成 |

## 用户路径证据台账

| 用户可见路径 | 当前判断 | 证据等级 | 已有证据来源 | 本轮复核 | 下一步 |
| --- | --- | --- | --- | --- | --- |
| 打开应用后看到透明、无标题栏、置顶的 Live2D 桌宠，不是普通网页窗口 | 有历史自动验收，发布前仍需截图 | 历史自动验收 + 手动待补 | `GFN-V1-001`; `pnpm harness:electron`; `pnpm harness:pet:quick`; `docs/progress.md` transparent pet window | 未重跑 | 补真实桌面截图，确认没有网页边框、滚动条或设置面板 |
| 真实 `.model3.json` Live2D 模型加载并动画，不走 fallback | 有历史自动验收 | 历史自动验收 | `GFN-V1-002`; `GFN-V1-003`; `pnpm harness:live2d`; `docs/progress.md` real Live2D stage | 未重跑 | 发布前重跑 `pnpm harness:live2d` 并记录 fixture |
| 透明非模型区域能点击穿透，模型像素仍可交互 | 有历史自动验收，气泡开关路径未收尾 | 历史自动验收 + 手动待补 | `GFN-V1-010`; `GFN-V1-011`; `pnpm harness:pet:quick`; `pnpm harness:electron`; `docs/qa-retro.md` | 未重跑 | `#26` 补气泡开关后点击穿透截图或窄 harness |
| 用户能拖动宠物窗口，拖动不改变窗口尺寸或模型缩放 | 有历史自动验收 | 历史自动验收 + 手动待补 | `GFN-V1-012`; `pnpm harness:pet:quick`; `pnpm harness:electron`; `docs/qa-retro.md` native shape regression | 未重跑 | 发布前补一次真实屏幕拖动截图或录屏 |
| 用户能在模型像素上滚轮缩放，范围受限，穿透或拖动时不误触 | 有历史自动验收 | 历史自动验收 | `GFN-V1-013`; `vitest pet-interaction`; `pnpm harness:pet:quick`; `pnpm harness:electron` | 未重跑 | 发布前重跑 pet quick；可补缩放前后截图 |
| 用户能输入文字，Chat 显示用户消息并逐步显示 AI 回复 | 主链路有历史验收，体验 polish 未完成 | 历史自动验收 + 未完成 | `GFN-V1-004`; `pnpm harness:electron`; `pnpm harness:electron:real-llm`; `docs/progress.md` OpenAI-compatible LLM | 未重跑 | `#27` 补 Chat 状态、Stop、错误重试 polish |
| 用户能点击 Stop 停止正在生成的回复 | 文字 provider abort 有历史验收，UI polish 未完成 | 历史自动验收 + 未完成 | `GFN-V1-006`; `pnpm harness:electron:provider-abort`; `vitest runtime-loop desktop-runtime-bridge runtime-service interrupt` | 未重跑 | `#27` 确认 streaming 时 Stop 始终明显、可点击、停止后不继续追加 |
| provider 错误后用户看得懂原因，并能修改后重试 | 错误恢复有历史验收，普通用户文案仍需打磨 | 历史自动验收 + 未完成 | `GFN-V1-004`; `pnpm harness:electron:provider-failure`; Settings Test LLM retry guidance in `docs/progress.md` | 未重跑 | `#27` / `#28` 补产品化文案和截图 |
| 用户重启后，最近上下文进入下一轮 prompt | 有历史自动验收 | 历史自动验收 | `GFN-V1-007`; `GFN-V1-015`; `pnpm harness:electron:restart-context`; `docs/progress.md` persona/recent context | 未重跑 | 发布前可补手动验收记录：第一轮对话、重启、第二轮引用上下文 |
| 用户能配置 OpenAI-compatible endpoint，并用 Test LLM 看懂成功或失败 | 功能骨架有历史验收，Settings 产品化未完成 | 历史自动验收 + 未完成 | `GFN-V1-008`; `pnpm harness:electron:settings-active-chat-test`; `pnpm harness:electron:provider-failure`; `docs/plans/v1-product-plan.md` P2 | 未重跑 | `#28` 补 Preview / blocked / ready / testing / success / failure / rejected 截图 |
| 短回复显示在宠物气泡，长回复完整保留在 Chat | 长回复路径有历史验收，边缘和开关 QA 未完成 | 历史自动验收 + 未完成 | `GFN-V1-014`; `pnpm harness:electron:bubble-long-reply`; `vitest speech-bubble-placement speech-bubble-text pet-window-shape` | 未重跑 | `#26` 补屏幕边缘、气泡开关、点击穿透 QA |
| 真实 TTS 输出可控，失败不影响文字聊天 | 未完成 | 未完成 | `GFN-V1-005` 目前只有 package 层 sentence/VAD 基础 | 未重跑 | `#29` 完成真实 TTS 输出最小闭环 |
| Stop 同时停止 LLM、TTS 队列、正在播放音频和嘴型 | 未完成 | 未完成 | `GFN-V1-006` 已覆盖文字 interrupt 和 provider abort | 未重跑 | 依赖 `#29`; `#30` 完成后再验收 |
| 语音输入通过同一 runtime text path 发起对话 | 未完成 | 未完成 | 只有 VAD/音频边界基础 | 未重跑 | V1 当前不能宣称 ASR 或语音输入完成 |

## 当前不能宣称完成

- 不能宣称 V1 完成：`GFN-V1-004`, `GFN-V1-005`, `GFN-V1-006`, `GFN-V1-008`, `GFN-V1-014` 仍有 in-progress 项。
- 不能宣称 Chat 体验完成：`#27` 仍要求 thinking / speaking / error / interrupted / retry 状态和 Stop 可见性 polish。
- 不能宣称 Settings 完成：`#28` 仍要求 provider readiness、Test LLM 进行中/成功/失败/被拒绝状态的产品化展示。
- 不能宣称气泡完成：`#26` 仍要求真实屏幕边缘、气泡开关、点击穿透 QA。
- 不能宣称真实语音完成：`#29` 和 `#30` 还未交付。
- 不能宣称语音输入完成：ASR 不是当前已完成路径。

## 发布前建议证据包

| 证据 | 证明什么 | 本 PR 是否提供 |
| --- | --- | --- |
| `pnpm typecheck` 输出 | TypeScript 工程结构没有类型错误 | 未提供 |
| `pnpm test` 输出 | 单元测试通过 | 未提供 |
| `pnpm harness:acceptance` 输出 | fake provider 文本到语音/舞台基础链路通过 | 未提供 |
| `pnpm harness:live2d` 输出 | 真实 Live2D 非 fallback 渲染通过 | 未提供 |
| `pnpm harness:pet:quick` 输出 | 桌宠透明、命中、拖动、缩放等核心交互通过 | 未提供 |
| `pnpm harness:electron:provider-failure` 输出 | provider 错误不会静默失败或污染 session | 未提供 |
| `pnpm harness:electron:provider-abort` 输出 | Stop 会关闭 active provider request | 未提供 |
| `pnpm harness:electron:bubble-long-reply` 输出 | 长回复气泡不撑爆且 Chat 保留完整内容 | 未提供 |
| `pnpm harness:electron:settings-active-chat-test` 输出 | active chat 期间 Test LLM 不会并发请求 | 未提供 |
| 桌面截图或录屏 | 用户实际看到的是透明桌宠，不是网页窗口 | 未提供 |
| 气泡边缘/开关截图 | `#26` 的视觉和点击穿透路径 | 未提供 |
| Settings 成功/失败/被拒绝截图 | `#28` 的普通用户可理解状态 | 未提供 |
| Chat streaming/Stop/error retry 截图 | `#27` 的普通用户可理解状态 | 未提供 |

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

## 给非开发同事的读法

这份台账相当于项目验收里的“证据登记表”。绿色灯不是靠一句“做了”点亮的，而是靠命令输出、截图、录屏或明确的人工复核。当前 PR 的价值是把证据位置和缺口摆出来；真正宣布 V1 完成，还需要后续 PR 或验收记录把“未提供”的证据补齐。
