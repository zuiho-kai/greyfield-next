# Progress Log

## Current V1 Progress Snapshot

| Area | Status | Evidence | Remaining Risk |
| --- | --- | --- | --- |
| TS monorepo scaffold | Done | `pnpm typecheck`, package boundaries in `apps/desktop` and `packages/*` | Keep generated files out of source review. |
| Real Live2D stage | Done | `pnpm harness:live2d` with Mao fixture: `usedFallback=false`, frame changes, touch expression/motion pass | Need user model import polish and more model fixtures. |
| Transparent pet window | Done, revised | `pnpm harness:electron`, `pnpm harness:pet:quick`; pet window is transparent and has no settings panel | Windows native shape is disabled by default because it clips visuals and drifts bounds. |
| Model hit test | Done | Alpha smoke checks and `vitest alpha-hit-test pet-interaction` | Need future two-window input layer for perfect transparent holes without native clipping. |
| Drag window | Done, revised | Drag changes window x/y; width/height and model scale stay stable in harness; pet quick now chooses a stable internal alpha point instead of an animated edge pixel | Playwright plus ignore-mouse is brittle; keep quick/full harness separate. |
| Wheel scale | Done | Mouse-anchored reducer, bounded range, disabled during drag/pass-through | Need visual tuning for head/upper-body zoom per model. |
| Speech bubble | In progress, P1 first slice improved | Placement unit tests now cover horizontal and vertical viewport clamp; visible pet bubble path; bubble text normalized/capped and stable bubble hit box covered by Electron harness | Needs final visual QA against real screen edges, different model positions, and real long streaming output. |
| Settings/chat shell | In progress, P1 first slice improved | Full Electron harness opens settings/chat and verifies isolation; `App.vue` split into `PetWindow.vue`, `ChatWindow.vue`, `SettingsWindow.vue`; Test LLM button covered by Electron harness; runtime errors restore the failed user text to the chat draft | Needs AIRI-style visual pass, fuller provider retry UX, and real model manager UX. |
| Fake runtime chain | Done | `pnpm harness:acceptance` path exists; Electron harness verifies fake chat reply | Real LLM/TTS/ASR are not V1-stable yet. |
| OpenAI-compatible LLM | Main-process skeleton integrated, deterministic Test LLM path done; first real-provider smoke passed | Provider unit tests; `RuntimeService` tests; Electron harness chat path goes through main `runtime:input`/`runtime:event`; settings Test LLM reaches main and reports first-token success/failure; Test LLM is single-flight and rejected during an active chat response; interrupt aborts active stream signal in tests; provider timeout/malformed SSE errors become readable runtime error state; renderer preview is fake-only even with OpenAI-compatible settings; renderer stores only API-key presence, not the secret or mask; 2026-05-26 user-provided OpenAI-compatible endpoint succeeded through `RuntimeService.testLLM()` when base URL used `/v1` | Need full real-chat QA, Stop/abort proof with the real endpoint, JSONL session proof under real provider, fuller retry UX, and main-process controller split. |
| Persona/recent context | Desktop persistence done | `GFN-V1-007` tracks package-level prompt assembly; `GFN-V1-015` now wires Electron main to character YAML, `data/memory.md`, JSONL session persistence, and `pnpm harness:electron:restart-context` proves restart continuity | Recent context remains capped by core runtime; future work is memory editing UX, not V1 acceptance wiring. |
| Renderer/harness complexity | Improved in PR #1; Phase E added restart coverage | Largest hotspots reduced: `App.vue` 278 lines, `desktop-runtime-bridge.ts` 261, `electron-check.ts` 339 plus `electron-check-helpers.ts` 232, restart context harness 152 lines | `Live2DStageView.vue` remains a future split target; harness can later split by pet/settings/chat files. |
| Repo/PR flow | Private repo active; PR #1 and stacked PR #2 merged | Private GitHub repo `zuiho-kai/greyfield-next`; `feature/settings-test-llm` and `feature/desktop-persistent-context` merged to `main` on 2026-05-26 | `.github/workflows/ci.yml` is still not in the repo because current GitHub token lacks `workflow` scope. |
| Dev/CI loop speed | Improved, policy documented | `dev:live2d:fast` reaches Electron PID in about 2.2s; `harness:pet:quick` about 6-8s; `harness:electron:quick` reuses built artifacts at about 7-8s locally; `docs/development-speed-policy.md` defines fast-loop vs checkpoint verification | Hosted CI Electron GUI may still need tuning; full harness must stay checkpoint-only. |

Current product plan: [Greyfield Next V1 产品计划](plans/v1-product-plan.md).

## 2026-05-23

- Created Greyfield Next monorepo scaffold.
- Added V1 feature manifest and feature manifest validation.
- Added unit tests for prompt assembly, recent session history, runtime streaming, interrupt handling, sentence splitting, and Live2D model manifest resolution.
- Added first-pass runtime/audio/stage/persistence package implementations.
- Added desktop package shell with typed IPC and window plan placeholders.
- Added failure retro guardrail so the old Greyfield scope collapse is not repeated.

## 2026-05-24

- Added `stage-live2d` pure config boundaries for expression fallback, motion fallback, touch hit-area resolution, and bounded audio-volume mouth-open mapping.
- Marked motion/expression/touch mapping as in progress in `v1-features.json`; real Pixi/Live2D rendering remains a separate acceptance item.
- Added browser-safe persistence config schema/defaults with microphone selection, and kept Node file IO behind the persistence config loader.
- Added desktop renderer settings state for model, voice, microphone, character file, and Live2D model path; edits are tested to stay separate from conversation history.
- Added desktop interrupt bridge and Stop control; interrupt now clears assistant draft, fake TTS queue, and mouth-open state in renderer state.
- Added a canvas-backed stage frame builder and connected the desktop renderer stage preview to real canvas drawing commands. This is still a preview renderer, not the final Pixi/Live2D runtime.
- Renamed the canvas preview path to fallback terminology. `pnpm harness:fallback` can still verify the debug preview, but it no longer counts as Live2D V1 acceptance.
- Added Electron main-process window options, main-process bundling, and `pnpm harness:electron`; the harness launches Electron, checks the pet window dimensions, and verifies the canvas-backed stage appears.
- Added a typed Electron preload bridge and preload bundle; the Electron harness now verifies `window.greyfield` is exposed inside the renderer.
- Added main-process settings persistence through typed IPC; the Electron harness now sends `settings:update`, receives `settings:changed`, and verifies the temporary config file is written.
- Tightened the Electron settings harness to fill the renderer Model input and verify that the UI path travels through preload IPC into persisted config.
- Extended the Electron harness to send a chat message through the renderer and verify the fake assistant reply appears in the message list.
- Added a pure Live2D model3 parser for moc, texture, expression, and motion-group metadata.
- Extended the Electron harness to click the Stop button and verify the renderer enters the interrupted state.
- Added JSONL session-store coverage proving turns persist and recent context can be reloaded across store instances.
- Added a pure RMS VAD boundary in `audio-runtime`; microphone capture remains a separate integration step.
- Added Live2D preview scale and position settings to renderer state, IPC mapping, UI controls, and the canvas frame builder.
- Added real Pixi 6.5.x + `pixi-live2d-display` + Cubism runtime dependencies using the AIRI-proven route.
- Added `Live2DStageView` and `PixiLive2DRenderer`; the renderer now tries a real `.model3.json` first and only falls back to the old preview on load failure.
- Added `pnpm harness:live2d`, which launches the desktop renderer with a real Cubism sample model and verifies `usedFallback=false`, non-transparent WebGL pixels, frame changes, speaking expression, speaking motion, and touch area reaction.
- Added a DigitalMate2D-style interaction profile for touch and emotion reactions so head/body behavior is config-shaped instead of hardcoded in the Vue component.
- Added audio-level metering and changed runtime mouth-open control to use synthesized audio level instead of a fixed mouth value.
- Split the renderer into a transparent pet window and a separate settings/control window; the pet window now has no web page background or control panel.
- Changed the Live2D renderer to fit models to the stage before applying user scale, and made the canvas resize with its container instead of relying on a fixed 420x620 canvas.
- Tightened `pnpm harness:live2d` and `pnpm harness:electron` to reject non-transparent pet shells, visible controls in the pet window, fallback-only Live2D, and mismatched canvas sizing.
- Added `docs/product-shape.md` as the hard V1 definition for pet window, model mask region, pass-through, drag, bounded wheel scale, speech bubble, and menu recovery.
- Added `docs/qa-retro.md` documenting why earlier black-box tests missed desktop-pet basics and what future agent tasks must cover.
- Added V1 feature manifest entries for model alpha hit test, transparent-area pass-through, model drag window, bounded wheel scale, and speech bubble placement.
- Replaced whole-window click-through as the primary path with renderer-driven `window:set-hit-test`; Electron main now only applies pass-through and window movement.
- Added reactive model-hit and dragging state in `Live2DStageView`, plus final framebuffer alpha sampling so the Live2D harness can prove transparent pixels and model pixels are distinguished.
- Added `docs/reference-solutions.md` to capture why Greyfield uses a ZcChat2-style alpha-shaped input region instead of AIRI's visual-only whole-window overlay behavior.
- Added renderer-to-main `window:set-shape`; the pet window now shapes input to model alpha rects plus speech bubble rect, expands to full-window shape only during drag, and restores the model shape after release.
- Fixed renderer state synchronization for `settings:changed` and `window:state` so Model Pass Through disables wheel scaling immediately.

## 2026-05-25

- Marked the already-verified desktop pet core features as completed in `v1-features.json` while keeping runtime/audio/settings polish in progress.
- Added Live2D model selection resolution for direct `.model3.json` files and model directories, including manifest parsing for expressions and motion groups.
- Added a settings-page `Choose model` entry point, transform reset, and expression/motion preview chips fed by Electron main after model selection.
- Added OpenAI-compatible streaming LLM provider support behind the existing provider boundary; fake provider remains the default harness path.
- Extended Electron harness coverage for stable internal model hit points, reset transform persistence, and wheel scaling being blocked during drag.
- Updated generated-file ignore rules for Electron build outputs and local logs.
- Fixed a major Windows desktop-pet regression: native `BrowserWindow.setShape` was being used as both visual clipping and input masking. It caused animated Live2D mask desync, jagged edges, and drag-time window bounds drift. V1 now defaults to renderer alpha hit-testing plus dynamic `setIgnoreMouseEvents`; native shape is behind `GREYFIELD_ENABLE_NATIVE_SHAPE=1` only.
- Added stable coarse pet-window shape creation tests for the abandoned native-shape path so future experiments do not send raw alpha scanlines straight to the OS.
- Fixed drag movement to preserve native window width/height with `setBounds` and a small correction loop, preventing DPI rounding from making the pet grow while dragging.
- Added `pnpm dev:live2d:fast`, `pnpm dev:live2d:rebuild`, and `pnpm dev:live2d:stop`. The dev launcher writes `.cache/greyfield-live2d-dev-pids.json` so restart no longer scans all Windows processes.
- Added `pnpm harness:pet:quick` for high-frequency pet interaction checks. Full `pnpm harness:electron` remains the checkpoint harness for settings/chat/runtime shell behavior.
- Reworked Electron harness input paths where Playwright conflicts with `setIgnoreMouseEvents`, using smoke hit-test and direct wheel dispatch for deterministic validation while keeping real drag coverage.
- Added a checkpoint plan to reset the next work order: preserve pet stability, finish bubble/chat UX, move runtime/LLM into Electron main, then make OpenAI-compatible provider genuinely usable with abort/error handling. This has since been replaced by the Chinese product plan in `docs/plans/v1-product-plan.md`.
- Added `apps/desktop/src/main/runtime-service.ts` and moved the Electron desktop chat path onto main-process runtime IPC. Renderer now sends `runtime:input` when a preload host exists and updates UI from broadcast `runtime:event`.
- Added `AbortSignal` support to `OpenAICompatibleLLMProvider.stream`, core runtime LLM streaming, and main `RuntimeService` interrupt routing so Stop can abort the active provider request path instead of only changing UI state.
- Added layered GitHub Actions CI in `.github/workflows/ci.yml`: fast type/unit/acceptance checks, a desktop-pet quick harness job, and a manual/main-branch checkpoint harness. Added `test:unit`, `build:desktop`, and quick harness scripts so CI does not rebuild Electron more than necessary.
- Ran an architecture review focused on module boundaries and complexity. Result: renderer real-provider fallback was removed, settings broadcasts now use renderer-safe redacted config, and main `RuntimeService` interrupts the active text run before accepting a newer one.
- Added `docs/architecture-retro.md` to make the new ownership rules explicit: real provider calls in Electron main only, Live2D decisions in renderer stage only, native window side effects in main only, fake providers only in harness/no-host preview.
- Tightened renderer secret handling so settings state stores only API-key presence, not the raw key or mask. The settings UI shows an empty password field with a saved-key placeholder.
- Made the full Electron harness less timing-fragile by retrying synthetic wheel dispatch inside the scale-change timeout window instead of relying on one Playwright event.
- Added `docs/development-speed-policy.md` and linked it from `AGENTS.md` after the development loop slowed down. New rule: targeted tests and fast harness during active edits; full Electron/checkpoint verification only for milestones or high-risk surfaces.
- Stabilized the interrupted controller extraction with targeted controller tests, `pnpm typecheck`, and `pnpm harness:pet:quick`.
- Improved Step 2 bubble/chat UX: pet bubbles now normalize and cap long streaming text, reserve a stable bubble hit/placement box, and the chat window shows runtime status plus readable error messages.
- Added OpenAI-compatible provider timeout handling and malformed SSE errors, with renderer error-state coverage so provider failures do not disappear behind the chat UI.
- Added a settings-side `Test LLM` action that probes the current provider through Electron main and reports first-token success or readable failure without appending session history.
- Split `App.vue` into pet, chat, and settings window components; split renderer bridge helpers for settings mapping, preview runtime events, and runtime event reduction.
- Split shared Electron harness helpers out of `electron-check.ts` and changed the harness config import to the public `@greyfield/persistence/config-schema` package path.

## 2026-05-26

- Created private GitHub repository `zuiho-kai/greyfield-next` and pushed the initial `main` branch.
- Opened PR #1 from `feature/settings-test-llm` for the settings-side LLM test and complexity split batch.
- Added settings `Test LLM`, routed through Electron main `RuntimeService`, with first-token success/readable failure result rendering in settings.
- Added a main-process guard so `Test LLM` is rejected while a chat response is active and concurrent provider tests are single-flight.
- Verified `Test LLM` in Electron harness with `providerTestWorked: true`.
- Updated `v1-features.json` after PM/architecture review: `GFN-V1-007` is now core prompt assembly only, `GFN-V1-015` tracks desktop persistent recent context, speech-bubble acceptance includes text normalize/cap behavior, and settings shell acceptance includes Test LLM UI proof.
- Split renderer surfaces into `PetWindow.vue`, `ChatWindow.vue`, and `SettingsWindow.vue`; `App.vue` now primarily routes by window role and coordinates shared state.
- Split renderer bridge helpers into `settings-state-mapper.ts`, `runtime-event-reducer.ts`, and `preview-runtime-events.ts`.
- Split shared Electron harness helpers into `electron-check-helpers.ts` and changed the harness config import to the public package export.
- Verification for PR #1 after PM/architecture review fixes: targeted `runtime-service` + manifest tests (11 tests), `pnpm typecheck`, `pnpm test` (38 files / 113 tests), `pnpm harness:acceptance`, `pnpm harness:pet:quick`, and Electron harness with local Electron override all passed.
- Wired Electron main runtime to persistence-backed character persona, Markdown memory, and JSONL session stores for `GFN-V1-015`.
- Added `pnpm harness:electron:restart-context`, which launches Electron twice against the same temp user data and verifies the second provider prompt includes the first persisted user/assistant turn.
- Fixed the desktop main ESM bundle so bundled CommonJS dependencies can resolve Node built-ins under Electron.
- Merged PR #2 into PR #1, then merged PR #1 into `main`. Updated the checkpoint plan with the remaining post-merge V1 work order.
- Replaced the old checkpoint-plan sprawl with the Chinese PM-facing plan at `docs/plans/v1-product-plan.md`.
- Began the post-merge P1 gap pass: speech bubble placement now clamps inside the pet window and available screen bounds; runtime error state restores the failed user input as a retry draft; pet quick harness uses stable internal alpha points for model hit validation.
- Verification for this P1 slice: targeted renderer/dev-harness tests, `pnpm typecheck`, `pnpm test`, and `pnpm harness:pet:quick` passed locally.
- Began P2 real-provider QA with user-provided OpenAI-compatible settings. Root base URL did not produce a first token; the same endpoint with `/v1` succeeded. `RuntimeService.testLLM()` received a first token from `mimo-v2.5`. The API key was used only through environment variables and was not written to Markdown or repo config.

## QA Bar

- Unit tests must run with `pnpm test`.
- TypeScript references must build with `pnpm typecheck`.
- Harness must run with `pnpm harness:acceptance`.
- Fallback canvas checks can run with `pnpm harness:fallback`, but V1 Live2D must be proven with `pnpm harness:live2d`.
- Electron shell harness must run with `pnpm harness:electron` before claiming desktop window behavior.
- During active desktop-pet iteration, run `pnpm harness:pet:quick` first. Run full `pnpm harness:electron` before claiming a checkpoint or changing settings/chat IPC.
- Visible Live2D quality must be checked separately from input masking. Native shape passing an input test does not prove the model is visually clean.
- CI should stay layered. Do not put full Electron checkpoint harness in every tiny PR path unless the change touches Electron main/preload/settings/chat behavior.
