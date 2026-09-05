# QA Retro: Desktop Pet Interaction Miss

## 2026-09-05: Screen Research Returned Links Before Reading A Source

Real-provider QA found that successful search results were being treated as proof of successful page reading, even when every `read_webpage` request failed. The first runtime loop also accumulated tool-round preambles into the saved answer and sent them to TTS.

- Research acceptance must observe both a completed search and a successful page read, then open a retained source through the ordinary Chat link. A URL alone is not evidence that its relevant content was read.
- Keep only successfully read pages in the attached source list. For long documentation, verify that the requested error section is actually included.
- Tool-round text is temporary feedback. Reset only the current draft between rounds and keep preambles out of the final saved answer and speech queue.
- Keep stub timing, real-provider failures, and subsequent successful runs as separate evidence; a renderer failure does not become a passing desktop acceptance because a backend request worked.
- Electron `net.fetch` rejects manual redirects instead of returning their headers. Web tools use a narrow `net.request` adapter and must prove a real redirect reaches readable content; provider streaming remains on `net.fetch`.

## 2026-08-09 Regression: Dev Launcher Replaced Saved Configuration On Every Relaunch

The default Windows/dev launcher used a safe test patch as an unconditional startup write. After a user saved a real provider, API key, voice setting, character file, persona, or task-model override, the next ordinary launch replaced the complete config with only the safe `window` and `live2d` fields.

How it was fixed:

- The launcher resolves the config path once and writes `safeDevConfigPatch` only when the default file is missing or `GREYFIELD_RESET_DEV_CONFIG=1` is explicitly requested.
- Explicit `GREYFIELD_CONFIG_PATH` remains caller-owned: the launcher neither creates it nor overwrites it, including when reset is requested.
- Existing config is never read, merged, and rewritten by launcher preparation; not writing is what preserves API keys and unknown fields byte-for-byte.
- `pnpm harness:electron:config-relaunch` uses one temporary default cache/userData directory for two real Electron launches. It saves provider, voice, character, and persona state through Settings, preserves a pre-seeded planner model, and verifies that the second renderer sees saved-key presence without plaintext.

How we avoid repeating it:

- A launcher safety default is initialization data, not authoritative user state. Startup preparation must prove both first-create behavior and ordinary-relaunch non-mutation.
- Launcher tests must cover missing default config, existing default config, explicit reset, and explicit config-path ownership.
- Configuration persistence claims need a real relaunch with disk evidence; one process, DOM presence, or an in-memory settings echo is insufficient.

## 2026-07-05 Regression: Settings Memory UI Claimed The Feature Was Still Paused

Manual QA found that the latest Settings memory page still showed "In development / Memory is paused" even after Memory V2 was enabled and the legacy advanced memory block had been removed.

What happened:

- The fix removed the lower legacy "advanced details" block, but did not audit the full visible Settings memory section.
- `describeMemoryExtractionStatus()` was still hard-coded to return a disabled development state, and the template still rendered the memory toggle as disabled and unchecked.
- Local validation checked the git revision, startup logs, unit tests, typecheck, and desktop build, but did not open the ordinary Settings memory surface and inspect the user-visible copy.
- Existing tests and Electron harnesses were protecting the stale paused copy, so green checks reinforced the wrong behavior.

How we avoid repeating it:

- When a user reports stale or contradictory UI in a section, the fix must audit the whole visible section, not only the exact element mentioned.
- UI status fixes require a negative text search for the stale user-facing copy in source and relevant harnesses before handoff.
- Tests that assert old product states must be treated as suspect. Update them to protect the corrected user-visible state in the same PR.
- Startup logs and initialized backend services do not prove Settings correctness. Settings changes need an ordinary Settings path check or a targeted renderer/Electron assertion for the visible section.

## 2026-07-03 Regression: Coordinator Confused Process Signals, Task State, And Worker Ownership

During parallel Greyfield follow-up work, the coordinator made three related mistakes:

- It treated Vite/Electron process state, a generated Live2D URL, and DOM/canvas checks as enough to say the latest app was "up", while the user's actual desktop still had no visible model or controls.
- It confused two active tasks: the dev-launch/offscreen-window fix and the screen-date grounding fix, then answered about the wrong one when the user asked whether the previous task was complete.
- It first opened multiple sub-agents without a stable ownership plan, then collapsed to one worker, then restored two workers. The missing invariant was one issue -> one worker -> one worktree -> one branch -> one PR, with the coordinator owning the ledger.

Root cause:

- "Started", "patched", "validated", "PR opened", and "merged" were not treated as distinct states.
- The coordinator accepted indirect technical evidence instead of the user's visible desktop state.
- Worker ownership was treated as movable chat context instead of a task contract.

How we avoid repeating it:

- Desktop launch and recovery claims require user-visible evidence: on-screen Electron window bounds, screenshot/harness artifacts, and non-empty model pixels when Live2D visibility is claimed. Ports, PIDs, URLs, and DOM existence are diagnostics only.
- Parallel implementation must keep an explicit task ledger: issue, worktree, branch, worker, status, PR URL, and merge state. The coordinator must check live state before saying a task is done.
- Do not repurpose an active worker for another issue unless the original task is explicitly retired or abandoned. Independent issues run in independent worktrees with independent workers.
- Sub-agents do not coordinate with each other. The coordinator owns dependencies, status summaries, collision handling, review, and merge order.

## 2026-07-04 Regression: Settings Window Could Not Wheel Scroll

Manual QA found Settings could not scroll up or down even though frontend CI and visual artifacts were green.

What happened:

- The renderer entrypoint did not apply the window-role body class, so the Settings window missed `body.settings-window` CSS and inherited global `body { overflow: hidden }`.
- The Settings control surface expanded to the full content height with `overflow: visible`, leaving no bounded scroll container for ordinary mouse-wheel input.
- Existing visual harnesses checked Settings navigation, section visibility, screenshots, and horizontal overflow, but they used script-driven `scrollIntoViewIfNeeded()` for deep sections.
- That meant automation could force sections into view while the ordinary user path, hovering the Settings panel and using the mouse wheel, stayed broken.

How we avoid repeating it:

- Settings visual acceptance must assert the Settings body class is applied before trusting layout screenshots.
- Settings visual acceptance must exercise real wheel input on `.control-surface` and prove `scrollTop` moves down and back up.
- Deep-section screenshots remain useful artifacts, but they cannot replace the ordinary scroll path for Settings usability.

## 2026-07-03 Regression: Screen-Aware Date Answer Used A Stale Year

Issue #188 exposed a grounding miss in the screen-awareness text path: when the user enabled screen input and asked "今天几号？", Greyfield could still answer with a stale year even though the desktop date was visible.

What happened:

- Runtime prompt assembly described temporary visual observation boundaries, but did not include a reliable current local date.
- Vision context could corroborate visible desktop date text, but the model still had no explicit priority rule for "today" and current-year questions.
- Existing screen-awareness tests covered routing, metadata, and raw screenshot non-persistence, but not date grounding.

How we avoid repeating it:

- Runtime prompts must include current local date grounding from system time, not a fixed date literal.
- Date questions should use the current local date as the reliable source; visual date text can corroborate it, and conflicts should be stated conservatively.
- Screen-awareness regression coverage should include a user text date question with desktop visual context and assert the answer does not fall back to a stale year.

## 2026-06-29 Regression: Coordinator Started A Feature Without Spawning The Worker

After V2.1 MaiBot parity was re-split into product loops and atomic issues, the next implementation step should have opened a dedicated implementation sub-agent for the selected issue. Instead, the coordinating agent started by selecting #118, checking worktrees, fetching `origin/main`, and creating the feature worktree, but did not spawn the worker before the user interrupted.

What happened:

- The repo rule already said one implementation sub-agent targets one atomic issue and one expected PR.
- The coordinating agent treated worktree setup as if it were the start of implementation.
- The missing step was the actual worker spawn with issue, worktree, branch, owned files, non-goals, and verification gate.
- No business code was changed, but the process drift would have let the coordinator self-implement if the user had not stopped it.

Root cause:

- The rule blocked spawning a sub-agent too early, but did not explicitly block the coordinator from self-implementing after the issue/worktree gate was ready.
- The implementation start checklist did not distinguish setup from delegation.

How we avoid repeating it:

- For approved feature slices, the coordinator must spawn the assigned implementation sub-agent before touching business code.
- The required sequence is: confirm atomic issue, create/select worktree and branch, spawn worker, then review/merge.
- Worktree creation is only setup. It is not evidence that delegation happened.
- If sub-agent spawning is unavailable or blocked, stop and report the blocker instead of silently switching to self-implementation.

Follow-up clarification:

- A worker returning a final message, running out of budget, or saying "done" does not end its ownership.
- Keep the same worker attached through review and rework so budget restoration or PR feedback can resume the original context.
- Closing the worker is allowed only after merge, abandonment, or an explicit coordinator retirement decision.
- The coordinator should not pre-review a worker's business diff while that worker is still running. Wait for handoff or a blocker, and use available time on non-overlapping issue delegation or coordination instead.
- Do not use possible `dev-harness` or adjacent runtime conflicts as a reason to serialize all remaining atomic issues. Parallel branches can conflict; the coordinator should handle that with review, rebase, and explicit conflict resolution after provider PRs land.
- Do not end the coordinator turn while implementation workers are still expected to hand off unless a concrete follow-up wakeup/check is scheduled. The coordinator owns polling/review continuity; passive notifications alone are not enough to resume work.
- Do not leave a reviewed, validated worker branch as local-only. The coordinator should push/open the PR after review, or explicitly delegate PR creation authority in the worker prompt.

## 2026-06-28 Regression: Product Book Became Engineering Ledger

The V2.1 memory work made real backend progress, but the product conversation became hard to evaluate because the status was reported as issues, PRs, checks, and benchmark internals before the product experience was restated in plain language.

What happened:

- The user wanted a product book for long-term companion memory: what Greyfield should feel like, what memories it should form, and what future moments should trigger recall.
- The agent reported implementation status first: merged PRs, benchmark scores, CI state, and sub-agent flow.
- This made the work look like token burn with little visible product progress, even though some useful memory foundation had landed.
- The core missing product layer was not stated early enough: source-linked recall is improving, but proactive scene memory and low-disturbance desktop expression are still not felt by the user.

Root cause:

- The planning loop treated "can be split into work" as if it were equivalent to "product is understood."
- Benchmark evidence was allowed to lead the explanation instead of supporting a product claim.
- Sub-agent/PR mechanics took attention away from the user-facing question: "Does the pet feel like it remembers me?"

How we avoid repeating it:

- Product/version work must start with a plain-language product story before issue splitting.
- Every status update for roadmap work must separate three states: user-feelable now, backend/benchmark-only now, and not implemented.
- A benchmark score can prove regression safety, but it cannot replace the product explanation.
- If the user asks for a product book, do not answer with PR lists. Write the experience, current status, gaps, and next user-visible slice first.
- For memory specifically, use the companion-memory examples as the acceptance anchor: anniversary/rose, game-critique source drilldown, and rainy virtual-home hotpot scene recall.

## 2026-06-26 Regression: Bot Review Findings Were Not Enforced

A PR reached CI with bot-authored review findings still unresolved. Green build/test jobs were not enough because they did not encode the review thread state, so a submitted bot comment could be ignored without any machine blocker.

How we avoid repeating it:

- PR CI must fail on unresolved bot-authored inline review threads.
- Fixing the code is preferred, but a false positive still needs an explicit GitHub thread resolution so the decision is auditable.
- The gate is `scripts/check-pr-bot-review-threads.mjs`, wired into `.github/workflows/ci.yml` before the normal fast checks.
- Do not treat a stale or outdated unresolved bot thread as harmless. Resolve it after verifying the finding no longer applies.

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

## 2026-07-02 Regression: Settings Task Models Were Not Discoverable

PR #178 added task model slots under the Settings provider area, and the harness proved the section could be forced into view. A normal user still saw the old Settings navigation label `Model`, which meant Live2D appearance, while the task-model controls lived under a later `Model service` entry.

What happened:

- Acceptance checked that task model DOM existed after scrolling to the provider section.
- The first Settings view did not prove that avatar/Live2D settings and task model service settings were distinct entries.
- The screenshot artifact focused on the provider section after manual scrolling, not the user path of clicking the navigation entry.

How we avoid repeating it:

- For Settings navigation changes, assert the visible nav labels and order before checking deep section content.
- Harness screenshots should cover the ordinary click path: first-glance navigation, clicked section active state, and the resulting section heading/content.
- Avoid generic `Model` wording when the UI surface distinguishes avatar/Live2D models from LLM/task models.

## 2026-06-27 Regression: Long Reply Bubble Drifted During Streaming

The full frontend gate caught a desktop-pet polish issue that a looser visual check could have missed: during a long streaming reply, the pet bubble kept recomputing placement from live model bounds, so idle Live2D motion moved the same visible bubble by a few pixels.

What happened:

- `pnpm harness:frontend-full` failed in `pnpm harness:electron:bubble-long-reply`.
- The capped bubble text stayed correct and inside the viewport, but its `x/y` changed while the same reply was still visible.
- This made the desktop bubble feel like a web tooltip attached to animated layout measurements instead of a stable subtitle for the current utterance.

How it was fixed:

- The pet renderer now locks the bubble placement when a visible bubble first appears.
- The lock is released when the bubble is cleared after its fade lifecycle.
- The next bubble can still use fresh model/window bounds, so edge avoidance remains dynamic between utterances.

How we avoid repeating it:

- For desktop speech bubbles, "stable" means the same visible utterance keeps one placement. Do not recompute `left/top` from animated model bounds during that utterance.
- Long-reply harnesses should assert both product constraints: capped text stays short, and the bubble does not drift while streaming.
- If a harness catches a visible UI behavior that looks small in pixels, first decide whether the user would perceive motion or instability before weakening the assertion.

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

## 2026-06-26 Regression: Controls Existed But The Desktop Entry Point Was Missing

This round exposed a frontend product-shape miss: voice input existed in Chat, and Settings did not have page-level horizontal overflow, but the ordinary desktop-pet path still failed the user.

What happened:

- The pet window had no visible independent input/control bar, so text input, microphone input, voice output, Settings, pass-through, hide/minimize, and Stop were discoverable only by opening other windows or menus.
- Settings Window controls used page-level overflow checks, but the local Scale/X/Y grid could still collapse when the window narrowed.
- The visual artifact focused on the Provider top section, so the broken Window controls were not part of the screenshot review.

How we avoid repeating it:

- For desktop-pet features, acceptance must include the pet-window entry point, not only the separate Chat or Settings window.
- Visual harnesses must assert local control geometry, not just document-level `scrollWidth <= innerWidth`.
- When a user reports a malformed sub-section, add a screenshot artifact for that exact sub-section before handing off.
- If controls need independent dragging, prefer a separate transparent controls window over placing a rectangular toolbar inside the pet window; otherwise pet pass-through state and control hit-testing can fight each other.

## 2026-06-26 Regression: Speech Playback Passed Stop QA But Still Overlapped

The Stop-audio harness proved cancel, queue clear, and mouth reset, but it did not prove that normal multi-sentence playback was serialized. Manual QA then found overlapping speech.

What happened:

- The renderer called `speechOutput.speak()` for every assistant audio chunk as soon as it arrived.
- The existing harness checked that Stop canceled playback, but did not track concurrent active speech count.
- A passing Stop path was treated as enough voice safety, even though natural playback without pressing Stop is a separate user path.

How it was fixed:

- Desktop speech playback now chains speech promises so the next audio chunk waits for the previous playback to finish.
- `pnpm harness:electron:stop-audio` records active speech count and reports `noOverlappingSpeech: true`.
- A renderer unit test covers serial assistant audio chunks so this does not depend only on the Electron harness.

How we avoid repeating it:

- Audio QA must include both interrupt behavior and natural playback behavior.
- A queue-related harness must assert the forbidden state directly. For speech playback, that means no concurrent active playback, not only eventual queue cleanup.
- When the user reports an issue after a green harness, add the missing assertion to the nearest harness in the same PR before calling the fix done.

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

## 2026-09-05: Live2D startup initialized two renderers

Issue #234 was exposed by ordinary Electron startup with an absolute model path: the initial bundled path began loading before settings hydration changed it. Both entries passed the completed-driver check while Cubism initialization was still pending, leaving two canvases and WebGL shader errors instead of a visible pet.

The stage now shares pending initialization, serializes model replacement, ignores superseded load results, and destroys a pending renderer after unmount. Regression acceptance under `GFN-V1-002` uses the real bundled `.model3.json` through persisted configuration and requires exactly one canvas, at least 2,000 non-transparent pixels, a visible pet window, an inspected screenshot, and no related shader errors. `pnpm exec tsx packages/dev-harness/src/electron-check.ts --live2d-init` runs this focused path after the desktop build; the unchanged Live2D harness covers animation and touch reactions.

## 2026-09-05: N.E.K.O plugin acceptance follows audible behavior

The original runtime's local HTTP health was blocked by first-run storage selection; initialize the isolated root through its official bootstrap/select API and align the child process's LOCALAPPDATA with that root. Only original `session_started` proves the upstream voice session. The native upstream emitted `user_activity` near the end of the fixture utterance, so waiting for that event alone did not stop existing sound promptly. Local onset now silences only Greyfield playback and rejects late chunks from the interrupted speech ID, while N.E.K.O retains all turn processing.

The focused plugin harness starts a second real utterance while an AudioBufferSource is actually playing, checks source.stop, a second upstream transcript/reply, mouth motion and released tracks. It also clicks the ordinary installation button against the pinned official source. Plugin navigation must open an independent first-screen content area with visible actions; scrolling under the unrelated provider form left fake-provider warnings above the real plugin state and failed product acceptance. Virtual-microphone evidence does not establish room echo performance.

Review found that Stop during asynchronous startup cleanup or port/directory preparation could be overwritten by a later startup token or followed by an untracked process launch. Capture startup intent before its first await, keep resource cleanup separate from cancellation, and recheck intent before process launch and socket connection. The cancellation test pauses cleanup and directory preparation, stops the plugin, then resumes startup and requires no launch or connection. Typed input ends an active N.E.K.O session before entering the separate text runtime so the two engines cannot concurrently overwrite the shared reply surface.

## 2026-09-05: Browser execution is not answer-quality acceptance

Issue #238 replaced search HTML scraping with real Chrome navigation, rendered text, visible-link clicks and page search. The first run found real lifecycle bugs: closing Chrome's last tab raced the next turn, redirect clicks were read before navigation completed, and long documentation needed the matched section rather than its opening. The focused Chrome harness now exercises search, clicked upstream sources, JavaScript pagination, Stop closing the turn's page, and a successful new turn.

The first review also caught search submission reading the old page: its existing `domcontentloaded` state is not evidence of a completed new search. Submission now waits for a replacement document or changed rendered content, including same-URL JavaScript search, and respects the page's busy state. `chrome-search-submit-check.ts` proves both a delayed local dynamic search and normal navigation without a model call.

The ordinary real-provider screen-help run completed in 51.9 seconds with visible Live2D, clickable sources and Stop, yet still gave unsupported dependency deletion and called nodejs.cn official. Its executable flow passed; its answer quality did not. A fixed-source request-boundary replay confirmed the research instructions were serialized intact, so further prompt additions must not be reported as a proven fix. Inspect actual advice, source attribution, preserved URLs and elapsed time separately from tool counts. The current DeepSeek configuration remains an answer-quality limitation; Chrome capability alone does not establish a reliable repair assistant. Plain URLs also need protection from speech-bubble sentence splitting, not only Markdown links.

## 2026-09-05: Native voice research needs the actual answer, not registration alone

Chat's native voice entry must handle the pending IPC gap as well as starting/connecting/ready. Disabling the button alone does not protect direct hook calls from falling into legacy recording. Verify repeated starts and the original ready-to-stop path at the default chat width; inspect the header too, since stopping an old text turn can otherwise leave a misleading "stopped" label during an active voice connection.

Issue #240 proved the pinned original N.E.K.O runtime can call a Greyfield localhost tool and receive its result on the same native voice connection. A tool-only response emits `turn end` with no audio before executing its callback; that event is not a completed user answer. The first multi-call attempt spent about 31 seconds per native tool decision and hit the original 90-second silence limit. One `research_web` callback now lets the utility model navigate Chrome while N.E.K.O remains the voice owner. The callback returns observed text even if the browsing model ends without a summary; cancellation or timeout still discards the result.

Long spoken English URLs were misrecognized by native ASR. Keep those failed artifacts, and exercise ordinary Chinese research requests as well. A weather flow that found a monthly forecast and spoke a sourced answer proved the plumbing but did not answer today's weather. Requested date, target page, source text, spoken answer, and visible chat links require separate inspection. Open chat through Settings before screenshots: a hidden window can retain an old rendered frame despite receiving all events. Native transcription should immediately show processing, then actual research progress, rather than appearing idle through the native model's tool decision.

The focused 27B utility run searched and read the official current local forecast (2026-09-05 12:45), then the original voice returned its correct afternoon/tonight/next-day details with a visible source link and non-empty PCM. First audio still took 80.44 seconds from input onset, including the native model's roughly 31-second tool decision. This is a working path, not a low-latency claim. The interruption pass also exposed that `onBargeIn` was gated by active audio playback; silent browser work needs the same VAD's independent speech-onset notification to cancel promptly.

Owner review caught a second late-response path: rejecting old binary audio alone still allowed cancelled `gemini_response` text and `turn end` to reach chat. Filter response JSON before broadcasting, while retaining audio headers so binary frames remain aligned. Original unscoped `turn end` follows the most recent identified response event on the ordered socket; it has no independent ID for arbitrary cross-response reordering. Consume source links with a real answer, clear them on Stop/error, and retain them through tool-only empty ends.

## 2026-09-05: Keep private conversation out of external-source tool rounds

Review #256 found private prompt history and memory remained available after a page/screen supplied untrusted material. Keep ordinary chat's contextual first response to one request; after the first tool decision, rebuild research from the current request and this turn's tool evidence. Screen interpretation receives only the current request and screenshot, and its research starts isolated. Rejoin history only for a final response with no tools. Dropping only history messages is insufficient: a contextual assistant preamble can repeat private text, so it is also excluded from the isolated round. Vision rejection, empty results and interruption must finish audio/status and release the turn controller before a new turn. Tool-call fragment arrival order is not execution order; use numeric indices.

## 2026-09-05: Review advice must match the native turn protocol

Issue #257 initially accepted a review suggestion to make every empty `turn end` idle and clear its sources. Owner review caught the conflict with the earlier native evidence. In `combined-neko-weather-barge/acceptance.json`, the empty end arrived at 57.393 seconds, before research started at 57.401 seconds; sources arrived at 83.291 seconds, followed by the answer and final end at 90.146/90.151 seconds. The tool-only and final events both have `request_id: null`, and even the research-running flag arrives too late to classify the earlier end. That event alone cannot establish completion.

The unconditional cleanup suggestion was withdrawn. Replay the observed event order, retain pending state and sources across empty tool ends, consume sources with a real answer, and clear them on a new user transcript or Stop/error/interrupt. A synthetic test that assumes an empty end is terminal is not evidence of the original protocol. The real source-lifecycle repair is cleanup at the new user-turn boundary; this review follow-up uses focused tests without claiming a new live upstream speech run.

## 2026-09-05: A saved voice note needs a visible file location and an actual Notepad window

Issue #261's first native voice run proved the Chinese file, callback, spoken result and Stop, but no Notepad window remained for independent inspection. A second product run showed the actual Notepad title and requested Chinese content to the owner. Keep save/readback, launch request and visible application evidence distinct. Stop prevents pending work; it does not undo an already-saved note.

The second run also exposed chat's sentence splitter changing a Windows `.txt` path to `. txt` across bubbles. Preserve absolute file paths as whole text and let CSS wrap them. A UI-only replay of that real result proved the full exact path, note example and no horizontal overflow at 506 pixels; it is not a third upstream voice run. The second live harness remains failed at its receipt assertion. Save harness results before awaiting application closure so cleanup cannot erase the failure evidence.
