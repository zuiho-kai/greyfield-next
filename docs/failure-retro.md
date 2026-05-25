# Greyfield Failure Retro

This document records why the previous Greyfield/GreyWind prototype failed as an engineering base for Greyfield Next. The old repository remains useful for vision, motivation, failure analysis, and scope warnings. It is not the foundation for new code, technical routing, or UX design.

## What Failed

The previous project tried to become too many systems at once: Live2D desktop pet, realtime voice assistant, memory runtime, screen reader, browser operator, desktop operator, packaged Windows app, voice manager, and future multi-agent platform. It did have module directories, but the boundaries were not strong enough to shape the real behavior. The result was not one clear V1 loop; it was a pile of half-coupled loops.

Two files show the failure shape clearly:

- `voice_pipeline.py` became a runtime god object. It handled ASR, TTS, LLM streaming, prompt assembly, session history, thread resolution, screen context, browser tools, desktop tools, tool-call rounds, interruption, and proactive speech.
- `main.js` became an Electron god object. It handled windows, tray, backend process management, chat history, Live2D model download, Win32 screenshot FFI, click-through policy, logging, and settings-like state.

The written scope also contradicted itself. `spine-now.md` froze a small spine, but README status and dependencies expanded into screen sense, Playwright, pyautogui, voice cloning, packaging, browser control, and desktop control. That made the docs feel complete while the product boundary kept moving.

So the failure was not "there were no modules." The failure was that modules did not become firewalls. Optional modules entered the main path, orchestration concentrated into a few files, and completion claims outran executable acceptance.

## Engineering Lessons

- Scope needs one source of truth. Greyfield Next uses `packages/dev-harness/v1-features.json`; README and progress docs must not invent completion status.
- The default implementation route is a TS monorepo. Python/Hermes bridges can be added later behind explicit module boundaries, but V1 must not recreate the old Python backend plus Electron split.
- Runtime code must stay thin at the seams. `core-runtime` owns conversation state and provider orchestration; `audio-runtime` owns audio mechanics; `stage-live2d` owns character rendering; `persistence` owns files and memory.
- Desktop shell code must not make product decisions. `apps/desktop` owns windows, IPC, settings UI, tray, and logs. It does not own LLM policy, tools, memory, or audio state machines.
- Fake providers are required early. V1 must be testable without API keys, microphone hardware, downloaded Live2D assets, or external services.
- Acceptance must be executable. A feature is not "done" because a document says it is done; it needs a test, harness script, or Playwright check.
- Process must be smaller and harder. Heavy rulebooks did not stop scope drift. Next keeps the hard checks close to code: feature manifest, TDD, typecheck, acceptance harness, and explicit non-goals.

## V1 Guardrails

V1 is only the alive desktop companion:

- visible character
- text input and response
- voice input/output path
- sentence-level TTS
- interruptible playback/generation
- persona and recent context continuity
- persisted settings and sessions

V1 禁止:

- 桌面控制
- 浏览器控制
- 长期任务
- 多 Agent
- 直播
- Godot/VRM
- 消息平台 gateway
- 技能自生成

These capabilities may return after V1 only as separate modules with their own risk model, sandbox boundary, feature manifest items, and acceptance tests.

## Carry Forward

Carry forward from old Greyfield:

- the product desire: a desktop character that feels present
- failure lessons about Live2D and voice integration boundaries
- the idea of persona plus memory plus recent session context
- hard-won notes about Windows screenshot and click-through quirks

Do not carry forward:

- Python backend code as the default runtime
- god-object voice or Electron files
- README-driven completion claims
- browser/desktop control in the V1 path
- broad future directories that make the system look more complete than it is
