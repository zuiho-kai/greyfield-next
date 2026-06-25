# V1 Completion Evidence Checklist

This checklist is the pre-release evidence map for Greyfield Next V1. It is not a completion claim by itself. A path is only claimable when the referenced test, harness, screenshot, or manual step exists on the branch being released.

Last updated: 2026-06-25.

## Evidence Rules

- `packages/dev-harness/v1-features.json` remains the source of truth for feature acceptance.
- PR-local evidence counts for review of that PR, but V1 release evidence only counts after the PR is merged and the affected path has current-head evidence.
- Screenshot artifacts are review evidence, not a replacement for executable harnesses.
- Integration PR [#41](https://github.com/zuiho-kai/greyfield-next/pull/41) combined #35, #36, #37, #38, #39, and #40 and is now merged into `main`.
- PRs [#42](https://github.com/zuiho-kai/greyfield-next/pull/42), [#43](https://github.com/zuiho-kai/greyfield-next/pull/43), [#44](https://github.com/zuiho-kai/greyfield-next/pull/44), [#45](https://github.com/zuiho-kai/greyfield-next/pull/45), and [#46](https://github.com/zuiho-kai/greyfield-next/pull/46) are also merged into `main`.
- Old PR [#32](https://github.com/zuiho-kai/greyfield-next/pull/32) is closed as superseded by #38 and #41.

## Current Main Evidence

The latest V1 acceptance code evidence head `c53b70916ef67543ff80387a2e9af1edaeb26ec3` includes #41, #42, #43, #44, #45, and #46. GitHub Actions run `28072461072` passed on that head:

- Fast checks: success.
- Desktop pet quick harness: success.
- `frontend-full`: success in 2m 41s.

PR #46 closed the #45 post-merge main failure from run `28018394412`. The diagnosis found a Stop audio harness synchronization race: the script waited for the Settings audio queue to show two items, but did not first prove the Pet window speech probe had received both utterances before simulating natural playback completion. #46 also stabilized provider timeout request counting and the full Electron drag check. Local #46 evidence before merge:

- `pnpm install --frozen-lockfile`
- `pnpm harness:electron:stop-audio` -> `playbackFinishClearedQueue: true`, `speechCanceled: true`, `audioQueueCleared: true`, `mouthOpenReset: true`.
- `pnpm typecheck`
- `pnpm harness:electron`
- `pnpm exec tsx packages/dev-harness/src/electron-provider-failure-check.ts`
- `pnpm harness:frontend-full` -> 14 checks passed in 2m 11s, including V1 visual acceptance with Settings `noHorizontalOverflow: true`, full Electron drag/lifecycle coverage, provider failure/abort coverage, Stop audio, and restart context.

The `frontend-full` profile runs the frontend-visible V1 guard:

- `pnpm test:frontend`
- Playwright Chromium install
- `pnpm build:desktop`
- real Live2D browser harness
- `pnpm harness:v1-visual`
- full Electron Settings/Chat/Pet harness
- speech bubble long reply
- speech bubble edge click-through
- Settings provider test
- Settings active-chat Test LLM rejection
- Chat provider failure
- Chat provider abort
- Stop audio
- Real OpenAI-compatible TTS Electron harness when `GREYFIELD_REAL_TTS_*` or compatible `GREYFIELD_REAL_LLM_*` env vars are supplied
- restart context

Current local voice-output closeout evidence on the working tree adds a real TTS desktop playback guard:

- `pnpm harness:real-tts` with SiliconFlow-compatible env -> returned playable MP3 bytes (`headerHex: "4944330300000000"`).
- `pnpm harness:electron:real-tts` -> `settingsVoiceTestWorked: true`, `audioElementPlayed: true`, `playbackFinishClearedQueue: true`, `stopCanceledAudioElement: true`, `audioQueueCleared: true`, `mouthOpenReset: true`.
- `pnpm harness:frontend-full` with real TTS env -> 15 checks passed in 2m 34s, including the new real OpenAI-compatible TTS Electron harness.

Historical local #41 integration verification was run on `codex/v1-integration-audit` before merge and remains useful as the integration audit trail:

- `pnpm install --frozen-lockfile`
- `pnpm typecheck`
- `pnpm test` -> 47 files / 162 tests passed
- `pnpm test:backend` -> 22 files / 70 tests passed
- `pnpm test:frontend` -> 25 files / 92 tests passed
- `pnpm harness:acceptance`
- `pnpm harness:live2d`
- `pnpm harness:v1-visual`
- `pnpm harness:pet:quick`
- `pnpm harness:electron:provider-failure`
- `pnpm harness:electron:restart-context`
- `pnpm harness:electron:bubble-long-reply`
- `pnpm harness:electron:settings-provider-test`
- `pnpm harness:electron:settings-active-chat-test`
- `pnpm harness:electron:provider-abort`
- `pnpm harness:electron:stop-audio`
- `pnpm harness:electron:bubble-edge-clickthrough`
- `pnpm harness:electron`
- `git diff --check`

After aligning the V1 manifest and planning docs on #41 head `280f520`, these checks were rerun before merge:

- `pnpm test` -> 47 files / 162 tests passed
- `pnpm harness:acceptance`
- `git diff --check`

The #41 integration run found one cross-branch regression: #27 made Stop availability follow only text generation state, while #29/#30 can leave voice output queued after text has already completed. The merged fix keeps Stop enabled while enabled voice output is still queued or mouth-open state is active. The evidence is:

- `pnpm harness:electron:stop-audio` -> `speechCanceled: true`, `audioQueueCleared: true`, `mouthOpenReset: true`.
- Latest `pnpm harness:electron:stop-audio` also proves `playbackFinishClearedQueue: true`, so natural speech completion clears queued speech UI before the Stop path is exercised.
- `pnpm harness:electron` -> `voiceQueueKeepsStopEnabled: true`.

Visual review artifacts from `pnpm harness:v1-visual` were inspected from `.cache/greyfield-v1-visual-acceptance/latest/`:

- `pet-initial.png`: transparent, unframed pet shell with no control panel.
- `pet-after-chat.png`: readable short speech bubble; not a full chat transcript.
- `chat-after-reply.png`: Chat retains the complete assistant reply.
- `settings-provider-preview.png`: Settings shows product-facing fake provider Preview state.

`pnpm harness:electron:real-llm` has not been rerun with current `GREYFIELD_REAL_LLM_BASE_URL`, `GREYFIELD_REAL_LLM_API_KEY`, and `GREYFIELD_REAL_LLM_MODEL` values in this environment. Real-provider evidence therefore remains an explicit credentialed release-check requirement when credentials are available.

## User Paths

| User path | Current evidence | Claim status |
| --- | --- | --- |
| Open app and see a transparent desktop pet, not a webpage | `pnpm harness:v1-visual`; `pnpm harness:electron`; `pnpm harness:pet:quick`; screenshots in `.cache/greyfield-v1-visual-acceptance/latest/`; main `frontend-full` on `c53b709` | Current on main through #46 |
| Interact with the pet model pixels while transparent areas pass through | `pnpm harness:pet:quick`; `pnpm harness:electron`; unit tests `pet-interaction`, `desktop-runtime-bridge`; main `frontend-full` on `c53b709` | Current on main through #46 |
| Drag pet window without resizing or changing model scale | `pnpm harness:pet:quick`; `pnpm harness:electron`; unit tests `pet-interaction`, `pet-window-controller`; #42 drag guard; #46 drag-state harness sync; main `frontend-full` on `c53b709` | Current on main through #46 |
| Wheel-scale only on model pixels and within bounds | `pnpm harness:pet:quick`; unit tests `pet-interaction`; main `frontend-full` on `c53b709` | Current on main through #46 |
| Load a real Live2D `.model3.json` without counting fallback as acceptance | `pnpm harness:live2d`; unit tests `model-manifest`, `model3-parser`, `live2d-deps`; main `frontend-full` on `c53b709` | Current on main through #46 |
| Send a text message and receive streamed/final Chat output | `pnpm harness:electron`; `pnpm harness:acceptance`; main `frontend-full` on `c53b709`; `pnpm harness:electron:real-llm` when real provider env is supplied | Fake/failure/abort paths current on main; real provider requires env rerun |
| Stop a running text reply | Main evidence: `pnpm harness:electron:provider-abort`; merged #41 proof that Stop is clickable during streaming, shows Stopped, aborts the provider request, and does not append the old partial reply; main `frontend-full` on `c53b709` | Current on main through #46 |
| Understand Chat state and retry after provider failure | Main evidence: `pnpm harness:electron:provider-failure`; merged #41 Waiting / Generating / Stopped / Failed / Retry-ready UI and retry-button proof; #46 timeout harness stability; main `frontend-full` on `c53b709` | Current on main through #46 |
| Configure provider and understand whether Test LLM can run | Main evidence: `settings-provider-status` tests, `pnpm harness:electron:settings-provider-test`, and `pnpm harness:electron:settings-active-chat-test`; #43 API-key input fix; #45 Settings UI/lifecycle closeout; main `frontend-full` on `c53b709` | Current on main through #46 |
| Reject Test LLM during active chat without sending another provider request | `pnpm harness:electron:settings-active-chat-test`; merged #41 alignment with provider UI; main `frontend-full` on `c53b709` | Current on main through #46 |
| Keep recent context across restart | `pnpm harness:electron:restart-context`; unit tests `runtime-service`, `jsonl-session-store`, `prompt-assembler`; main `frontend-full` on `c53b709` | Current on main through #46 |
| Show short assistant text in pet bubble while full history stays in Chat | `pnpm harness:electron:bubble-long-reply`; `pnpm harness:v1-visual` screenshots; main `frontend-full` on `c53b709` | Current on main through #46 |
| Keep bubble inside right edge and remove bubble hit area when disabled | Merged #41 includes #26 `pnpm harness:electron:bubble-edge-clickthrough` and screenshots under `.cache/greyfield-bubble-edge-clickthrough/latest/`; latest output also proves `passThroughBubbleToggleKeptStoredShapeFresh: true` when the bubble is disabled during Model Pass Through; main `frontend-full` on `c53b709` | Current on main through #46 |
| Enable real assistant speech output without sudden default audio | Merged #41 includes #29 Settings `Speak replies`, renderer Web Speech playback, default-quiet behavior, TTS failure isolation, long-reply speech budget, natural playback queue cleanup, and Electron proof that `savedVoiceSpeech: true`; current local closeout adds Settings `Test Voice`, `pnpm harness:real-tts`, and `pnpm harness:electron:real-tts` proof that real OpenAI-compatible `/audio/speech` MP3 bytes enter renderer audio playback; main `frontend-full` on `c53b709` remains the merged baseline | Current on local voice closeout; needs merge/current-head rerun before release claim |
| Stop active speech playback, queued speech UI, and mouth-open state | Merged #41 includes `pnpm harness:electron:stop-audio`, keeps `pnpm harness:electron:provider-abort` passing, proves `playbackFinishClearedQueue`, `speechCanceled`, `audioQueueCleared`, and `mouthOpenReset`, and adds the integration fix proving Stop remains enabled while enabled voice output is still queued after text completion; #46 waits for Pet speech probe synchronization; main `frontend-full` on `c53b709` | Current on main through #46 |

## Current Non-Claimable Paths

- Real OpenAI-compatible provider evidence is not current because the required `GREYFIELD_REAL_LLM_*` env vars were unavailable. The fake provider path, provider failure path, Test LLM product states, and provider abort path are covered; real-provider chat still needs an env-backed rerun before any real endpoint release claim.
- ASR and microphone conversation remain outside this TTS voice-output closeout and are not claimable from the TTS evidence above.
- Current closeout PRs that touch Settings UI, Chat UI, Pet UI, Electron main lifecycle, or harness behavior must rerun the affected current-head evidence before merge. For frontend-visible changes, `pnpm harness:frontend-full` is the preferred aggregate gate.
- A final V1 release claim still needs one current-head checkpoint record after the last closeout PR, covering `pnpm typecheck`, `pnpm test`, `pnpm harness:acceptance`, `pnpm harness:live2d`, `pnpm harness:pet:quick`, `pnpm harness:electron`, and the feature-specific harnesses listed above or `pnpm harness:frontend-full` when it covers the touched frontend surface.

## Release Audit Steps

1. Confirm all intended V1 PRs are merged.
2. Rerun the feature-specific harnesses from this checklist on the release branch.
3. Open the latest screenshot directories and visually inspect pet, chat, settings, and bubble artifacts.
4. Update this checklist only with evidence that exists on the release branch.
5. Only then update `docs/progress.md` or `docs/plans/v1-product-plan.md` to claim V1 completion.
