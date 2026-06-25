# QA Retro: Desktop Pet Interaction Miss

The previous black-box tests missed the user's most important complaints because the test target was wrong.

## What Went Wrong

The harness verified process startup, non-empty canvas, Live2D fallback avoidance, and some renderer state. Those are necessary, but they do not prove that the product is a desktop pet.

Missing checks:

- Transparent empty area passes through to apps underneath.
- Visible model pixels remain interactive.
- Left-drag on the model moves the pet window.
- Dragging changes only window position and never changes model scale.
- Wheel scaling works only on model pixels, is bounded, and is disabled during drag.
- Model right-click opens pet menu; transparent area does not behave like a web page.
- Speech bubble anchors to model bounds and flips away from screen edges.
- The pet window visually contains only the model and bubble, not a normal app/page surface.

Because these were not in the task template, a tester could say the build passed while the experience still felt like opening a web page.

## Root Cause

The QA spec treated "Live2D rendered" as equivalent to "desktop pet works." That is false.

The real product has two layers of correctness:

- Renderer correctness: a real `.model3.json` loads, pixels animate, expressions and motions work.
- Desktop-pet correctness: the transparent overlay, alpha hit region, pointer pass-through, drag, scale, bubble, tray, and context menu behave like a desktop object.

The second layer was under-specified.

## New QA Rules

- Live2D rendering does not count as pet-window acceptance.
- Any change touching drag, hit testing, pass-through, wheel scale, or window bounds must have regression coverage.
- Black-box agents must test from a user's desktop perspective: "does this behave like a desktop object, or like a web page?"
- Harnesses must assert state separation: window position changes do not mutate model scale, and model scale changes do not mutate window position.
- Recovery paths are part of QA. If model pass-through or hide is enabled, tray/settings must be able to regain control.

## Black-Box Task Template

Agent A: desktop-pet interaction. Do not read source. Verify transparent-area pass-through, model-pixel interaction, drag, wheel scale, pass-through toggle, and context menu.

Agent B: visual product shape. Confirm the pet window is transparent, frameless, and not a webpage. Confirm speech bubble placement and separate settings/chat windows.

Agent C: regression stress. Repeatedly drag, wheel, interrupt, hide/show, and toggle pass-through. Watch for scale drift, stuck drag, frozen desktop interaction, and lingering processes.

## Current Regression Targets

- `model-alpha-hit-test`
- `transparent-area-pass-through`
- `model-drag-window`
- `bounded-wheel-scale`
- `speech-bubble-placement`
- `pet-context-menu-recovery`

## 2026-06-24 Regression: Frontend Green But Manual QA Found Product Misses

This round exposed a third QA miss: frontend harnesses proved that elements existed and did not overflow the viewport, but they did not prove that the ordinary user path or visual product shape was acceptable.

What happened:

- Settings provider tests used an internal mode path, so a normal user could fill Base URL/API key/model while the provider still behaved like fake preview.
- Chat message markup had stale CSS selectors from an older structure. The DOM existed, but visible user and assistant messages showed large unwanted background blocks.
- The pet speech bubble stayed visible indefinitely and was placed like a web tooltip instead of a transient desktop-pet reply.
- Visual artifacts existed, but the author did not inspect them as a pre-merge gate before handing the build to the user.

How we avoid repeating it:

- Frontend acceptance starts from the ordinary user path. If a user would click or type it, the harness should click or type it too.
- Visual harnesses must include product assertions, not just existence assertions: no stale style collisions, no text/control overflow, no permanent obstruction, no bubble occluding the pet face/body, and expected fade/detach lifecycle.
- The author must open current screenshots before asking the user to manually verify a frontend PR.
- When the user catches a frontend miss, add or update the nearest harness assertion in the same fix branch.

Current command split:

- Frontend aggregate gate: `pnpm harness:frontend-full`
- Visual artifacts: `.cache/greyfield-v1-visual-acceptance/latest/`
- Speech bubble lifecycle: `pnpm harness:electron:bubble-long-reply`
- Settings provider user path: `pnpm harness:electron:settings-provider-test`

## 2026-06-25 Regression: Voice Closeout Claim Outran Actual V1 Scope

The V1 voice closeout exposed a completion-discipline miss: the work first treated real TTS playback as enough progress, while the V1 product requirement still included microphone voice input, ASR-to-chat routing, waveform-driven mouth movement, and Stop coverage across the whole voice stack.

What happened:

- A TTS-only closeout was allowed to merge before the full V1 voice definition was re-audited.
- ASR/microphone input and decoded-audio mouth movement were described as later work even though the user considered them required for V1.
- The first full-voice implementation still had an old core-runtime mouth driver based on encoded TTS bytes, which was not a real waveform/energy signal.
- Electron harnesses were run in parallel during verification, causing build/window/cache timing interference and false failures.
- After the full-voice PR merged, docs still used stale "local branch / needs current-head rerun" wording until a docs-only follow-up corrected them.

How it was fixed:

- #55 added the full voice path: browser `MediaRecorder` microphone capture, OpenAI-compatible `/audio/transcriptions` ASR, `transcript.final`, and routing into the same runtime text path as typed messages.
- Mouth movement ownership moved to renderer playback: `BrowserSpeechSynthesisOutput` decodes actual audio bytes with `AudioContext.decodeAudioData`, builds a PCM energy timeline, and drives `mouthOpen` through renderer state.
- `core-runtime` now emits audio chunks and transcript events, but does not infer mouth movement from compressed/encoded audio bytes.
- `pnpm harness:electron:voice-input` now proves microphone Stop cancellation, ASR -> Chat -> TTS playback, waveform mouth movement, Stop playback cancellation, queue clear, and mouth-open reset with a local OpenAI-compatible ASR/LLM/TTS server and browser probes.
- `pnpm harness:frontend-full` includes the new voice-input harness, and #56 updated progress/planning/evidence docs after #55 merged and current-head checks passed.

How we avoid repeating it:

- Before closing a V1 feature, re-read the feature manifest and product plan and convert every explicit requirement into evidence rows. Do not shrink the requirement to the part already implemented.
- "Real TTS works" is not the same as "voice companion works." Voice acceptance must cover input, ASR, transcript-to-chat, playback, mouth movement, Stop, queue cleanup, and user-visible state.
- Core runtime must not own mouth motion from encoded audio bytes. Real mouth movement belongs to the playback layer that can decode the actual audio signal.
- Electron/browser harnesses that build desktop artifacts or launch windows must run serially unless they are proven isolated. Parallel runs are acceptable for unit tests, not for shared Electron builds/windows.
- A one-off harness failure can be diagnosed with a narrower rerun, but the final claim still needs the aggregate gate to pass afterward.
- After merging a PR that changes completion status, update docs from main/current-head evidence, not from PR-local evidence.

Reusable good patterns from the fix:

- Local OpenAI-compatible fake servers give end-to-end provider coverage without external keys, microphone hardware, or user audio.
- Browser probes are useful when they observe the same public behavior a user path depends on: microphone stop/cancel, audio playback start/cancel, and mouth-open state.
- `frontend-full` should be the aggregate gate for frontend-visible work because it combines unit tests, production build, real Live2D rendering, visual screenshots, Settings/Chat/Pet flows, provider failure/abort paths, Stop audio, microphone ASR, and restart context.
- Visual artifacts must be opened before handoff. Programmatic `noHorizontalOverflow` or `ok: true` is necessary but not enough for Settings, Chat, Pet, and bubble UI.
- Keep PR-local evidence and main current-head evidence separate in docs. PR evidence is review evidence; release wording needs merged-head proof.

## 2026-05-25 Regression: Native Shape, Drag Growth, Slow Harness

This round exposed a second QA miss: the tests verified that the pet could receive input, but not that the native masking strategy preserved visual quality and window geometry.

What happened:

- We treated Electron `BrowserWindow.setShape(rects)` as if it were an input-only mask.
- On Windows it also clips the visible transparent window region, so fine alpha scanline rects created jagged Live2D edges and desynced from animated motion.
- The shape path also interacted badly with Windows DPI/bounds rounding. Dragging the pet could grow the window by 1px or more even when model scale stayed unchanged.
- The harness originally compared some bounds against config defaults instead of before/after actual bounds, which hid where the drift entered.
- Playwright input becomes brittle when `setIgnoreMouseEvents(..., { forward: true })` is active; repeated stress drag and physical wheel events made the harness slow and flaky.

Why the black-box test missed it:

- The task checked "does it render and accept input" instead of "does the animated model remain visually uncut while input hit-testing works."
- It did not inspect edges during model motion.
- It did not assert repeated drag preserves native window width/height.
- It did not distinguish three separate layers: visual transparency, renderer alpha hit-test, and OS-level input forwarding.
- It assumed one technical solution, native shape, was the product behavior instead of treating it as an implementation candidate.

How we avoid repeating it:

- Default V1 path: renderer samples final alpha for model hit-test; Electron main uses dynamic `setIgnoreMouseEvents` for pass-through. Native `setShape` is off unless `GREYFIELD_ENABLE_NATIVE_SHAPE=1`.
- Never send fine alpha scanline masks to a visible Windows pet window as the default path.
- Any drag fix must assert both model scale and native window width/height stay stable.
- Any pass-through fix must include visual QA: animated Live2D edges must not be clipped, jagged, or offset from the model.
- Keep a fast pet-only harness for iteration and a fuller Electron harness for checkpoint validation.
- Do not use all-process scans to manage dev servers; use the Greyfield PID file and `pnpm dev:live2d:stop`.

Current command split:

- Fast visual/dev loop: `pnpm dev:live2d:fast`
- Stop visible dev pet: `pnpm dev:live2d:stop`
- Fast pet regression: `pnpm harness:pet:quick`
- Checkpoint desktop shell regression: `pnpm harness:electron`

## 2026-05-26 Regression: Main Bundle Load Failure And Session Race

Phase E exposed two desktop runtime QA misses:

- Adding the YAML persona loader pulled a CommonJS dependency into the Electron main ESM bundle. The app failed before creating any `BrowserWindow` with `Dynamic require of "process" is not supported`.
- The full Electron harness checked JSONL session persistence immediately after the renderer displayed the assistant final text. Core runtime emits `assistant.text.final` before appending the assistant turn, so the check raced and sometimes saw only the user line.

How we avoid repeating it:

- When Electron waits for the first window, inspect main-process stdout/stderr or run the built main bundle directly before changing Playwright waits.
- Main-process ESM bundles that include CommonJS dependencies must provide a `createRequire(import.meta.url)` shim, or the dependency must be proven ESM-safe.
- Harness checks for async persistence must poll the persisted condition, not read once after a UI event that can precede disk writes.
- `GFN-V1-015` acceptance must include both full Electron session write proof and a restart harness proving the next launch prompt sees the previous turn.
