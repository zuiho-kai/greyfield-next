# V1 Completion Evidence Checklist

This checklist is the pre-release evidence map for Greyfield Next V1. It is not a completion claim by itself. A path is only claimable when the referenced test, harness, screenshot, or manual step exists on the branch being released.

Last updated: 2026-06-23.

## Evidence Rules

- `packages/dev-harness/v1-features.json` remains the source of truth for feature acceptance.
- PR-local evidence counts for review of that PR, but V1 release evidence only counts after the PR is merged or the command is rerun on the release branch.
- Screenshot artifacts are review evidence, not a replacement for executable harnesses.
- Do not mark voice, TTS playback, or Stop-audio behavior release-complete until #29 and #30 are merged and rerun on the release branch. Draft PR evidence is review evidence only.
- Draft integration PR [#41](https://github.com/zuiho-kai/greyfield-next/pull/41) combines #35, #36, #37, #38, #39, and #40. Its evidence is stronger than isolated PR evidence because it proves the branches can coexist, but it is still not release evidence until merged or rerun on the release branch.
- Old PR [#32](https://github.com/zuiho-kai/greyfield-next/pull/32) is closed as superseded by #38 and #41.

## Current Integration Evidence

Draft PR [#41](https://github.com/zuiho-kai/greyfield-next/pull/41) is the current V1 integration/audit branch. It is mergeable and its GitHub checks passed:

- Fast checks: success.
- Desktop pet quick harness: success.
- CodeRabbit: success (review skipped because the PR is draft).
- GitGuardian Security Checks: success.
- Full checkpoint harness: skipped by workflow conditions.

Local #41 integration verification has been run on `codex/v1-integration-audit`:

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

After aligning the V1 manifest and planning docs on #41 head `280f520`, these checks were rerun:

- `pnpm test` -> 47 files / 162 tests passed
- `pnpm harness:acceptance`
- `git diff --check`

The #41 integration run found one cross-branch regression: #27 made Stop availability follow only text generation state, while #29/#30 can leave voice output queued after text has already completed. #41 fixes this by keeping Stop enabled while enabled voice output is still queued or mouth-open state is active. The evidence is:

- `pnpm harness:electron:stop-audio` -> `speechCanceled: true`, `audioQueueCleared: true`, `mouthOpenReset: true`.
- Latest `pnpm harness:electron:stop-audio` also proves `playbackFinishClearedQueue: true`, so natural speech completion clears queued speech UI before the Stop path is exercised.
- `pnpm harness:electron` -> `voiceQueueKeepsStopEnabled: true`.

Visual review artifacts from `pnpm harness:v1-visual` were inspected from `.cache/greyfield-v1-visual-acceptance/latest/`:

- `pet-initial.png`: transparent, unframed pet shell with no control panel.
- `pet-after-chat.png`: readable short speech bubble; not a full chat transcript.
- `chat-after-reply.png`: Chat retains the complete assistant reply.
- `settings-provider-preview.png`: Settings shows product-facing fake provider Preview state.

`pnpm harness:electron:real-llm` was not rerun for #41 because `GREYFIELD_REAL_LLM_BASE_URL`, `GREYFIELD_REAL_LLM_API_KEY`, and `GREYFIELD_REAL_LLM_MODEL` are not present in the current environment. Real-provider evidence therefore remains an explicit release-branch rerun requirement when credentials are available.

## User Paths

| User path | Current evidence | Claim status |
| --- | --- | --- |
| Open app and see a transparent desktop pet, not a webpage | `pnpm harness:v1-visual`; `pnpm harness:electron`; `pnpm harness:pet:quick`; screenshots in `.cache/greyfield-v1-visual-acceptance/latest/` | Claimable after rerun on release branch |
| Interact with the pet model pixels while transparent areas pass through | `pnpm harness:pet:quick`; `pnpm harness:electron`; unit tests `pet-interaction`, `desktop-runtime-bridge` | Claimable after rerun on release branch |
| Drag pet window without resizing or changing model scale | `pnpm harness:pet:quick`; `pnpm harness:electron`; unit tests `pet-interaction`, `pet-window-controller` | Claimable after rerun on release branch |
| Wheel-scale only on model pixels and within bounds | `pnpm harness:pet:quick`; unit tests `pet-interaction` | Claimable after rerun on release branch |
| Load a real Live2D `.model3.json` without counting fallback as acceptance | `pnpm harness:live2d`; unit tests `model-manifest`, `model3-parser`, `live2d-deps` | Claimable after rerun on release branch |
| Send a text message and receive streamed/final Chat output | `pnpm harness:electron`; `pnpm harness:acceptance`; `pnpm harness:electron:real-llm` when real provider env is supplied | Claimable for fake path on release branch; real provider requires env rerun |
| Stop a running text reply | Main evidence: `pnpm harness:electron:provider-abort`. #41 includes #27 proof that Stop is clickable during streaming, shows Stopped, aborts the provider request, and does not append the old partial reply. | Candidate evidence exists on #41; release-claimable only after merge or rerun on release branch |
| Understand Chat state and retry after provider failure | Main evidence: `pnpm harness:electron:provider-failure`. #41 includes #27 Waiting / Generating / Stopped / Failed / Retry-ready UI and retry-button proof. | Candidate evidence exists on #41; release-claimable only after merge or rerun on release branch |
| Configure provider and understand whether Test LLM can run | Main evidence: `settings-provider-status` tests, `pnpm harness:electron:settings-provider-test`, and `pnpm harness:electron:settings-active-chat-test`. #41 includes fake Preview, missing Base URL, missing API key, missing model, testing, success, and failure states. | Candidate evidence exists on #41; release-claimable only after merge or rerun on release branch |
| Reject Test LLM during active chat without sending another provider request | `pnpm harness:electron:settings-active-chat-test`; #41 keeps this aligned with provider UI | Candidate evidence exists on #41; release-claimable only after merge or rerun on release branch |
| Keep recent context across restart | `pnpm harness:electron:restart-context`; unit tests `runtime-service`, `jsonl-session-store`, `prompt-assembler` | Claimable after rerun on release branch |
| Show short assistant text in pet bubble while full history stays in Chat | `pnpm harness:electron:bubble-long-reply`; `pnpm harness:v1-visual` screenshots | Claimable after rerun on release branch |
| Keep bubble inside right edge and remove bubble hit area when disabled | #41 includes #26 `pnpm harness:electron:bubble-edge-clickthrough` and screenshots under `.cache/greyfield-bubble-edge-clickthrough/latest/`; latest output also proves `passThroughBubbleToggleKeptStoredShapeFresh: true` when the bubble is disabled during Model Pass Through. | Candidate evidence exists on #41; release-claimable only after merge or rerun on release branch |
| Enable real assistant speech output without sudden default audio | #41 includes #29 Settings `Speak replies`, renderer Web Speech playback, default-quiet behavior, TTS failure isolation, long-reply speech budget, natural playback queue cleanup, and Electron proof that `savedVoiceSpeech: true`. | Candidate evidence exists on #41; release-claimable only after merge or rerun on release branch |
| Stop active speech playback, queued speech UI, and mouth-open state | #41 includes `pnpm harness:electron:stop-audio`, keeps `pnpm harness:electron:provider-abort` passing, proves `playbackFinishClearedQueue`, `speechCanceled`, `audioQueueCleared`, and `mouthOpenReset`, and adds the integration fix proving Stop remains enabled while enabled voice output is still queued after text completion. | Candidate evidence exists on #41; release-claimable only after merge or rerun on release branch |

## Current Non-Claimable Paths

- Real TTS playback has combined proof in #41, but it is not release-claimable until merged and rerun on the release branch.
- Stop-audio behavior has combined proof in #41, but it is not release-claimable until the combined behavior is merged and rerun on the release branch.
- Real OpenAI-compatible provider evidence is not current on #41 because the required `GREYFIELD_REAL_LLM_*` env vars were unavailable. The fake provider path, provider failure path, Test LLM product states, and provider abort path are covered; real-provider chat still needs an env-backed rerun before any release claim.
- ASR and microphone conversation are not V1-complete.
- #26, #27, #28, #29, #30, and #31 evidence is currently integrated in draft PR #41, with narrower draft PRs #35, #36, #37, #38, #39, and #40 as historical slices. The combined evidence must be merged or rerun on the final release branch before V1 can be called complete.
- A final V1 release claim still needs one current-head checkpoint run covering `pnpm typecheck`, `pnpm test`, `pnpm harness:acceptance`, `pnpm harness:live2d`, `pnpm harness:pet:quick`, `pnpm harness:electron`, and the feature-specific harnesses listed above.

## Release Audit Steps

1. Confirm all intended V1 PRs are merged.
2. Rerun the feature-specific harnesses from this checklist on the release branch.
3. Open the latest screenshot directories and visually inspect pet, chat, settings, and bubble artifacts.
4. Update this checklist only with evidence that exists on the release branch.
5. Only then update `docs/progress.md` or `docs/plans/v1-product-plan.md` to claim V1 completion.
