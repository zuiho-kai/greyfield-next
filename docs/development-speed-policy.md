# Development Speed Policy

Date: 2026-05-25

This project needs two modes: fast feature iteration and slower checkpoint validation. The recent slowdown came from using checkpoint validation after too many small edits. That made the work safer, but the throughput was wrong for active development.

## Root Cause

- Full Electron harness was used too often. `pnpm harness:electron` rebuilds desktop bundles, starts Electron, and drives Playwright. It is a checkpoint tool, not a per-edit tool.
- TDD steps were too small for architecture cleanup. Red/green is still required for behavior changes, but several tiny refactors were each followed by too much global validation.
- Documentation was updated too frequently. Progress and retros should be updated at phase boundaries or after real misses, not after every small edit.
- Subagent review and long retros were used in the middle of implementation. They are valuable at phase boundaries, but they slow down feature throughput when used as the default loop.

## Default Verification Matrix

| Change Type | During Iteration | Before Claiming Done |
| --- | --- | --- |
| Pure unit logic | Targeted `vitest` for touched module | `pnpm test` |
| Type-only or package boundary change | Targeted `vitest` if behavior exists, then `pnpm typecheck` | `pnpm typecheck && pnpm test` |
| Pet drag / hit-test / wheel / pass-through | Targeted `vitest pet-interaction` plus `pnpm harness:pet:quick` | `pnpm harness:electron` |
| Live2D loader / model rendering | Targeted stage tests | `pnpm harness:live2d` |
| Settings / chat / preload / main IPC | Targeted tests plus `pnpm typecheck` | `pnpm harness:electron` |
| Core runtime / provider / interrupt | Targeted runtime/provider tests | `pnpm test && pnpm harness:acceptance` |
| CI or packaging scripts | Script-specific smoke command | Relevant checkpoint command |

## PR Review Gate

PR CI runs `scripts/check-pr-bot-review-threads.mjs` before the normal fast checks. The gate queries the current PR's GitHub review threads and fails if any unresolved inline thread contains a bot-authored comment.

This is intentionally thread-state based. A bot comment can be fixed in code or rejected as not applicable, but the PR author must resolve the thread either way so CI does not silently pass an unhandled review finding.

## PR Frontend Gate

`frontend-full` is the CI tag for the user-visible frontend acceptance gate. It runs `pnpm harness:frontend-full` on PRs that touch frontend-visible paths such as `apps/desktop`, Live2D stage rendering, audio playback, dev harnesses, package scripts, TypeScript config, or the CI workflow. Non-frontend PRs still show the `frontend-full` check, but it passes with an explicit skip message instead of running the full Electron suite.

This keeps backend-only or docs-only changes fast while making Settings, Chat, Pet interaction, Live2D rendering, speech bubble, Stop, and provider-error UI changes prove the full frontend path before merge.

For frontend-visible PRs, green CI is necessary but not sufficient. Before opening or merging the PR, the author must:

- Define the user-path acceptance before implementation, using normal UI actions rather than internal strings, test hooks, or direct IPC shortcuts.
- Run targeted tests while editing, then run `pnpm harness:frontend-full` before claiming the frontend behavior is ready.
- Inspect current visual artifacts from `.cache/greyfield-v1-visual-acceptance/latest/`, especially `pet-after-chat.png`, `chat-after-reply.png`, and `settings-provider-preview.png`.
- Check product-shape assertions that automation can miss: no stale background blocks, no text/control overflow, no permanent desktop obstruction, no pet-face/body occlusion by speech bubbles, and no mismatch between Settings state and the path an ordinary user takes.
- If the PR fixes a missed frontend behavior, add or update a harness assertion in the same branch so the next agent does not rely on the user as first-pass QA.

## Electron Harness Concurrency

Electron/browser harnesses that build desktop artifacts or launch windows share process, cache, file, and OS-window state. They are checkpoint tools, not parallel load-test tools.

- Run unit tests and static checks in parallel when useful.
- Run Electron harnesses serially unless the scripts explicitly isolate build output, ports, cache directories, and app windows.
- If a parallel Electron run fails with navigation, window, hit-test, or cache-like symptoms, rerun the failing harness serially before changing product code.
- A serial narrow rerun can classify a failure as timing/interference, but a final frontend-visible claim still requires the aggregate gate to pass afterward.
- Do not leave sessions running after a failed Electron harness; confirm the command exited before starting the next shared-window harness.

## Completion Evidence Gate

Use this gate before saying a V1 capability is done or before updating release wording:

1. Read the feature row in `packages/dev-harness/v1-features.json`.
2. Read the matching product-plan and completion-evidence sections.
3. Expand the feature into a scenario matrix, including Stop/cancel/error/retry and ordinary user paths.
4. Mark each evidence item as PR-local, main/current-head, or credentialed external-provider.
5. Rerun the relevant current-head harness after merge if the release wording depends on merged code.
6. Search docs for stale status words and old SHAs before opening a docs/evidence PR.

Partial capability work should keep the parent feature visibly incomplete until the whole matrix has current-head proof.

## Fast Loop

Use this while actively editing:

```bash
pnpm vitest run <specific-test-file>
pnpm typecheck
pnpm harness:pet:quick
```

Only run commands that prove the touched behavior. Do not run full Electron after every small refactor unless the change touches settings/chat/preload/main IPC or native pet-window behavior in a way quick harness cannot cover.

## Checkpoint Loop

Use this before claiming a milestone, after risky refactors, or before handing the build back for user verification:

```bash
pnpm typecheck
pnpm test
pnpm harness:acceptance
pnpm harness:live2d
pnpm harness:electron
```

If a full checkpoint fails after a fast loop passed, fix the harness or product issue and record the lesson only if it changes future practice.

## Documentation Policy

- Update `docs/progress.md` after a meaningful batch, not every file edit.
- Update retro docs only for repeated bugs, real product misses, or corrected assumptions.
- Update `packages/dev-harness/v1-features.json` when feature scope, acceptance, status, or QA command changes.
- Keep plan docs focused on next execution order, not a transcript of every action.

## Subagent Policy

- Use subagents for phase-end architecture review, black-box QA, and specialized audits.
- Do not open subagents as a default substitute for reading local code and running targeted tests.
- After subagent findings, implement only the smallest high-value fixes first, then return to feature delivery.

## Practical Rule

During active development, prefer one targeted test and one relevant fast harness over a full checkpoint. Run the full checkpoint when the result is ready to be trusted, shown, or used as a new baseline.
