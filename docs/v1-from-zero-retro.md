# Greyfield Next V1 从零到现在复盘

日期：2026-05-28

## 这份复盘回答什么

这不是进度表。进度看 `docs/progress.md`，产品计划看 `docs/plans/v1-product-plan.md`。

这份文档只回答三件事：

1. 从 0 到现在，我们遇到了哪些真实问题；
2. 这些问题为什么会出现；
3. 下次怎么避免，避免规则要能落到计划、代码、测试、CI 或协作流程里。

## 总结一句话

V1 能走到现在，是因为后面逐步把“想做一个桌宠”的愿望，压成了一个可验收的产品脊柱：透明 Live2D 桌宠、文字对话、Stop、最近上下文、真实 provider、错误恢复和 CI。中间最大的反复，基本都来自同一个问题：把“代码上有某个能力”误认为“用户真的能用”。

## 阶段 0：旧 Greyfield 失败复盘不够硬

### 遇到的问题

旧项目的问题不是没有想法，而是想法太多：桌宠、语音、记忆、屏幕读取、浏览器控制、桌面控制、长期任务、多 Agent、打包、语音管理都挤进一条主链路。

结果是：

- 核心 runtime 变成大杂烩；
- Electron main 变成大杂烩；
- README 和计划看起来很完整，但真实产品路径不稳定；
- 很多能力“像是有”，但没有可执行验收。

### 为什么会出现

1. 没有唯一 V1 source of truth。
2. 没有把“以后可能做”从“V1 必须做”里切出去。
3. 模块目录存在，但模块没有成为边界。
4. 文档进度比可运行能力跑得快。

### 怎么避免

- `packages/dev-harness/v1-features.json` 是 V1 功能真相源，不让 README 或会议纪要单独宣布完成。
- V1 non-goals 明确禁止桌面控制、浏览器控制、屏幕读取、长期任务、多 Agent、直播、Godot/VRM、消息平台 gateway、自生成技能。
- 每个 V1 能力必须有 test、harness 或明确手动验收路径。
- 新需求先问：它是否加强“可见、可打断、有个性、有最近上下文的 Live2D 桌宠”？如果不是，默认不进 V1。

## 阶段 1：脚手架搭起来，但产品形态还不成立

### 遇到的问题

早期 monorepo、runtime、audio、stage、persistence、desktop shell 都搭起来了，但这只能说明工程骨架存在，不能说明产品是桌宠。

最典型的问题是：Electron 能启动、canvas 有东西、renderer 有状态，但用户看到的仍可能像一个普通网页窗口。

### 为什么会出现

1. 验收目标偏工程启动，不偏用户体验。
2. “窗口存在”和“桌宠成立”被混在一起。
3. 没有把透明、无标题栏、非模型区域穿透、模型区域可交互作为第一等验收。

### 怎么避免

- 产品形态优先于工程形态：桌宠窗口必须透明、frameless、非模型区域可穿透。
- `docs/product-shape.md` 作为桌宠形态约束，不让后续改动把宠物做回普通网页。
- `pnpm harness:electron` 不能只看启动，还要看宠物窗口没有 settings/chat 控件、背景透明、preload bridge 可用。

## 阶段 2：把 Live2D 渲染误当成桌宠验收

### 遇到的问题

真实 Live2D 能加载后，曾经容易把“模型渲染出来”当成“桌宠完成”。但 Live2D 展示只是桌宠的一部分。

真实桌宠还要求：

- 模型透明像素不能吃掉桌面点击；
- 模型实体像素能被点击、拖动、右键；
- 拖动移动的是窗口，不是网页内部元素；
- 滚轮缩放只作用于模型；
- 气泡不能把桌宠变成聊天网页。

### 为什么会出现

1. 测试目标是 renderer correctness，不是 desktop-pet correctness。
2. 黑盒验收没有从“桌面对象”的角度出发。
3. 技术实现看起来像完成：Pixi/Cubism 成功、canvas 有非透明像素、动作能触发。

### 怎么避免

- Live2D 验收和桌宠验收拆开：
  - `pnpm harness:live2d` 证明真实 Live2D；
  - `pnpm harness:pet:quick` 和 `pnpm harness:electron` 证明桌宠行为。
- V1 manifest 里把 `Live2D model import`、`Model alpha hit test`、`Transparent-area pass-through`、`Model drag window`、`Bounded wheel scale` 拆成不同功能。
- 任何人声称“桌宠完成”，必须同时给出渲染证据和桌面交互证据。

## 阶段 3：Windows native shape 走错方向

### 遇到的问题

曾经把 `BrowserWindow.setShape(rects)` 当成默认输入遮罩方案。实际在 Windows 上，它不仅影响输入，也会裁剪可视区域。

结果：

- Live2D 边缘变锯齿；
- 动画时 alpha shape 和可视模型不同步；
- 拖动中窗口 bounds 可能漂移；
- 反而破坏了桌宠最重要的视觉干净度。

### 为什么会出现

1. 把 native shape 当成 input-only mask，没有验证它对可视窗口的影响。
2. 先相信了技术方案，而不是用产品形态反推实现。
3. harness 当时没有检查“视觉边缘是否被切坏”和“重复拖动是否保持窗口宽高”。

### 怎么避免

- V1 默认路径：renderer final alpha hit-test + Electron `setIgnoreMouseEvents` 动态穿透。
- native shape 只作为实验，必须 behind `GREYFIELD_ENABLE_NATIVE_SHAPE=1`。
- 不把细碎 alpha scanline rects 发给 Windows 作为默认可视 shape。
- 拖动相关改动必须证明：
  - window x/y 改变；
  - width/height 不变；
  - model scale 不变。

## 阶段 4：Playwright + ignore-mouse 导致 harness 脆

### 遇到的问题

桌宠穿透依赖 `setIgnoreMouseEvents(..., { forward: true })`，这和 Playwright 的鼠标事件天然有冲突。早期 harness 用真实输入事件时，容易出现：

- wheel 事件没有打到模型；
- drag 等待超时；
- 命中点选到 fallback 动画边缘；
- CI 上偶发 scale 没变化。

### 为什么会出现

1. 桌宠需要 OS 输入转发，测试工具也要模拟输入，两者互相干扰。
2. 测试点选取过于依赖某一帧像素，边缘像素不稳定。
3. harness 失败信息不够丰富，只看到超时，不知道是 hit-test、event target、config 写入还是 window bounds 的问题。

### 怎么避免

- fast loop 用 `pnpm harness:pet:quick`，只覆盖高频桌宠交互。
- checkpoint loop 用 `pnpm harness:electron`，覆盖设置、聊天、runtime。
- 模型命中点选择内部稳定 alpha 点，不取动画边缘。
- wheel 验收要重试，并输出最近 config、hit-test、target 元素等诊断信息。
- 不把 full Electron harness 塞进每个小 PR，避免 CI 变慢和误报。

## 阶段 5：runtime owner 一度不清楚

### 遇到的问题

早期 renderer 里还能构造真实 runtime/provider。这样会出现两个 owner：

- renderer 可以发真实 provider 请求；
- Electron main 也可以发真实 provider 请求。

这会带来 secret 暴露、状态不同步、fake/real 混淆、interrupt 不确定等风险。

### 为什么会出现

1. 为了先跑通功能，把 provider 路径留在了离 UI 最近的地方。
2. 没有及时区分 no-host preview 和 hosted Electron 的责任。
3. API key 的 renderer-safe 类型边界不够硬。

### 怎么避免

- hosted Electron 中，真实 provider 只能在 Electron main runtime 调用。
- renderer 只发 `runtime:input`，只消费 `runtime:event`。
- 浏览器/no-host preview 永远 fake-only。
- settings broadcast 给 renderer 的配置必须是 renderer-safe：只能看到 `hasApiKey`，不能拿到 raw secret，也不能把 mask 当成 secret 写回。

## 阶段 6：Stop 一开始只是 UI 状态，不是真中断

### 遇到的问题

早期 Stop 可以让 UI 进入 interrupted，但不等于真的关闭 provider stream。真实 provider 接入后，这会变成严重问题：

- 用户以为停了，服务端请求还在跑；
- 新一轮输入可能和上一轮 provider stream 并发；
- Test LLM 可能和 active chat 同时打 provider。

### 为什么会出现

1. fake runtime 下，Stop 看起来能工作，因为没有真实网络 request。
2. 没有把 abort signal 作为 provider contract。
3. 没有 single-flight 保护 active chat 和 provider test。

### 怎么避免

- `OpenAICompatibleLLMProvider.stream`、core runtime、`RuntimeService` 都必须传递 `AbortSignal`。
- Stop 验收必须证明服务端连接 close，而不是只看 UI。
- 新 text input 要先 interrupt active runtime，再启动新请求。
- active chat response 期间拒绝 Test LLM，并给用户 Stop-or-wait 提示。
- 并发 provider test 必须 single-flight。

## 阶段 7：provider failure 会污染会话或丢用户输入

### 遇到的问题

真实 provider 失败路径包括 missing key、401、403、404、timeout、malformed SSE。早期如果失败处理不严，会出现：

- UI 只显示失败，用户输入丢了；
- JSONL session 写入半截 turn；
- 错误不可读，用户不知道下一步；
- settings Test LLM 和 Chat 失败语义混在一起。

### 为什么会出现

1. fake provider 很少覆盖真实网络错误。
2. session 写入时机早于“成功 assistant final”。
3. UI 错误状态没有把“可重试草稿”作为验收。

### 怎么避免

- provider failure harness 覆盖 missing-key、401、403、404、timeout、malformed SSE。
- provider failure 不写 JSONL session。
- runtime error 必须恢复失败 user text 到 draft。
- Test LLM 失败要显示 API key / Base URL / Model 的可操作提示。
- 真实 provider harness 输出必须 redact API key。

## 阶段 8：recent context 的桌面持久化曾经只是包级能力

### 遇到的问题

core prompt assembly、session store、memory store 包级测试通过，不等于 Electron 桌面重启后真的能带上上下文。

实际还需要：

- Electron main 加载角色 YAML；
- Electron main 加载 `data/memory.md`；
- Electron main 把 user/assistant turn 写入 JSONL；
- 重启后下一次 provider prompt 带上上一轮对话。

### 为什么会出现

1. 包级能力和桌面集成验收被混在一起。
2. 文档里曾经把“prompt assembly”说得太像“桌面持久化已完成”。
3. 没有 restart harness 前，无法证明跨进程生命周期。

### 怎么避免

- `GFN-V1-007` 只代表 core prompt assembly。
- `GFN-V1-015` 单独代表 Desktop persistent recent context。
- restart-context harness 必须启动两次 Electron，用同一 temp user data 验证第二次 prompt。
- recent context 必须有 turn budget cap，防止 prompt 无界增长。

## 阶段 9：session 写入和 UI final 存在竞态

### 遇到的问题

Electron harness 一度在 renderer 看到 assistant final 后立刻读 JSONL。core runtime 当时先 emit final，再 append assistant turn。结果 UI 已经显示完成，但磁盘可能还没写完。

### 为什么会出现

1. 把 UI final 当成 disk persistence 完成信号。
2. 没有明确“成功 turn 持久化”和“通知 renderer final”的顺序。
3. harness 对异步落盘只读一次，没有 poll condition。

### 怎么避免

- 成功 user/assistant turn 要在 `assistant.text.final` 发给 renderer 前先持久化。
- harness 等待最终非 draft assistant 消息后再关应用。
- 所有异步持久化验收都要 poll condition，不靠单次 read。

## 阶段 10：Electron main bundle 的 CJS/ESM 问题

### 遇到的问题

引入 YAML persona loader 后，Electron main ESM bundle 包进了 CommonJS 依赖，启动前卡住或失败，首窗不出现。

### 为什么会出现

1. main-process bundle 的依赖形态没有被单独验证。
2. 一开始从 Playwright 等 window 的角度排查，容易误判为窗口同步问题。
3. 依赖在 Node 下能跑，不代表 Electron bundled ESM 下能跑。

### 怎么避免

- Electron 首窗超时时，先抓 main stdout/stderr，或直接启动 built main bundle。
- main ESM bundle 如果引入 CJS 依赖，要用 `createRequire(import.meta.url)` shim 或证明依赖 ESM-safe。
- 新增 main-process import 链后，不只跑 unit，要跑 Electron harness 或最小启动诊断。

## 阶段 11：fresh worktree 和 CI 环境不等于本地环境

### 遇到的问题

新 worktree 里 workspace symlink 缺失，导致 `@greyfield/persistence/config-schema` 解析失败。GitHub Actions fresh runner 又出现 Electron binary / `path.txt` 缺失问题。

### 为什么会出现

1. 本地主工作树有完整 `node_modules`，新 worktree 没有。
2. Electron 安装后置脚本状态在本地和 CI 不一致。
3. 早期 CI workflow 没有显式安装 Electron binary，也没有检查 `path.txt`。

### 怎么避免

- 新 worktree 需要先 `pnpm install` 重建 workspace links。
- CI Electron jobs 显式执行 `pnpm --dir apps/desktop exec install-electron`。
- CI 直接检查 `apps/desktop/node_modules/electron/path.txt`，不要等 harness 失败才知道 binary 缺失。
- PR 跑 Fast checks + Desktop pet quick；main/manual 再跑 Full checkpoint。

## 阶段 12：CI workflow 入仓受 GitHub token 权限影响

### 遇到的问题

本地 token 缺 `workflow` scope，直接 push `.github/workflows/ci.yml` 受限。CI 恢复被卡住了一段。

### 为什么会出现

1. GitHub 对 workflow 文件有额外权限要求。
2. 一开始把它当普通文件处理。
3. repo 保护和自动验收还没形成闭环。

### 怎么避免

- 改 `.github/workflows/*` 时，提前确认 token/app 是否有 workflow 权限。
- 如果本地 CLI 权限不足，用已授权 GitHub App connector 提交 workflow 文件。
- CI 恢复后，必须看 main branch run，不只看 PR 通过。

## 阶段 13：真实 OpenAI-compatible endpoint 的 base URL 细节

### 遇到的问题

用户提供的 endpoint 根 URL 原样测试没有收到首 token，加 `/v1` 后成功。

### 为什么会出现

1. OpenAI-compatible 服务通常要求 `/v1`，但不同反代写法不一致。
2. settings 里 Base URL 语义对普通用户不直观。
3. 如果只看“provider 请求失败”，用户不知道该改 key、base URL 还是 model。

### 怎么避免

- Test LLM 结果必须给可操作失败提示。
- product plan 里明确真实 provider 演示使用 env 注入，不把 API key 写进 docs 或 repo config。
- Settings provider readiness 要区分 Preview、缺 Base URL、缺 API key、缺 model、ready-to-test。
- 后续 settings polish 要把 Base URL 示例写成人能看懂的文案。

## 阶段 14：气泡开始跟随模型，视觉太躁

### 遇到的问题

气泡一开始倾向于跟着模型 bounds 或动画变化移动。桌宠本身已经在动，如果气泡也持续跟随，会显得太躁。

### 为什么会出现

1. 初始 acceptance 写的是“anchor to model mask region”，偏技术正确。
2. 从桌宠产品视角看，气泡更像提示层，应该稳定，不该追随每一帧模型变化。
3. 早期没把“完整回复在 Chat，短提示在气泡”这个职责拆清。

### 怎么避免

- 气泡默认使用稳定的上方窗口槽位。
- 气泡文本 normalize + cap，长回复完整内容留在 Chat。
- long-reply harness 证明首 token 进气泡、气泡文本裁剪、位置稳定、Chat 保存完整回复。
- 当前还需要完成右边缘 flip、toggle shape add/remove、透明命中不破坏的 QA 收尾。

## 阶段 15：文档计划一度太多，PM 视角不清

### 遇到的问题

计划、checkpoint、progress、meeting note 一度太多。工程视角写得细，但产品经理要看的“现在能做到什么，还差什么，谁做什么”不够清楚。

最近还出现过一次问题：新同事拆分建议写成了文件列表和命令列表，不能直接指导团队。

### 为什么会出现

1. 工程推进中自然会记录文件和测试，但 PM 关心的是用户路径、交付边界和验收口径。
2. 文档既想服务工程，又想服务组会，结果口径混杂。
3. agent 太急于落 PR，没有先让用户确认会议内容。

### 怎么避免

- PM 计划用中文，按用户可感知能力写：现在能用什么、不能宣称什么、还差什么。
- 新同事任务按“用户结果”拆，不按文件列表拆。
- 组会文档先本地落盘或 issue 讨论，用户确认后再进 PR。
- 不在用户未确认时自动 push/开 PR/合并文档。

## 阶段 16：协作节奏越界

### 遇到的问题

有一次用户只是要看组会内容，我过快地提交、推送并开了 PR。虽然没有合并 main，但节奏不对。

### 为什么会出现

1. 把“落盘记录”和“提交 PR”混成同一件事。
2. 没区分草稿、issue、PR、main 文档这四个状态。
3. 过度追求闭环，反而越过了用户确认。

### 怎么避免

- “落盘”默认只写本地文件。
- “贴上去”可以开 issue。
- “合入/提交/推 PR”必须等用户明确说。
- 文档类内容如果用户还在审，先不 push。
- final 里明确当前状态：本地未提交、已提交未推、已开 PR、已合 main，不能含糊。

## 当前仍未完成的风险

### 1. Chat/Settings 还像功能骨架

现在文字链路已经能跑，但普通用户体验还需要打磨：

- Stop、thinking、speaking、error 状态要更清楚；
- Test LLM 的状态和失败原因要更像产品；
- 模型路径、角色文件、API key 保存状态不能让用户困惑。

避免方式：让同事 A 按“文字聊天与设置体验产品化”独立推进，不让它混进 TTS 或 runtime 改造。

### 2. 气泡 V1 QA 还差最后收尾

当前基础气泡已可用，但右边缘、toggle、shape add/remove 和透明命中需要完成独立 harness。

避免方式：继续 `codex/v1-bubble-toggle-qa`，只做这个验收，不顺手改 Chat/Settings。

### 3. 真实语音还没到产品可用

audio-runtime 有句子切分、VAD 边界和假音频，但真实 TTS、播放队列、Stop 停止声音、嘴型来自实际音频还没完成。

避免方式：语音输出作为单独模块推进，文字链路是主链路，TTS 失败不能破坏文字聊天。

### 4. Electron main 仍是后续复杂度压力点

窗口、tray、settings、runtime IPC、model selection 仍集中在 main 入口附近。

避免方式：后续只在触碰对应逻辑时渐进拆 controller，不为了拆而拆；拆分必须带 focused tests。

## 以后开工前的检查清单

每个新任务先过这 10 条：

1. 这个任务对应哪个 `GFN-V1-*`？
2. 如果没有对应 manifest 项，它是 V1 吗？
3. 它改变的是用户可见结果，还是只是工程内部？
4. 它是否触碰桌宠核心交互：透明、命中、穿透、拖动、滚轮、气泡？
5. 它是否触碰 runtime/provider/secret/session？
6. 它需要 fast loop 还是 checkpoint loop？
7. 它的验收命令是什么？
8. 它是否可能把 fake 路径和 real provider 路径混起来？
9. 它是否可能把文档进度写得超过代码证据？
10. 它是否需要用户先确认，而不是直接 PR？

## 固化规则

- 产品状态写中文计划，工程细节写 progress，事故教训写 retro，不混在一起。
- V1 source of truth 是 `packages/dev-harness/v1-features.json`。
- 桌宠验收必须从用户桌面视角看，不从 canvas 是否非空看。
- 真实 provider 只在 Electron main，renderer 不拿 raw secret。
- Stop 必须是真中断，不只是 UI 状态。
- 异步持久化必须 poll 结果，不拿 UI event 当磁盘完成。
- CI 必须覆盖 fresh runner 的 Electron binary 安装。
- 新同事任务按用户结果拆，不按文件列表拆。
- 未经确认的组会文档先 issue 或本地草稿，不直接 PR。

## 相关文档

- `docs/failure-retro.md`：旧 Greyfield 为什么不能作为新工程底座。
- `docs/qa-retro.md`：桌宠交互、native shape、session race 等 QA 事故。
- `docs/architecture-retro.md`：runtime owner、secret redaction、main/process 边界。
- `docs/plans/v1-product-plan.md`：当前 PM 视角 V1 计划。
- `docs/progress.md`：逐日进度和当前状态。
