# Greyfield Next V1 进展组会纪要

日期：2026-05-25

目的：对齐 Greyfield Next V1 当前进度、未完成事项、风险和下一步执行顺序。

## 参会角色

- 产品 / 桌宠体验 owner：V1 产品形态、交互预期、可见质量。
- Live2D stage owner：Pixi/Live2D 加载、触摸、表情、动作、口型、alpha 命中。
- Desktop shell owner：Electron 窗口、托盘、菜单、preload IPC、设置页和聊天页。
- Runtime owner：LLM 流式输出、打断、人格、记忆、会话上下文。
- Audio owner：句子级 TTS、播放队列、VAD、ASR、音频驱动口型。
- QA / harness owner：feature manifest、fast harness、checkpoint harness、黑盒回归。

## 北极星

V1 不是 agent 平台。V1 是一个“活着的 Live2D 桌面桌宠”：

- 真实透明桌面 Live2D 角色
- 可以文字聊天
- 可以听、可以说
- 可以被打断
- 有人格和最近上下文连续性
- 行为像桌面对象，而不是网页

V1 继续禁止：桌面控制、浏览器控制、读屏、长期任务系统、多 agent、直播、Godot/VRM、消息平台 gateway、技能自生成。

## 当前基线

| 模块 | 状态 | 证据 | 备注 |
| --- | --- | --- | --- |
| TS monorepo scaffold | 已完成 | 最近 checkpoint 中 `pnpm typecheck` 通过 | 继续避免生成物进入源码审查。 |
| 真实 Live2D stage | V1 迭代可用 | `pnpm harness:live2d` 使用样例模型验证非 fallback 渲染和帧变化 | 还需要更多常见模型 fixture 和用户模型导入打磨。 |
| 透明 pet window | V1 迭代稳定 | `pnpm harness:pet:quick`、`pnpm harness:electron` | native `setShape` 默认关闭。 |
| Alpha 命中 / 鼠标穿透 | 已完成 | 最终 alpha 采样 + 动态 `setIgnoreMouseEvents` | 未来如果要完美透明洞，可能需要双窗口输入层。 |
| 拖动 | 已完成并修过回归 | quick/full harness 确认只改 x/y，不改宽高和 scale | 这是受保护高危回归区域。 |
| 滚轮缩放 | 机制完成 | 有界、节流、拖动/pass-through 时禁用 | 还需要视觉调参，让头部/上半身缩放更自然。 |
| 对话气泡 | 进行中 | placement reducer 已有，pet bubble 路径已存在 | 需要边缘视觉 QA、换行、交互处理。 |
| 设置页 / 聊天页 | 进行中 | 独立窗口已存在，full Electron harness 验证隔离 | 需要 AIRI 风格视觉打磨和更好的模型/provider UX。 |
| Fake runtime 链路 | 已完成 | `pnpm harness:acceptance` | 继续作为确定性 QA 默认路径。 |
| Main-process runtime | 进行中，已明显推进 | runtime IPC、AbortSignal、renderer real-provider 路径移除 | 还需要持久化 store、provider 错误 UX、真实 provider 测试按钮。 |
| 开发速度策略 | 已完成 | `docs/development-speed-policy.md` | 活跃开发用 fast loop，里程碑/高风险面才跑 checkpoint loop。 |

## 最近完成

- 真实 provider 执行权向 Electron main 收口。Hosted renderer 现在发送 `runtime:input`，消费 main 广播的 `runtime:event`。
- Electron 模式下 renderer 不再构造真实 LLM provider。
- 新增 renderer-safe settings 广播。renderer 只保存 API key 是否存在，不保存原始 secret 或 mask。
- `RuntimeService` 在接受新 text 输入前会先 interrupt 当前 active runtime，避免多个 provider stream 并发失控。
- 因开发循环变慢，新增开发速度策略。
- 架构拆分已开始：
  - `RuntimeIpcController` 已抽出并有测试。
  - `PetWindowController` 已抽出并有测试。
  - `Live2DModelController` 已抽出并有测试。

重要状态：controller 抽离已有 targeted tests，但 `Live2DModelController` 接入 `index.ts` 后被打断，还没有做 fresh typecheck/full harness checkpoint。当前应视为“已实现但未 checkpoint”，不要算作完全完成。

## V1 未完成事项

### 产品 / 桌宠 UX

对话气泡：

- streaming 文本需要合理换行
- 长文本不能尴尬遮住模型
- 靠近屏幕边缘时需要翻转和 clamp
- 气泡命中区域不能破坏穿透

聊天页：

- 完整对话历史界面
- Stop 始终可见
- 状态和错误显示
- 更接近 AIRI 风格的布局

设置页：

- AIRI 风格侧边导航和视觉打磨
- 模型管理 UX
- provider 测试按钮
- 声音 / 麦克风配置 UX

### Live2D / 模型管理

- 模型导入 UI 需要变成日常可用流程。
- 动作/表情预览已有基础方向，但用户界面还需要打磨。
- 需要更多常见模型 fixture，不能只依赖一个样例路径。
- 滚轮缩放需要围绕鼠标位置继续做视觉调参，让头部/上半身 zoom 不裁掉重要区域。

### Runtime / LLM

- OpenAI-compatible provider 已存在，但 V1 可用链路还没完成。
- 剩余：
  - provider timeout
  - 可读 provider error events
  - settings 里的 “test LLM” 动作
  - 真实网络手动 QA 路径
  - Electron main runtime 的持久化 session/memory
- fake provider 必须继续保留为 harness 和 CI 默认路径。

### Audio

- 句子切分和 fake TTS queue 已存在。
- 真实 TTS 还没有接入 desktop path。
- 播放队列还不是完整真实音频播放系统。
- 桌面路径里的 mouth-open 还需要由真实播放/音频电平驱动。
- ASR/VAD/麦克风流程还不是 V1 完成状态。

### Persistence / Persona / Context

- Prompt assembly 已支持人格、memory、handoff、recent turns。
- Electron main runtime 还需要接：
  - character YAML loading
  - memory markdown store
  - JSONL session store
  - 重启恢复 / handoff summary

### 架构

- `apps/desktop/src/main/index.ts` 比之前小，但仍然是偏重的入口文件。
- controller 拆分正在进行，但还没完全收尾。
- 后续可拆目标：
  - tray/menu controller
  - window lifecycle controller
  - settings IPC controller
  - 如果继续变大，再拆 chat/settings window opening controller
- 不要为了架构洁癖牺牲可见 V1 进度。只拆能降低当前风险或解锁功能交付的部分。

## 当前风险

| 风险 | 严重度 | 缓解方式 |
| --- | --- | --- |
| 拖动 / 缩放 / 穿透回归 | 高 | pet 交互变更跑 `pnpm harness:pet:quick`；checkpoint 前跑 full Electron。 |
| full harness 拖慢开发 | 高 | 遵守 `docs/development-speed-policy.md`，活跃开发只跑 targeted tests。 |
| main process 变成新的 god object | 中高 | 继续小步 controller 抽离，但批量验证。 |
| LLM 看似接好了但日常不可用 | 中高 | 增加 provider test action、timeout、可读错误、真实网络手动 QA。 |
| 气泡像网页 overlay | 中 | pet window 只保留模型和气泡；气泡锚定模型 bounds 并做屏幕避让。 |
| 真实音频过早扩 scope | 中 | main LLM 和 persistence 稳定后，再进入真实 TTS/ASR。 |

## 立即下一步

### Step 1：稳定当前未 checkpoint 的 controller 拆分

目标：不要开新 scope，先把被打断的架构抽离 checkpoint 掉。

命令：

```bash
pnpm vitest run apps/desktop/src/main/__tests__/runtime-ipc-controller.test.ts apps/desktop/src/main/__tests__/pet-window-controller.test.ts apps/desktop/src/main/__tests__/live2d-model-controller.test.ts
pnpm typecheck
```

如果 typecheck 通过，并且没有意外 Electron-facing 行为变化，再跑：

```bash
pnpm harness:pet:quick
```

只有在 integration 干净，或需要交给用户验证前，才跑完整：

```bash
pnpm harness:electron
```

### Step 2：完成气泡和聊天 UX

下一步优先做这个，因为它是可见、用户能直接感知的 V1 体验。

- 气泡文本截断/换行
- 边缘位置视觉 QA
- 气泡开关测试覆盖
- 聊天页状态/错误展示
- 聊天页 Stop 按钮可靠性

### Step 3：让真实 LLM provider 可用

- Provider timeout
- Provider error events
- Settings 里的 “test LLM” 按钮
- Main runtime 拥有所有真实 provider 执行
- Fake provider 保持默认 harness route

### Step 4：接持久化人格和最近上下文

- 加载 `characters/greyfield.yaml`
- 加载 `data/memory.md`
- Electron main runtime 使用 JSONL session store
- 增加 restart test 验证最近上下文 / handoff

### Step 5：真实 TTS，然后 ASR

- 在现有 abstraction 后接真实 TTS provider
- 保留句子级播放队列行为
- 由真实播放/音频电平驱动 mouth-open
- interrupt 停止 generation、queue、playback、mouth-open
- TTS 稳定后再做 ASR/VAD

## 验证策略

不要每个小改动都跑完整 checkpoint。

Fast loop：

```bash
pnpm vitest run <specific-test-file>
pnpm typecheck
pnpm harness:pet:quick
```

Checkpoint loop：

```bash
pnpm typecheck
pnpm test
pnpm harness:acceptance
pnpm harness:live2d
pnpm harness:electron
```

只有在声明里程碑、触碰高风险 Electron IPC、或准备交给用户看时，才跑 checkpoint loop。

## 决策记录

- fake provider 继续作为默认 QA 路径。
- native `BrowserWindow.setShape` 默认关闭。
- 继续 TS monorepo 路线。
- DigitalMate2D / ZcChat2 继续作为桌宠本体交互参考。
- AIRI 继续作为 stage/runtime 分层和 settings/chat 风格参考。
- 旧 Greyfield 不作为实现或 UX 参考，只作为愿景和失败复盘。

## 开放问题

- V1 第一个真实 TTS backend 选哪个？
- 下一个可见 milestone 优先 chat/settings polish，还是真实 LLM provider 测试？
- V1 继续保持单 pet window + 动态穿透，还是规划未来双窗口输入层？
- 用哪个默认用户模型 fixture 替换当前样例路径，以便做更真实的视觉 QA？
