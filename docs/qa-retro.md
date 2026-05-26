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
