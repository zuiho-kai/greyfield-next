# Greyfield Next Live2D Desktop Pet Replan Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build Greyfield Next as a real desktop Live2D companion first: transparent desktop pet window, real `.model3.json` rendering, touch/motion/expression/lip-sync, text and voice interaction, persona and recent context.

**Architecture:** Keep the TS monorepo and harness, but demote the current canvas preview to a fallback renderer. The product core moves to `packages/stage-live2d` as the owner of real Pixi/Live2D rendering, while `apps/desktop` only hosts transparent windows, settings, tray, and typed IPC.

**Tech Stack:** TypeScript, pnpm workspace, Electron, Vite/Vue, PixiJS, `pixi-live2d-display` or maintained Live2D Cubism web runtime wrapper, Pinia later only if state grows, Vitest, Playwright Electron.

**Reference Priority:** DigitalMate2D defines the V1 desktop-pet UX. AIRI provides narrow technical evidence for the Live2D web/Electron route. Old Greyfield is not a UX or implementation reference; it is only a vision note and a failure retro.

---

## 0. Why The Previous Attempt Was Wrong

The last implementation drifted into an engineering harness demo. It proved Electron could open a window, settings could persist, and a canvas could animate, but it did not prove the thing you actually asked for: a Live2D desktop pet.

The main failure pattern:

- I treated "stage canvas non-empty" as equivalent to "Live2D stage works". It is not.
- I optimized testability before product identity. Tests are useful only if they protect the right thing.
- I copied the old Greyfield failure in miniature: module names existed, but the module boundary did not force the user-visible fantasy.
- I underweighted DigitalMate2D. Its value is not architecture elegance; it is the concrete model/touch/motion/voice configuration experience.
- I underweighted AIRI in the right way. Its value is not being a full app template; it is proof that Pixi 6.5.x, `pixi-live2d-display`, Cubism SDK caching, ZIP validation, lip-sync plugins, and eye tracking can work in a modern TS/Electron stage.
- I let `apps/desktop` become the visible product before `packages/stage-live2d` had a real renderer.

New rule: **A feature is not V1-complete unless a real Live2D model in the transparent Electron pet window is involved.**

---

## 1. Product Definition Reset

### V1 North Star

Greyfield Next V1 is a desktop Live2D companion that feels alive:

- Appears as a transparent always-on-top Live2D pet window.
- Loads a real `.model3.json` model from disk.
- Idles, blinks, looks toward cursor, and can play motions/expressions.
- Responds to text.
- Speaks through TTS with sentence-level playback.
- Drives mouth-open from audio volume.
- Accepts interrupt.
- Keeps persona and recent context across restart.
- Allows model path, scale, position, expressions, motions, touch areas, provider, voice, and microphone settings.

### V1 Non-Goals

These remain explicitly banned:

- desktop control
- browser control
- screen reading
- long-running task system
- multi-agent / swarm
- livestream
- VRM/Godot
- skill generation
- tool sandbox
- message-platform gateway

---

## 2. Reference Alignment

### DigitalMate2D Borrowed Product Behaviors

From `XDesktopSoft/DigitalMate2D` README, the important features for Greyfield Next are:

- direct `.model3.json` import
- custom Live2D touch areas
- custom motion and voice feedback
- emotion-to-motion/expression mapping
- per-model configuration
- local wake word and voice command path later
- parameter/part controls later
- mouse look tracking

V1 adopts the first five plus basic mouse look tracking. Parameter/part editor can wait until V1.1. UX decisions must be checked against this product behavior list, not against old Greyfield.

### AIRI Borrowed Technical Behaviors

From `moeru-ai/airi`, copy narrow Live2D implementation evidence, not the full application:

- Pixi 6.5.x and `pixi-live2d-display` are a proven route for Cubism models.
- Live2D SDK download/cache should be explicit and testable.
- ZIP/model validation belongs near the stage package.
- Lip sync and eye tracking are stage plugins, not runtime business logic.
- The stage/runtime/application boundary is useful only if it makes the Live2D pet real sooner.

### Old Greyfield Alignment

Old Greyfield's correct vision:

- desktop Live2D personality
- voice interaction
- mouth sync
- persona and memory continuity
- emotion expression mapping

Old Greyfield's wrong execution:

- browser/screen/desktop tools entered the same runtime path too early
- `voice_pipeline.py` became orchestration gravity
- Electron main mixed app shell with business features
- README completion claims outran executable acceptance

Greyfield Next keeps the vision and rejects the scope collapse. It does not borrow old Greyfield UX, settings flows, renderer code, or runtime patterns.

---

## 3. Current Code Reclassification

### Keep

- `packages/core-runtime`
- `packages/audio-runtime`
- `packages/persistence`
- `packages/dev-harness`
- Electron typed IPC and settings persistence
- Electron harness
- `model3-parser`
- `stage-config`

### Demote

- `stage-frame.ts`
- `stage-canvas.ts`

These become `fallback-preview` only. They cannot satisfy Live2D V1 acceptance.

### Replace

- Renderer's main visual stage must use real Live2D.
- Canvas preview can appear only if Live2D runtime fails or no model is configured.

---

## 4. Target Package Shape

```text
apps/desktop
  src/main
    index.ts
    electron-window-options.ts
    settings-controller.ts
  src/preload
    index.ts
  src/renderer
    App.vue
    live2d-stage-view.vue
    settings-panel.vue

packages/stage-live2d
  src
    model-manifest.ts
    model3-parser.ts
    stage-config.ts
    live2d-stage.ts
    live2d-driver.ts
    live2d-hit-test.ts
    live2d-lip-sync.ts
    fallback-stage-frame.ts

packages/core-runtime
  unchanged for now, except stage events become real

packages/audio-runtime
  vad.ts
  sentence-splitter.ts
  playback-queue.ts
  audio-level-meter.ts

packages/dev-harness
  v1-features.json
  live2d-check.ts
  electron-check.ts
```

---

## 5. Implementation Tasks

### Task 1: Rename Canvas Preview To Fallback

**Files:**
- Rename: `packages/stage-live2d/src/stage-frame.ts` -> `packages/stage-live2d/src/fallback-stage-frame.ts`
- Rename: `apps/desktop/src/renderer/stage-canvas.ts` -> `apps/desktop/src/renderer/fallback-stage-canvas.ts`
- Modify: `packages/stage-live2d/src/index.ts`
- Modify tests under `packages/stage-live2d/src/__tests__/`

**Steps:**

1. Rename files and exports.
2. Rename tests from `stage-frame` to `fallback-stage-frame`.
3. Update docs to state fallback does not count as V1 Live2D.
4. Run:

```bash
pnpm test packages/stage-live2d/src/__tests__/fallback-stage-frame.test.ts
pnpm typecheck
```

Expected: pass.

### Task 2: Install Real Live2D Rendering Dependencies

**Files:**
- Modify: `packages/stage-live2d/package.json`
- Modify: root `package.json` only if shared dev deps are needed

**Candidate dependencies:**

```bash
pnpm --filter @greyfield/stage-live2d add pixi.js pixi-live2d-display
```

If `pixi-live2d-display` is stale against current Pixi, pin compatible versions in this task and document why.

**Steps:**

1. Install dependencies.
2. Create a tiny import smoke test:

```ts
import { Application } from "pixi.js";
```

3. Run:

```bash
pnpm test packages/stage-live2d/src/__tests__/live2d-deps.test.ts
pnpm typecheck
```

Expected: imports resolve.

### Task 3: Add Real Live2D Stage Driver Interface

**Files:**
- Create: `packages/stage-live2d/src/live2d-driver.ts`
- Test: `packages/stage-live2d/src/__tests__/live2d-driver.test.ts`

**Behavior:**

`Live2DStageDriver` must expose:

```ts
loadModel(modelPath: string): Promise<void>
setExpression(expressionId: string): Promise<void>
playMotion(group: string, index?: number): Promise<void>
setMouthOpen(value: number): Promise<void>
setScale(scale: number): void
setPosition(x: number, y: number): void
destroy(): void
```

**Steps:**

1. Write tests against a fake Live2D model adapter.
2. Verify tests fail because `Live2DStageDriver` does not exist.
3. Implement driver using dependency injection, not direct global Pixi in tests.
4. Run:

```bash
pnpm test packages/stage-live2d/src/__tests__/live2d-driver.test.ts
```

Expected: pass.

### Task 4: Build Browser Live2D Stage View

**Files:**
- Create: `apps/desktop/src/renderer/live2d-stage-view.vue`
- Modify: `apps/desktop/src/renderer/App.vue`
- Modify: `apps/desktop/src/renderer/styles.css`

**Behavior:**

- A full transparent stage surface hosts the Live2D canvas.
- It loads `state.settings.modelPath`.
- It applies `modelScale`, `modelX`, `modelY`.
- It forwards pointer/touch events to stage hit-test.
- If loading fails, it displays fallback preview and emits an error log.

**Steps:**

1. Write a component test if Vue test tooling is added; otherwise put behavior into testable TS helper first.
2. Add `Live2DStageView` to `App.vue`.
3. Keep fallback preview available but visibly marked in code as fallback.
4. Run:

```bash
pnpm --filter @greyfield/desktop build
pnpm typecheck
```

Expected: pass.

### Task 5: Add A Real Bundled/Fixture Live2D Model For Tests

**Files:**
- Create or copy fixture under: `fixtures/live2d/<model>/`
- Modify: `THIRD_PARTY_NOTICES.md` or create one if missing
- Modify: `greyfield.config.json`

**Rules:**

- Do not silently bundle unlicensed models.
- Prefer a Live2D official sample only if license permits test/demo use.
- If no legal bundled model is acceptable, require user model path but keep harness fixture outside release.

**Steps:**

1. Select fixture model.
2. Add license note.
3. Set default dev config to fixture model path.
4. Run model parser test against real fixture:

```bash
pnpm test packages/stage-live2d/src/__tests__/model3-parser.test.ts
```

Expected: parser extracts expressions/motions from actual model.

### Task 6: Replace Canvas Harness With Live2D Harness

**Files:**
- Create: `packages/dev-harness/src/live2d-check.ts`
- Modify: `package.json`
- Modify: `packages/dev-harness/v1-features.json`

**Behavior:**

The harness launches desktop renderer or Electron and checks:

- a WebGL/canvas element exists
- pixel output is non-empty
- two frames differ
- the loaded model path is the configured `.model3.json`
- fallback renderer was not used

**Command:**

```bash
pnpm harness:live2d
```

Expected output:

```json
{
  "ok": true,
  "usedFallback": false,
  "nonTransparentPixels": 12345,
  "frameChanged": true
}
```

### Task 7: Touch Areas And Motion Feedback

**Files:**
- Create: `packages/stage-live2d/src/live2d-hit-test.ts`
- Modify: `packages/stage-live2d/src/stage-config.ts`
- Modify: `apps/desktop/src/renderer/live2d-stage-view.vue`

**Behavior:**

- Configured rectangular touch zones work first.
- Live2D native hit areas can be used if exposed by the model.
- Touching `head` can trigger motion/expression.
- Touch events produce runtime event `stage.touch`.

**Tests:**

```bash
pnpm test packages/stage-live2d/src/__tests__/stage-config.test.ts
pnpm harness:electron
```

Expected: touch mapping unit tests pass; Electron does not regress.

### Task 8: Motion/Expression Configuration UX

**Files:**
- Create: `apps/desktop/src/renderer/model-settings-panel.vue`
- Modify: `packages/persistence/src/config-schema.ts`
- Modify: `characters/greyfield.yaml`

**Behavior:**

- Settings shows expressions parsed from model3.
- Settings shows motion groups parsed from model3.
- User maps runtime states:
  - idle
  - thinking
  - speaking
  - interrupted
  - happy
  - touched
- User maps touch area to motion/expression.

**Tests:**

```bash
pnpm test packages/persistence/src/__tests__/config.test.ts
pnpm harness:electron
```

Expected: settings persist and reload.

### Task 9: Lip Sync From TTS Audio Level

**Files:**
- Create: `packages/audio-runtime/src/audio-level-meter.ts`
- Modify: `packages/core-runtime/src/runtime-loop.ts`
- Modify: `packages/stage-live2d/src/live2d-lip-sync.ts`

**Behavior:**

- TTS begins at sentence boundary.
- Playback queue emits audio level samples.
- Stage driver receives mouth-open updates.
- Interrupt clears playback and mouth-open within 500ms.

**Tests:**

```bash
pnpm test packages/audio-runtime/src/__tests__/audio-level-meter.test.ts
pnpm test packages/core-runtime/src/__tests__/runtime-loop.test.ts
pnpm harness:electron
```

Expected: audio level maps to mouth-open and interrupt clears it.

### Task 10: Real Voice Input Skeleton

**Files:**
- Create: `apps/desktop/src/renderer/microphone-controller.ts`
- Create: `apps/desktop/src/renderer/__tests__/microphone-controller.test.ts`
- Modify: `packages/audio-runtime/src/vad.ts`

**Behavior:**

- Browser microphone capture is behind one controller.
- VAD receives PCM frames.
- `audio.chunk` and `audio.end` events are emitted.
- Fake ASR consumes chunks in tests.

**Tests:**

```bash
pnpm test apps/desktop/src/renderer/__tests__/microphone-controller.test.ts
pnpm harness:acceptance
```

Expected: fake audio input can produce transcript and reply.

### Task 11: Persona And Recent Context In Real Desktop Path

**Files:**
- Modify: `apps/desktop/src/renderer/desktop-runtime-bridge.ts`
- Modify: `apps/desktop/src/main/index.ts`
- Modify: `packages/persistence/src/jsonl-session-store.ts`

**Behavior:**

- Electron desktop path uses persistent JSONL session store, not only in-memory session store.
- Restart reloads recent turns.
- Persona file influences prompt assembly.

**Tests:**

```bash
pnpm test packages/persistence/src/__tests__/jsonl-session-store.test.ts
pnpm harness:electron
```

Expected: Electron harness can send a first message, restart app with same temp data, and verify recent context is loaded.

### Task 12: V1 Acceptance Gate

**Files:**
- Modify: `packages/dev-harness/v1-features.json`
- Modify: `docs/progress.md`
- Modify: `README.md`

**Required commands before claiming V1:**

```bash
pnpm test
pnpm typecheck
pnpm harness:acceptance
pnpm harness:live2d
pnpm harness:electron
```

V1 is not accepted unless:

- Electron transparent pet window opens.
- Real Live2D model is visible.
- Fallback renderer is not used.
- Touch triggers a configured motion/expression.
- Text reply appears.
- TTS sentence playback starts before full text completion.
- Mouth moves during playback.
- Stop interrupts playback/mouth/text path.
- Settings model path/scale/position persist.
- Recent context survives restart.

---

## 6. Execution Order

Do not start providers or real ASR/TTS before Live2D is real.

Correct order:

1. Rename canvas to fallback.
2. Add real Live2D dependency and fixture using the AIRI-proven Pixi/Live2D route.
3. Render real Live2D in desktop window.
4. Add Live2D harness.
5. Add touch/motion/expression.
6. Add lip-sync.
7. Add voice input skeleton.
8. Add persistent context in Electron path.
9. Add real provider configuration.

---

## 7. Immediate Next Action

Start with Task 1 and Task 2 only.

Do not add new product UI until `pnpm harness:live2d` proves a real `.model3.json` model rendered in the desktop stage.
