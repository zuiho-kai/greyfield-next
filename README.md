# Greyfield Next

Greyfield Next is a fresh TypeScript monorepo for rebuilding Greyfield as a Live2D desktop companion. DigitalMate2D defines the desktop-pet UX target, AIRI informs the narrow Pixi/Live2D technical route, and the old Greyfield repository is used only as a vision note and failure retro.

## V1 Goal

Make the character feel alive first:

- visible real `.model3.json` Live2D desktop pet window
- text input to streaming assistant response
- sentence-level TTS instead of waiting for the full reply
- interrupt path that stops later model chunks and speech playback
- persona, short memory, and recent session continuity
- fake providers for deterministic development and QA
- touch, motion, expression, and mouth-open checks that must involve the real Live2D stage

V1 does not include desktop control, browser control, long-running task orchestration, multi-agent behavior, livestream support, Godot/VRM, message gateways, or self-generating skills.

## Workspace

```text
apps/desktop
packages/audio-runtime
packages/core-runtime
packages/dev-harness
packages/persistence
packages/stage-live2d
```

## Architecture

Standalone diagram file: [docs/architecture-diagram.md](docs/architecture-diagram.md).

```mermaid
flowchart TB
  subgraph Desktop["apps/desktop - Electron 桌面壳"]
    Main["main process<br/>窗口 / 托盘 / 菜单 / IPC / 配置持久化"]
    Pet["pet window<br/>透明 Live2D 桌宠窗口"]
    Settings["settings window<br/>模型 / provider / 声音 / 窗口设置"]
    Chat["chat window<br/>完整对话页 / Stop / 状态"]
    Preload["typed preload IPC<br/>window.greyfield"]
  end

  subgraph Stage["packages/stage-live2d - 角色表现层"]
    Live2D["Pixi + Live2D renderer<br/>.model3.json / motions / expressions"]
    Hit["alpha hit-test<br/>模型像素命中 / 透明区穿透"]
    Reactions["interaction profile<br/>触摸 / 情绪 / 动作 / 表情映射"]
    Mouth["mouth driver<br/>setMouthOpen"]
  end

  subgraph Runtime["packages/core-runtime - 对话运行时"]
    Loop["GreyfieldRuntime<br/>prompt / stream / sentence TTS / interrupt"]
    Prompt["prompt assembly<br/>persona / memory / recent turns"]
    LLM["LLMProvider<br/>fake / OpenAI-compatible"]
  end

  subgraph Audio["packages/audio-runtime - 音频运行时"]
    Sentence["sentence splitter"]
    TTS["TTSProvider<br/>V1 next: real TTS"]
    Level["audio level -> mouth-open"]
  end

  subgraph Store["packages/persistence - 文件与状态"]
    Config["greyfield.config.json"]
    Character["characters/greyfield.yaml"]
    Memory["data/memory.md"]
    Sessions["data/sessions/*.jsonl"]
  end

  subgraph QA["packages/dev-harness - 验收"]
    Features["v1-features.json"]
    Harness["acceptance / live2d / pet quick / electron"]
  end

  Pet --> Preload
  Settings --> Preload
  Chat --> Preload
  Preload --> Main

  Main --> Config
  Main --> Runtime
  Main --> Stage

  Pet --> Live2D
  Pet --> Hit
  Hit --> Main
  Reactions --> Live2D
  Mouth --> Live2D

  Runtime --> Prompt
  Runtime --> LLM
  Runtime --> Sentence
  Runtime --> TTS
  Runtime --> Sessions
  Runtime --> Memory
  Runtime --> Character
  TTS --> Level
  Level --> Mouth

  QA --> Runtime
  QA --> Stage
  QA --> Desktop
```

## Commands

```bash
pnpm install
pnpm test
pnpm test:unit
pnpm typecheck
pnpm build:desktop
pnpm harness:acceptance
pnpm harness:live2d
pnpm harness:pet:quick
pnpm harness:electron
pnpm harness:electron:quick
pnpm dev:live2d
pnpm dev:live2d:fast
pnpm dev:live2d:stop
```

`packages/dev-harness/v1-features.json` is the V1 source of truth. New work should add or update a feature item first, then add the smallest test or acceptance script that proves it.

`pnpm harness:fallback` is only a diagnostic preview check. It does not count as V1 Live2D acceptance.

`pnpm dev:live2d` starts the visible Electron desktop pet with the local Hiyori `.model3.json` fixture. Set `GREYFIELD_LIVE2D_FIXTURE` to another `.model3.json` to test a different model without changing source files.

Use `pnpm dev:live2d:fast` for the tight visual loop when main/preload did not change, and `pnpm dev:live2d:stop` to stop the visible pet through the PID file instead of scanning Windows processes. Use `pnpm harness:pet:quick` for frequent pet-window interaction checks; keep full `pnpm harness:electron` for checkpoint validation.

CI is split into layers:

- fast checks: `pnpm typecheck`, `pnpm test`, `pnpm harness:acceptance`
- desktop pet quick: one desktop build plus `pnpm harness:pet:quick`
- checkpoint: one desktop build plus `pnpm harness:electron:quick`, run on main or manual dispatch

Before adding new V1 behavior, read [docs/failure-retro.md](docs/failure-retro.md), [docs/desktop-pet-product-commonsense.md](docs/desktop-pet-product-commonsense.md), and [docs/technical-reference-projects.md](docs/technical-reference-projects.md). The previous Greyfield failed by mixing too many systems into the first spine; Greyfield Next keeps the alive desktop companion loop separate from later control/agent modules.
