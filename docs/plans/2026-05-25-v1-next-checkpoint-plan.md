# Greyfield Next V1 Next Checkpoint Plan

Date: 2026-05-25

This plan starts from the current desktop-pet checkpoint, after the Windows native-shape regression was fixed and the fast pet harness was added.

Execution speed rule: follow `docs/development-speed-policy.md`. During active implementation, use targeted tests and the relevant fast harness. Reserve full `pnpm harness:electron` and the full checkpoint loop for milestones, high-risk Electron IPC changes, or user-facing verification.

## Current Baseline

| Area | Current State | Proof | Status |
| --- | --- | --- | --- |
| Transparent pet window | Real transparent frameless Electron pet window, no settings panel inside pet surface | `pnpm harness:pet:quick`, `pnpm harness:electron` | Stable enough for iteration |
| Live2D rendering | Real Pixi/Live2D path with Mao fixture; fallback is not counted as V1 | `pnpm harness:live2d` | Stable enough for iteration |
| Model hit-test | Renderer samples final alpha; native shape is disabled by default | `vitest pet-interaction`, `pnpm harness:pet:quick` | Stable enough for iteration |
| Drag | Model-pixel drag moves native window and preserves width/height/scale | `pnpm harness:pet:quick` | Stable enough for iteration |
| Wheel scale | Mouse-anchored, bounded, disabled during drag/pass-through | `vitest pet-interaction`, `pnpm harness:pet:quick` | Needs visual tuning |
| Speech bubble | Basic bubble exists and placement reducer is tested | `vitest speech-bubble-placement` | In progress |
| Settings/chat windows | Separate settings/chat surfaces exist; settings persist through IPC | `pnpm harness:electron` | In progress |
| Fake runtime | Text -> fake LLM -> sentence fake TTS -> mouth/stage events works | `pnpm harness:acceptance`, renderer bridge tests | Stable fake path |
| Main runtime service | Electron main owns the desktop fake runtime path and broadcasts `runtime:event` to renderer windows | `runtime-service.test`, `desktop-runtime-bridge.test`, `pnpm harness:electron` | Needs persistent stores, provider error UX, and API-key masking |

## LLM Call Progress

### What Exists

- `packages/core-runtime/src/openai-compatible-provider.ts` implements an OpenAI-compatible streaming chat completions provider.
- It posts to `{baseUrl}/chat/completions` with `model`, `messages`, `stream: true`, optional `tools`, and `Authorization: Bearer <apiKey>`.
- It parses SSE `data:` lines and yields `choices[0].delta.content` chunks.
- Unit coverage exists in `packages/core-runtime/src/__tests__/openai-compatible-provider.test.ts`.
- `apps/desktop/src/renderer/desktop-runtime-bridge.ts` selects the OpenAI-compatible provider when:
  - `providerLLM === "openai-compatible"`
  - `providerApiKey` is non-empty
- Settings already include provider kind, base URL, API key, and model fields.
- Renderer bridge tests prove the configured OpenAI-compatible path calls `fetch` and reduces streamed text into chat state.

### What Does Not Exist Yet

- The Electron desktop path now uses main-process `RuntimeService` for fake runtime events, but the renderer fallback path can still construct an in-memory preview runtime when no host API exists.
- API key currently lives in renderer state after settings sync. This is acceptable for scaffold testing but not the final desktop app boundary.
- Main-process `RuntimeService` owns the current Electron runtime path, but it still uses fake memory/TTS and in-memory sessions.
- There is no real-network harness because fake provider must remain deterministic for CI/local QA.
- Done in core/main tests: interrupt now aborts the active LLM stream signal.
- Done in core/renderer tests: provider timeout and malformed SSE errors become readable runtime error state, and the chat window displays runtime errors.
- Done in Electron harness: provider settings have a dedicated test action that reports first-token success or a readable failure.
- Provider settings still need fuller retry UX and real-network manual QA.
- Persona file and JSONL session persistence are not wired into the Electron desktop runtime path yet; main `RuntimeService` still uses in-memory session and fake memory.
- TTS is still fake in the desktop path, so "LLM -> real voice -> audio mouth sync" is not complete.

### Current LLM Status

LLM is at **provider skeleton + main-process fake runtime integration**.

It is not yet a finished V1 LLM path. The Electron desktop path now sends `runtime:input` to main and receives `runtime:event` back, while fake provider remains the default. The next milestone is making OpenAI-compatible provider safe and usable from main with error/interrupt handling.

## Next Implementation Order

### Phase A: Preserve Desktop-Pet Stability

Do not start real audio or agent scope until the desktop pet stays visually stable.

1. Keep native `BrowserWindow.setShape` disabled by default.
2. Run `pnpm harness:pet:quick` for every drag/hit/wheel/pass-through change.
3. Run `pnpm harness:electron` before any checkpoint claim.
4. Manually verify with the visible pet after window/mask/scale changes.

Exit criteria:

- No Live2D visual clipping from input masks.
- Drag does not resize the native window.
- Wheel scale does not trigger during drag or pass-through.

### Phase B: Finish Bubble And Chat UX

1. Make bubble text length and wrapping sane for streaming output.
2. Ensure bubble hit area does not break pet pass-through.
3. Add setting toggle coverage for bubble on/off.
4. Make chat window the full conversation surface, with Stop always visible.

Exit criteria:

- Bubble is useful for short responses.
- Chat remains the reliable full-history UI.
- Pet window still contains only model + bubble + minimal controls.

### Phase C: Move Runtime/LLM To Main Process

Goal: renderer becomes UI only; main owns runtime, provider calls, API key, session store, and event fan-out.

Implementation tasks:

1. Done: add `apps/desktop/src/main/runtime-service.ts`.
2. Done: main creates `GreyfieldRuntime` from current config.
3. Done: renderer sends `runtime:input` over preload IPC when a host API exists.
4. Done: main sends `runtime:event` back to pet/chat/settings windows.
5. Done: keep fake provider as the default runtime provider.
6. Done for Electron path: OpenAI-compatible provider construction is available in main runtime service.
7. Remaining: stop syncing raw API key into renderer state where possible; renderer can show masked/edited settings but main should own provider execution.
8. Remaining: replace fake memory/session/TTS in main runtime service with persistence-backed implementations.

Tests:

- Unit: runtime-service fake provider event flow.
- Unit: settings update rebuilds provider config without mutating conversation state.
- Electron: chat sends text through IPC and receives streamed fake runtime events.

Exit criteria:

- The fake chat path still works after renderer no longer owns runtime execution.
- OpenAI-compatible provider can be constructed in main/runtime service.
- Remaining before closing Phase C fully: API-key masking and persistence-backed stores.

### Phase D: Make Real LLM Provider Usable

1. Done: add `AbortSignal` support to `OpenAICompatibleLLMProvider.stream`.
2. Done: wire `runtime.interrupt` to abort the active provider request in `GreyfieldRuntime` and `RuntimeService`.
3. Done: add provider timeout and readable error events.
4. Done: add a settings "test LLM" action that sends a tiny prompt and reports first-token success/failure.
5. Keep `pnpm harness:acceptance` on fake provider only.

Tests:

- Done: provider abort-signal test.
- Done: provider malformed SSE/error test.
- Done in core/main unit tests: runtime interrupt aborts active stream signal.
- Done: main IPC converts runtime-service rejections into `error` events, and renderer reduces those into visible chat error state.
- Done in Electron harness: settings "Test LLM" reaches main runtime service and renders a success result for the fake provider path.

Exit criteria:

- User can configure OpenAI-compatible endpoint/model/key and test it.
- First token can appear in chat/bubble via real provider.
- Interrupt aborts the active stream signal in tests; remaining work is surfacing abort/error state cleanly in UI.

### Phase E: Persistent Persona And Recent Context

1. Load `characters/greyfield.yaml` in main runtime service.
2. Load `data/memory.md` through `MemoryStore`.
3. Use JSONL `SessionStore` in Electron path.
4. Add restart harness proving recent context/handoff survives app restart.

Exit criteria:

- Restart remembers model/window settings and recent conversation context.
- Prompt assembly uses persona, memory, handoff, and recent turns in the real desktop path.

### Phase F: Real TTS Then ASR

Only start after main-process LLM path is stable.

1. Add TTS provider config behind `TTSProvider.synthesize`.
2. Keep sentence-level queue behavior.
3. Drive `StageDriver.setMouthOpen` from playback/audio level, not fake bytes.
4. Add microphone/VAD/ASR after TTS playback and interrupt are stable.

Exit criteria:

- LLM first sentence starts TTS before full reply finishes.
- Interrupt stops provider stream, TTS queue, playback, and mouth-open within 500ms.

## Command Policy

Fast loop:

```bash
pnpm dev:live2d:fast
pnpm harness:pet:quick
pnpm test
```

Checkpoint loop:

```bash
pnpm typecheck
pnpm test
pnpm harness:acceptance
pnpm harness:live2d
pnpm harness:electron
```

Do not use full Electron harness for every tiny pet interaction edit; it is a checkpoint gate. Do not claim LLM complete until main-process runtime, real provider error handling, interrupt abort, and persistent session are wired.
