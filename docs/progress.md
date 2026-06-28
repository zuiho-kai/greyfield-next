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
| Speech bubble | Done on main | Placement unit tests cover stable upper window-slot placement, viewport clamp, and non-following behavior; `pnpm harness:electron:bubble-long-reply` proves first streaming token reaches the bubble, long text is capped, bubble position stays stable, and Chat keeps the full reply; `pnpm harness:electron:bubble-edge-clickthrough` proves right-edge containment and disabled-bubble shape removal; `pnpm harness:v1-visual` screenshots were inspected; `frontend-full` runs this path for frontend-visible PRs | Continue visual review when bubble styling or window shape changes. |
| Settings/chat shell | Done on main | Full Electron harness opens settings/chat and verifies isolation; Chat renders Waiting/Generating/Stopped/Failed/Retry-ready states; Stop remains available during streaming and queued voice playback; provider readiness panel shows Preview/blocked/ready-to-test; Test LLM success/failure/testing/active-chat rejection are covered by harnesses; #45 fixed Settings visual polish and destroyed-window menu recovery; #59 adds the separate draggable floating controls window and fixes narrow Settings scale/position controls; latest current-head evidence `731f951` passed GitHub Actions run `28289995890`, including `frontend-full` | Continue visual/lifecycle review when Settings, Chat, controls, or Electron window lifecycle changes. |
| Voice input/output | Done on main | Settings exposes `Test Voice`; `pnpm harness:real-tts` proves the configured OpenAI-compatible TTS endpoint returns playable MP3 bytes when credentials are supplied; `pnpm harness:electron:real-tts` proves Settings `Test Voice`, real TTS bytes entering Electron renderer playback, natural playback queue cleanup, Stop audio cancel, and mouth-open reset; #55 adds browser microphone recording, OpenAI-compatible `/audio/transcriptions` ASR, transcript-to-chat routing, decoded PCM mouth-open playback, and `pnpm harness:electron:voice-input`; #59 adds WebAudio fade-in and serialized speech playback; latest current-head evidence `731f951` passed GitHub Actions run `28289995890`, where `frontend-full` reported 17 checks passed in 3m 41s, `noOverlappingSpeech: true`, waveform mouth movement, queue clear, and mouth-open reset | Real external LLM/TTS endpoint demos still require env-backed reruns before a credentialed release demo claim. |
| Fake runtime chain | Done on main | `pnpm harness:acceptance` path exists and now covers fake audio input -> ASR -> transcript -> LLM -> TTS in addition to typed text; Electron harness verifies fake chat reply; #41 verifies text, TTS event flow, and desktop shell integration together | Keep fake path deterministic without microphone hardware or API credentials. |
| OpenAI-compatible LLM | Done on main except current real-provider env rerun | Provider unit tests; `RuntimeService` tests; Electron chat path goes through main `runtime:input`/`runtime:event`; settings Test LLM reaches main and reports first-token success/failure; Test LLM is single-flight and rejected during an active chat response; provider timeout/malformed SSE errors become readable runtime error state; renderer preview is fake-only even with OpenAI-compatible settings; renderer stores only API-key presence; provider failure/abort/long-bubble/restart harnesses pass on main through the merged V1 integration and `frontend-full` gate | `pnpm harness:electron:real-llm` still requires `GREYFIELD_REAL_LLM_*` credentials; rerun with credentials before claiming a real endpoint demo. |
| Persona/recent context | Desktop persistence done | `GFN-V1-007` tracks package-level prompt assembly; `GFN-V1-015` now wires Electron main to character YAML, `data/memory.md`, JSONL session persistence, and `pnpm harness:electron:restart-context` proves restart continuity | Recent context remains capped by core runtime; future work is memory editing UX, not V1 acceptance wiring. |
| Renderer/harness complexity | Improved in PR #1; Phase E added restart coverage | Largest hotspots reduced: `App.vue` 278 lines, `desktop-runtime-bridge.ts` 261, `electron-check.ts` 339 plus `electron-check-helpers.ts` 232, restart context harness 152 lines | `Live2DStageView.vue` remains a future split target; harness can later split by pet/settings/chat files. |
| Repo/PR flow | Private repo active; PR flow and CI active | Private GitHub repo `zuiho-kai/greyfield-next`; feature branches merge through PRs; `.github/workflows/ci.yml` is now in the repo | Continue avoiding direct pushes to `main`. |
| Dev/CI loop speed | Improved, policy documented, CI restored | `dev:live2d:fast` reaches Electron PID in about 2.2s; `harness:pet:quick` about 6-8s; `harness:electron:quick` reuses built artifacts at about 7-8s locally; `docs/development-speed-policy.md` defines fast-loop vs checkpoint verification; GitHub Actions runs fast checks + pet quick on PR and full checkpoint on main/manual dispatch | Hosted CI Electron jobs now run `install-electron`; full harness must stay checkpoint-only. |

Current product plan: [Greyfield Next V1 产品计划](plans/v1-product-plan.md).

Post-V1 roadmap: [Greyfield Next 版本产品书](plans/version-product-book.md) defines V1.1 productization, V2.1 long-term memory and relationship continuity, V2.2 character/persona customization, V2.3 screen awareness, V2.4 controlled desktop operation, V2.5 voice identity, and the later platform direction.

V2.1 memory research notes: [Clowder AI](research/v2-memory/clowder-ai.md), [SillyTavern](research/v2-memory/sillytavern.md), [MaiBot](research/v2-memory/maibot.md), and [Greyfield synthesis](research/v2-memory/synthesis.md).

V2 memory implementation goal: [V2 Memory Goal](plans/v2-memory-goal.md) records the merged V2.0 raw-log, summary-segment, recall-context, memory-control, and memory benchmark foundation. Future memory product work is tracked as V2.1 in the version product book.

## 2026-06-23

- Built and merged #41 as the V1 integration branch combining #35, #36, #37, #38, #39, and #40 for issues #26-#31.
- Closed stale PR #32 because #38/#41 replaced the earlier generated evidence-ledger approach.
- Found and fixed the cross-branch Stop regression: after #29/#30, text can be complete while voice output is still queued, so Chat Stop must remain enabled for speech cancellation.
- Merged #41 into `main`, closing issues #26-#31 and bringing the integrated V1 QA polish into the release line.
- Merged #42 to keep pet dragging active across transparent pixels while a drag is already in progress.
- Merged #43 to keep Settings API key input editable when renderer-safe masked settings echo back from Electron main.
- Merged #44 to add the `frontend-full` acceptance gate for frontend-visible PRs. Main push `f571bed` passed Fast checks, Desktop pet quick harness, and `frontend-full` on GitHub Actions.
- `packages/dev-harness/v1-features.json` now marks the V1 feature set completed on main. V1 release wording should still be tied to current-head evidence after any closeout UI or main-process lifecycle fix.
- `pnpm harness:electron:real-llm` has not been rerun with current `GREYFIELD_REAL_LLM_BASE_URL`, `GREYFIELD_REAL_LLM_API_KEY`, and `GREYFIELD_REAL_LLM_MODEL` values in this environment. Treat real endpoint proof as credentialed release evidence, not a blocker for fake/failure/abort coverage.

## 2026-06-24

- Merged #45 to polish Settings UI, prevent destroyed Settings/Chat window menu crashes, and update V1 closeout evidence from the old #41/#44 candidate wording.
- After #45, main head `d53b5aa9e24241b8d47a8201b9a681f663c2d577` passed PR checks on #45, but the post-merge main push run `28018394412` failed in `frontend-full` at `pnpm harness:electron:stop-audio`.
- Diagnosed the Stop audio failure as a harness synchronization race: the script waited for Settings to show two queued speech items before proving the Pet window speech probe had queued both utterances.
- Stabilized two additional `frontend-full` timing edges found during local reruns: provider timeout now gives the local server enough time to record the expected request before abort, and the full Electron drag check waits for renderer `data-dragging=true` before testing drag-time wheel blocking and movement.
- Local follow-up evidence: `pnpm install --frozen-lockfile`, `pnpm typecheck`, `pnpm harness:electron:stop-audio`, `pnpm exec tsx packages/dev-harness/src/electron-provider-failure-check.ts`, `pnpm harness:electron`, and `pnpm harness:frontend-full` all passed. The `frontend-full` run passed 14 checks in 2m 11s.
- Merged #46 to main. The #46 acceptance code head `c53b70916ef67543ff80387a2e9af1edaeb26ec3` passed GitHub Actions run `28072461072`: Fast checks, Desktop pet quick harness, and `frontend-full` all succeeded.

## 2026-06-25

- Added Settings `Test Voice`, routed through Electron main, so users can validate TTS settings without sending a chat message and without enabling automatic reply speech.
- Added `pnpm harness:electron:real-tts`, which launches Electron with fake LLM plus real OpenAI-compatible TTS settings, clicks Settings `Test Voice`, proves `/audio/speech` returns MP3 bytes that reach the renderer playback layer, verifies natural playback clears queued speech UI, and verifies Stop cancels active audio while resetting mouth-open state.
- Added a hidden `BrowserSpeechSynthesisOutput` playback probe for deterministic Electron harness coverage without changing normal production playback.
- Wired the real TTS Electron harness into `frontend-full` as an optional credentialed check: it runs when `GREYFIELD_REAL_TTS_*` or compatible `GREYFIELD_REAL_LLM_*` env vars are present and otherwise emits an explicit skip.
- Local voice-output closeout evidence: `pnpm typecheck`, targeted main/renderer/audio tests, `pnpm test:frontend`, `pnpm harness:real-tts`, `pnpm harness:electron:stop-audio`, `pnpm harness:electron:real-tts`, and credentialed `pnpm harness:frontend-full` all passed; the latest `frontend-full` run passed 15 checks in 2m 34s.
- Merged #55 to complete the V1 full-voice closeout after correcting the #54 scope mistake: added OpenAI-compatible ASR provider, Chat microphone recording through renderer `MediaRecorder`, transcript routing through Electron main into the same runtime text path, decoded PCM mouth-open timeline driving during real audio playback, and `pnpm harness:electron:voice-input`.
- Historical #55 main head `4479c262` evidence: `pnpm typecheck`, `pnpm test:backend`, `pnpm test:frontend`, `pnpm harness:acceptance`, `pnpm harness:electron:voice-input`, and `pnpm harness:frontend-full` passed. The voice-input harness uses a local OpenAI-compatible ASR/LLM/TTS server and microphone probe; it proves Stop cancels microphone listening before ASR, then proves ASR -> Chat -> TTS playback, waveform mouth movement, Stop playback cancel, queue clear, and mouth-open reset. That `frontend-full` passed 16 checks in 2m 39s and is superseded by the 2026-06-27 current-head evidence on `731f951`.

## 2026-06-26

- Merged #58 to promote the V1 closeout lessons into repo framework rules.
- Merged #59 as the final visible-experience closeout for V1 desktop controls.
- #59 adds a separate draggable floating controls window for the ordinary desktop-pet path: text input, microphone input, voice output toggle, Settings, Model Pass Through, hide/minimize, and Stop without opening Chat or Settings first.
- #59 fixes manual-QA misses around narrow Settings scale/position controls, speech bubble old-message flash, speech bubble overlap with the rendered model, Live2D transform reset when toggling voice, first TTS sentence abrupt playback, and overlapping speech playback.
- #59 review evidence: `pnpm typecheck`, targeted audio/runtime/bubble/visual tests, `pnpm harness:electron`, `pnpm harness:electron:stop-audio`, `pnpm harness:electron:voice-input`, and `pnpm harness:frontend-full` all passed. The latest #59 `frontend-full` passed 16 checks in 3m 45s; optional real OpenAI-compatible TTS Electron proof was skipped because credential env vars were absent.
- Important #59 evidence fields: `controls.draggable: true`, `controls.activeButtonContrastOk: true`, `chat.speechBubbleAvoidsModel: true`, `voiceToggleKeptLive2DTransform: true`, and `noOverlappingSpeech: true`.

## 2026-06-27

- Merged #63 to add the V2.0a memory foundation: raw chat turns remain source of truth, summary segments keep source-turn references, recall context is deterministic, the desktop runtime writes summary JSONL, Settings exposes a minimal Memory inspection section, and `harness:memory-benchmark` plus `harness:electron:memory-summary` guard the slice.
- The #63 post-merge main push run `28287179659` exposed a `frontend-full` failure in the speech bubble long-reply harness: it sampled `getBoundingClientRect()` during the bubble entry animation and compared that animated rect to the settled rect.
- Merged #65 to stabilize the bubble long-reply harness after entry animation and to recompute the current model hit point in the desktop pet quick harness after wheel scaling.
- Latest current-head evidence `731f95112f8fc7fefd810359ae6a0e2c848c32c7` passed GitHub Actions run `28289995890`: PR bot review gate, Change classifier, Fast checks, Desktop pet quick harness, and `frontend-full`.
- The main `frontend-full` job in run `28289995890` reported 17 checks passed in 3m 41s, including Stop audio `noOverlappingSpeech: true`, microphone ASR and waveform mouth movement, restart context, and memory summary/control harness (`memoryEditVisible: true`, `memoryExportVisible: true`, `disabledMemorySkipped: true`, `deletedMemoryKeptRawTurns: true`).
- V1 visible-experience evidence is now current on `main`; remaining non-current claims are credentialed external real LLM/TTS demo reruns and post-V1 model-management polish.
- Merged #67 as the V2.0b memory-control slice: Settings Memory can edit summary text/cues, disable or re-enable a summary, delete a selected summary without deleting raw chat turns, and export memory evidence.
- Added current-head guard coverage for V2.0b: `SummarySegmentStore.update`, disabled-summary recall skip, RuntimeService memory control methods, renderer IPC bridge commands/results, a disabled-memory benchmark case, and `pnpm harness:electron:memory-control` through main run `28289995890`.
- V2.1f defines the current memory benchmark gate: `pnpm harness:memory-benchmark` is fixture-driven and now covers long-chat summary traceability, deterministic atom extraction, atom recall, source visibility, disabled/noise rejection, false-positive rejection, prompt budget skips, generic episodic scene extraction, and pure core proactive environment-trigger candidates with low-disturbance negative cases. Summary and current-role atom Memory Library controls are covered by `pnpm harness:electron:memory-control`, `pnpm harness:electron:memory-atom-library`, and `pnpm harness:frontend-full`; the memory benchmark remains a non-UI gate and does not dynamically prove the UI. CI fails below the recorded fixture baselines and uploads `.cache/greyfield-memory-benchmark/latest/summary.json`.
- Rewrote the post-V1 product book around V2.1 staged memory work: benchmark gate, raw evidence/source drilldown, long-term memory atoms, trigger recall, emotional scene memory, memory library/privacy, and score-gated CI workflow.
- Opened V2.1 tracking issues: #79 roadmap, #72 benchmark, #73 raw evidence/source drilldown, #74 memory atom extraction, #75 trigger/calendar/evidence recall, #76 scene/proactive recall, #77 Memory Library/privacy, and #78 score-gated PR workflow.

## 2026-06-28

- Implemented the next #75 core memory slice: atom recall now has deterministic calendar matching for date-bearing annual atoms and can inject bounded raw source fragments from linked source turns when the user asks for provenance or original wording.
- `pnpm harness:memory-benchmark` now dynamically proves date-only birthday/first-meeting recall, calendar-intent rejection for unrelated weather questions, Chinese full-date anniversary extraction, and game-review source-passage prompt material from vague negative-game cues. Locked fixture baselines are `summaryRegressionScore: 1`, `recallRegressionScore: 1`, `atomExtractionScore: 0.925`, `atomRecallScore: 0.75`, `proactiveTriggerScore: 1`, `productReadinessScore: 0.51`, and `v21aScenarioScore: 0.5`; the current computed output is `atomExtractionScore: 0.925`, `atomRecallScore: 0.75`, `proactiveTriggerScore: 1`, `productReadinessScore: 0.518`, `productReadinessCapabilityScore: 0.525`, and `v21aScenarioScore: 0.501`.
- Implemented the next #74 core/runtime memory slice: `LLMBackedMemoryAtomExtractor` uses the existing `LLMProvider` abstraction, validates structured atom drafts, rejects UI/event noise and secret-like provider text, falls back to deterministic extraction on invalid provider output, and keeps deterministic extraction as the default. `GreyfieldRuntime` can opt into `memoryAtomExtractionMode: "llm" | "hybrid"` and applies automatic write policy plus similar-atom update/dedupe before persistence.
- `pnpm harness:memory-benchmark` fixture version 6 now dynamically proves scripted LLM rose-preference extraction as a separate preference atom, game-review reasons beyond deterministic wording, invalid LLM output fallback, noisy Settings/weather event rejection, and recall for the extracted atoms. Locked fixture baselines are `summaryRegressionScore: 1`, `recallRegressionScore: 1`, `atomExtractionScore: 0.95`, `atomRecallScore: 0.8`, `proactiveTriggerScore: 1`, `productReadinessScore: 0.55`, and `v21aScenarioScore: 0.53`; the current computed output is `atomExtractionScore: 1`, `atomRecallScore: 0.8`, `proactiveTriggerScore: 1`, `productReadinessScore: 0.556`, `productReadinessCapabilityScore: 0.566`, and `v21aScenarioScore: 0.534`.
- Remaining V2.1 gaps are still explicit: no renderer Memory Library source-drilldown UI, no desktop proactive scheduler/scene sending, no external weather or virtual-home state feed, no Settings/desktop UX for enabling LLM atom extraction by default, broader privacy classification is still limited, and atom clear still does not erase raw turns or summaries.

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
- Adjusted speech bubble product behavior after visual review: the bubble now uses a stable upper window slot instead of following model animation/transform movement, reducing jitter while preserving viewport clamp.
- Tightened provider failure handling: core runtime now writes user/assistant turns only after a non-interrupted final reply, so provider failure or interrupt does not leave half turns in recent context. Added `pnpm harness:electron:provider-failure` for missing-key, 401, 403, 404, timeout, and malformed SSE chat failures; each shows a readable error, restores the draft, and keeps JSONL session clean. Settings Test LLM failures now append retry guidance for API key, Base URL, and Model.
- Added `pnpm harness:electron:provider-abort`, which uses a local SSE endpoint to prove Stop closes the active OpenAI-compatible provider HTTP request instead of only changing renderer UI state.
- Added `pnpm harness:electron:bubble-long-reply`, which uses a local streaming provider to prove first-token bubble display, capped long bubble text, stable bubble placement, and full Chat history retention.
- Added `pnpm harness:electron:settings-active-chat-test`, which proves settings Test LLM shows Stop-or-wait guidance during an active chat stream and does not send a second provider request.
- Tightened restart-context verification so it waits for the final non-draft assistant message before closing Electron; core runtime now persists a successful turn before emitting the final assistant text, preventing UI-final/session-write races.
- Added a provider readiness panel to Settings so fake mode is labeled Preview, incomplete OpenAI-compatible config shows the missing field, and complete config tells the user to run Test LLM.
- Restored CI on `main`: PR checks cover Fast checks and Desktop pet quick; main/manual runs Full checkpoint. Electron CI jobs now run `install-electron` and verify `electron/path.txt`, fixing fresh runner binary failures.

## QA Bar

- Unit tests must run with `pnpm test`.
- TypeScript references must build with `pnpm typecheck`.
- Harness must run with `pnpm harness:acceptance`.
- Fallback canvas checks can run with `pnpm harness:fallback`, but V1 Live2D must be proven with `pnpm harness:live2d`.
- Electron shell harness must run with `pnpm harness:electron` before claiming desktop window behavior.
- During active desktop-pet iteration, run `pnpm harness:pet:quick` first. Run full `pnpm harness:electron` before claiming a checkpoint or changing settings/chat IPC.
- Visible Live2D quality must be checked separately from input masking. Native shape passing an input test does not prove the model is visually clean.
- CI should stay layered. Do not put full Electron checkpoint harness in every tiny PR path unless the change touches Electron main/preload/settings/chat behavior.
