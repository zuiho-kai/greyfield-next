# V1 Completion Evidence Checklist

This checklist is the pre-release evidence map for Greyfield Next V1. It is not a completion claim by itself. A path is only claimable when the referenced test, harness, screenshot, or manual step exists on the branch being released.

Last updated: 2026-06-22.

## Evidence Rules

- `packages/dev-harness/v1-features.json` remains the source of truth for feature acceptance.
- PR-local evidence counts for review of that PR, but V1 release evidence only counts after the PR is merged or the command is rerun on the release branch.
- Screenshot artifacts are review evidence, not a replacement for executable harnesses.
- Do not mark voice, TTS playback, ASR, or Stop-audio behavior complete until #29 and #30 have their own executable proof.

## User Paths

| User path | Current evidence | Claim status |
| --- | --- | --- |
| Open app and see a transparent desktop pet, not a webpage | `pnpm harness:v1-visual`; `pnpm harness:electron`; `pnpm harness:pet:quick`; screenshots in `.cache/greyfield-v1-visual-acceptance/latest/` | Claimable after rerun on release branch |
| Interact with the pet model pixels while transparent areas pass through | `pnpm harness:pet:quick`; `pnpm harness:electron`; unit tests `pet-interaction`, `desktop-runtime-bridge` | Claimable after rerun on release branch |
| Drag pet window without resizing or changing model scale | `pnpm harness:pet:quick`; `pnpm harness:electron`; unit tests `pet-interaction`, `pet-window-controller` | Claimable after rerun on release branch |
| Wheel-scale only on model pixels and within bounds | `pnpm harness:pet:quick`; unit tests `pet-interaction` | Claimable after rerun on release branch |
| Load a real Live2D `.model3.json` without counting fallback as acceptance | `pnpm harness:live2d`; unit tests `model-manifest`, `model3-parser`, `live2d-deps` | Claimable after rerun on release branch |
| Send a text message and receive streamed/final Chat output | `pnpm harness:electron`; `pnpm harness:acceptance`; `pnpm harness:electron:real-llm` when real provider env is supplied | Claimable for fake path on release branch; real provider requires env rerun |
| Stop a running text reply | Main evidence: `pnpm harness:electron:provider-abort`. #27 draft PR [#36](https://github.com/zuiho-kai/greyfield-next/pull/36) adds proof that Stop is clickable during streaming, shows Stopped, aborts the provider request, and does not append the old partial reply. | Not release-claimable until #36 is merged and rerun |
| Understand Chat state and retry after provider failure | Main evidence: `pnpm harness:electron:provider-failure`. #27 draft PR [#36](https://github.com/zuiho-kai/greyfield-next/pull/36) adds Waiting / Generating / Stopped / Failed / Retry-ready UI and retry-button proof. | Not release-claimable until #36 is merged and rerun |
| Configure provider and understand whether Test LLM can run | Main evidence: `settings-provider-status` tests and `pnpm harness:electron:settings-active-chat-test`. #28 draft PR [#37](https://github.com/zuiho-kai/greyfield-next/pull/37) adds `pnpm harness:electron:settings-provider-test` for fake Preview, missing Base URL, missing API key, missing model, testing, success, and failure states. | Not release-claimable until #37 is merged and rerun |
| Reject Test LLM during active chat without sending another provider request | `pnpm harness:electron:settings-active-chat-test`; #28 draft PR #37 keeps this aligned with provider UI | Not release-claimable until #37 is merged and rerun |
| Keep recent context across restart | `pnpm harness:electron:restart-context`; unit tests `runtime-service`, `jsonl-session-store`, `prompt-assembler` | Claimable after rerun on release branch |
| Show short assistant text in pet bubble while full history stays in Chat | `pnpm harness:electron:bubble-long-reply`; `pnpm harness:v1-visual` screenshots | Claimable after rerun on release branch |
| Keep bubble inside right edge and remove bubble hit area when disabled | #26 draft PR [#35](https://github.com/zuiho-kai/greyfield-next/pull/35) adds `pnpm harness:electron:bubble-edge-clickthrough` and screenshots under `.cache/greyfield-bubble-edge-clickthrough/latest/`. | Not release-claimable until #35 is merged and rerun |

## Current Non-Claimable Paths

- Real TTS playback is not complete. #29 still needs sentence-level real TTS output and executable proof.
- Stop does not yet cover real audio playback, TTS queue, or mouth/lip-sync queue. #30 owns that proof.
- ASR and microphone conversation are not V1-complete.
- #26, #27, and #28 evidence is currently in draft PRs #35, #36, and #37. Their evidence must be merged or rerun on the final release branch before V1 can be called complete.
- A final V1 release claim still needs one current-head checkpoint run covering `pnpm typecheck`, `pnpm test`, `pnpm harness:acceptance`, `pnpm harness:live2d`, `pnpm harness:pet:quick`, `pnpm harness:electron`, and the feature-specific harnesses listed above.

## Release Audit Steps

1. Confirm all intended V1 PRs are merged.
2. Rerun the feature-specific harnesses from this checklist on the release branch.
3. Open the latest screenshot directories and visually inspect pet, chat, settings, and bubble artifacts.
4. Update this checklist only with evidence that exists on the release branch.
5. Only then update `docs/progress.md` or `docs/plans/v1-product-plan.md` to claim V1 completion.
