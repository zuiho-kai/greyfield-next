# Greyfield Next V1 架构图

这张图描述的是当前 V1 收敛后的目标架构：真实 provider 调用收口到 Electron main，renderer 只做 UI 和 stage 表现，Live2D、runtime、audio、persistence、harness 各自守住边界。

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
    Protocol["event protocol<br/>text.input / audio.chunk / audio.end / interrupt"]
    Loop["GreyfieldRuntime<br/>ASR / prompt / stream / sentence TTS / interrupt"]
    Prompt["prompt assembly<br/>persona / memory / recent turns"]
    LLM["LLMProvider<br/>fake / OpenAI-compatible"]
    ASR["ASRProvider<br/>fake / OpenAI-compatible"]
  end

  subgraph Audio["packages/audio-runtime - 音频运行时"]
    Sentence["sentence splitter"]
    Mic["browser microphone recorder<br/>MediaRecorder / harness probe"]
    TTS["TTSProvider<br/>fake / OpenAI-compatible"]
    VAD["VAD boundary"]
    Level["decoded PCM level -> mouth-open"]
  end

  subgraph Store["packages/persistence - 文件与状态"]
    Config["greyfield.config.json"]
    Character["characters/greyfield.yaml"]
    Memory["data/memory.md"]
    Sessions["data/sessions/*.jsonl"]
  end

  subgraph QA["packages/dev-harness - 验收"]
    Features["v1-features.json"]
    Fake["fake providers"]
    Harness["acceptance / live2d / pet quick / electron"]
  end

  Pet --> Preload
  Settings --> Preload
  Chat --> Preload
  Preload --> Main

  Main --> Config
  Main --> Store
  Main --> Runtime
  Main --> Stage

  Pet --> Live2D
  Pet --> Hit
  Hit --> Main
  Reactions --> Live2D
  Mouth --> Live2D

  Runtime --> Protocol
  Runtime --> Prompt
  Runtime --> LLM
  Runtime --> ASR
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

## 边界规则

- renderer 不跑真实 provider。pet/settings/chat 只发 IPC 和渲染 UI。
- Electron main 拥有真实调用权。LLM/API key/session/memory 都应该在 main 或 package 边界后面。
- Live2D stage 只管角色表现：模型加载、动作、表情、alpha 命中、口型。
- runtime 只管对话闭环：prompt、流式 LLM、句子级 TTS、interrupt、上下文。
- fake provider 是验收路径，不是最终体验。
