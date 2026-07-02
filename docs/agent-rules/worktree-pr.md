# Worktree, Branch, And PR Rules

These rules are adapted from the worktree discipline in `zuiho-kai/claude-workflow-starter`, narrowed for Greyfield Next.

## Default Rule

- New features, checkpoint phases, risky refactors, and multi-agent work must happen in a dedicated git worktree and feature branch when this project is inside a git repository.
- The primary checkout is the coordination/base workspace. Do not make business-code edits there during feature work.
- Small docs-only edits, typo fixes, or one-file diagnostic tweaks may stay in the current checkout if the user did not ask for a PR flow.

## Product Design Gate

Product and version work has an extra gate before issues, branches, or sub-agents.

Before assigning implementation work:

1. Write the user-facing story in plain language: what the user should notice, feel, or be able to do.
2. State the current felt product status: what already works in the app, what only works as backend/benchmark support, and what is still missing.
3. Name the non-goals and the user-visible boundary of the next slice.
4. Only then split atomic issues and verification gates.

Do not substitute PR lists, merged commit lists, package names, or benchmark internals for the product story. Those belong after the product status, not before it.

For desktop-pet sensing, awareness, or interaction features, the product story must name the pet mode/state first. "The user turns on screen awareness and Greyfield can naturally react to the desktop" is a product loop; "capture screenshot, preview frames, send attachment" is only an implementation path. Keep one felt loop in one issue/PR unless the user explicitly approves a split.

If a feature touches proactive behavior, the story must state all three cases before coding:

- user-initiated use;
- Greyfield-initiated use when `proactivityLevel` allows active behavior;
- disabled/off behavior.

Engineering safeguards such as sampling limits, frame caps, timeouts, duplicate filtering, or raw-data cleanup must not become visible product controls or PR scope unless the user approved those controls in product language.

For desktop screen awareness specifically, the default approved shape is one ordinary pet-control toggle: off/on. Do not introduce separate Shot, Clear, End, preview, frequency, frame-count, or manual capture controls in the small desktop panel unless the issue explicitly says those controls are part of the product. Put sampling, retention, and advanced capture policy in Settings or keep them as internal defaults.

## Issue And Slice Gate

Roadmap and phase issues are coordination indexes. They are not ready-to-code scopes.

Before assigning implementation work or opening a feature PR:

1. Split the next user-visible function point into an atomic issue.
2. Confirm the issue is small enough for one PR and one owner worktree.
3. Write the issue so another agent can finish it without chat context.
4. Name explicit non-goals so adjacent work does not leak in.
5. Name the acceptance evidence: unit test, benchmark, harness, screenshot, or current-head doc proof.

If the user's correction narrows visible controls or product shape, update the issue acceptance and harness expectations before telling a worker to continue implementation. A verbal correction in chat is not enough; the worker prompt and issue must block the old UI from reappearing.

An atomic implementation issue must include:

- the user-visible result;
- the owned modules or file set;
- required data and API boundaries;
- non-goals and follow-up issue links;
- the exact verification gate;
- the close condition.

A feature PR must link an atomic implementation issue. A roadmap issue may be linked for context, but it cannot be the only linked issue unless the PR only updates planning or documentation.

If a PR starts touching multiple atomic issues, split it before review unless it is explicitly an integration PR. Integration PRs must name the cross-path scenario matrix they prove.

Do not split a single felt desktop-pet mode into UI, runtime, proactive, memory, and privacy PRs by default. If those pieces are required for the ordinary user path to feel complete, they belong in one corrective/product PR with a clear scenario matrix.

## Before Creating A Worktree

1. Confirm the current directory is a git repo.
2. Check current status and do not overwrite unrelated local changes.
3. Fetch the base branch when network/auth is available.
4. Choose a short branch name, for example `feature/main-runtime-persistence` or `fix/pet-bubble-hit-area`.
5. Create a sibling worktree from the base branch.

```bash
git status --short --branch
git fetch origin main
git worktree add ../greyfield-next-main-runtime-persistence -b feature/main-runtime-persistence origin/main
```

## Multi-Agent Constraints

- One agent owns one worktree and one branch.
- One branch targets one cohesive user-facing goal.
- One implementation sub-agent targets one atomic issue and one expected PR.
- A sub-agent prompt must name the assigned issue, worktree, branch, owned files/modules, non-goals, verification commands, and whether the worker is authorized to push/open the PR after validation before coding starts.
- Default to delegating push/open-PR authority to implementation workers. If the coordinator wants to keep that authority, say so explicitly in the worker prompt and record who will push/open the PR after validation.
- For feature implementation after an approved product/issue split, the coordinating agent's start sequence is: confirm issue -> create or select worktree/branch -> spawn the implementation sub-agent -> only then wait/review/merge. The coordinator must not begin business-code edits in the assigned worktree while the sub-agent has not been spawned.
- Worktree creation is not proof that delegation happened. If the user asks why no sub-agent was opened, the answer should be treated as a process miss and landed in these rules or the retro before continuing implementation.
- Before a sub-agent hands off or reports a blocker, the coordinator should not inspect that worker's business diff for early review. Readiness review starts after handoff. If the coordinator has budget while a worker runs, use it on non-overlapping issue delegation, PR/issue coordination, or documentation/rule work.
- Do not let two agents edit the same file set unless a coordinating agent explicitly assigns the split.
- Adjacent atomic issues may still run in parallel even when both could touch `packages/dev-harness` or nearby runtime files. Record the expected collision risk in each prompt, keep branches separate, and resolve conflicts by PR review/rebase after the first provider PR lands. Do not serialize the whole roadmap just because conflicts are possible.
- After spawning workers, the coordinator must not end with a final response that leaves worker completion unattended. Stay in an active wait loop, continue non-overlapping coordination, or create an explicit follow-up wakeup/check. Treat passive `subagent_notification` delivery as status data, not as a reliable main-agent trigger.
- Each agent must read `AGENTS.md` and relevant guardrail docs inside its own worktree before editing.
- Agents must report changed files, verification commands, and unresolved risks before handoff.
- An implementation handoff is not complete until the worker reports all of these, unless the coordinator explicitly requested a local-only spike: changed files, verification commands, artifacts/screenshots when user-visible, commit SHA, push status, PR URL or current PR number, remote head SHA, and unresolved risks. "Code is ready locally" is a status update, not a finished handoff.
- For long-running delegated work, the worker must provide concrete progress or a blocker at least every 10-15 minutes when asked or when a validation loop stalls. A coordinator should actively check PR head, worktree status, and running processes instead of relying on sub-agent notifications as the only trigger.
- After a worker completes first-pass wiring for a frontend/runtime feature, it should run the agreed targeted tests before broadening more UI or harness work. If no validation process, PR, or concrete status appears for 10-15 minutes, the coordinator should interrupt for status rather than silently waiting.
- A coordinating agent merges results by PR review, not by copying unreviewed files between worktrees.
- Split parallel work by disjoint write sets first, dependency order second. If one PR creates an interface and another consumes it, merge or rebase the provider PR before approving the consumer.
- When a sibling PR merges while another PR is open, the coordinating agent must rebase the open PR and rerun its targeted verification before marking it ready.
- Do not preserve merge-conflict docs or unrelated edits just because a subagent saw them. If a branch picked up stale roadmap/docs conflicts, drop or recreate that branch around its assigned code slice.
- In each fresh worktree, run `pnpm install`, `pnpm typecheck`, and `pnpm` test/harness commands serially. Parallel agents may run in separate worktrees, but a single worktree must not run two `pnpm` commands concurrently.
- Remote CI waiting should not occupy the main implementation loop. Use a low-frequency watcher, timer, or check once at merge readiness while the coordinator continues non-overlapping local work or gives the user a clear pending status.
- Do not foreground-wait on CodeRabbit, GitHub CI, or other remote bot long tails after the actionable implementation and local verification are complete. If the user did not explicitly ask for a full green-to-merge watch, report the PR URL, current known checks, remaining pending check, and the next scheduled/low-frequency follow-up instead of spending the turn polling.
- When remote CI fails, fetch the smallest useful evidence: the failing check name, run/job URL, failing command, file/line, and nearby error lines. Do not paste or process full Actions setup logs unless the setup phase itself is the suspected root cause.
- Keep small-change coordination proportional. For localized docs, scripts, tests, or configuration changes, start the handoff or final summary with the exposed user-facing entry points and behavior, then list verification and risks. Do not bury the simple answer behind a full process transcript.
- During development, prefer targeted local tests and the specific Electron/frontend harness that proves the touched user path. Full frontend/desktop CI is a merge-readiness gate; do not repeatedly run or wait on full CI during implementation unless the current failure is in that gate or the targeted evidence is missing.
- For small frontend-visible UI, copy, navigation, or selector changes, the worker must search stale labels/selectors first, run targeted tests and the focused visual/Electron user-path harness, then inspect artifacts. Do not run aggregate `pnpm harness:frontend-full` by default unless the issue, coordinator, or merge decision explicitly needs it; if skipped, report why the targeted evidence is enough.
- If the aggregate frontend gate fails outside the assigned user path, the worker must stop and hand off the blocker instead of editing unrelated runtime or harness code. The handoff must include the failing command, failing check, error snippet, already-passing targeted evidence, and whether coordinator approval is needed for a separate fix.
- A worker may automatically rerun the aggregate frontend gate once after a directly related fix. A second aggregate failure requires a coordinator decision unless the prompt explicitly authorized broader harness stabilization.
- If a sub-agent returns no usable result, hits a limit, or abandons the task, close or explicitly retire it before assigning another agent to the same worktree. Do not keep two live agents on the same worktree.
- Do not close an implementation sub-agent just because it reached a final response, hit a budget ceiling, or says the implementation is ready. The worker still owns that issue/worktree through coordinator review, requested rework, PR feedback, and merge readiness. Prefer `resume` or follow-up input to the same worker when budget returns or review finds defects. Close the worker only after the PR is merged, the PR/worktree is abandoned, or the coordinator records that this worker is retired and no longer owns the worktree.

## Pull Request Rules

- New feature work should end as a pull request to the repository, not an untracked local patch.
- Implementation worker prompts should normally authorize the worker to push its assigned branch and open the PR after its local verification passes. The worker-owned PR must use a Chinese body, link the assigned issue, and include exact verification commands/results plus unresolved risks.
- Once an implementation sub-agent hands off a validated branch and coordinator review finds no blocker, the branch must already have a PR or the coordinator must open one immediately. Do not leave a branch local-only because ownership of the final push was ambiguous.
- If a worker has a local commit that is meant for review, it must push the assigned branch and report the remote head SHA before claiming the PR is updated. The coordinator should treat a mismatch between local `HEAD` and PR `headRefOid` as an incomplete handoff.
- The coordinator keeps merge authority even when push/open-PR authority is delegated. Before merge, the coordinator still checks current PR state, CI, unresolved review threads, and whether the issue closeout condition is satisfied.
- Do not push directly to `main`.
- Keep PRs small enough to review: one atomic feature point, one checkpoint phase with explicit scenario acceptance, or one bug class per PR.
- PR description must include purpose, changed packages, linked V1 feature IDs if any, and exact verification commands/results.
- Before opening a PR, run the relevant fast or checkpoint verification loop and include failures honestly.
- If the PR changes V1 acceptance, update `packages/dev-harness/v1-features.json` in the same branch.
- If the PR fixes a real missed behavior, update the nearest retro/QA doc in the same branch.
- If bot or human review finds that the PR combines unrelated capability, UI, privacy, and architecture work, split the PR instead of continuing review churn.

## Rule And Docs Change Hygiene

- Before editing agent rules, planning docs, or issue closeout docs, run `git status --short --branch` and identify whether the current branch already backs an open feature PR.
- Do not mix process-rule changes into feature branches such as Settings, Chat, memory, or screen-awareness implementation PRs unless the issue explicitly includes that docs work.
- If the current checkout has unrelated modified files or belongs to an open feature PR, create a separate docs branch/worktree from `origin/main` for the rule update.

Suggested PR body:

```markdown
## Purpose

## Changed Packages

## V1 Feature / Acceptance

## Verification

## Risks / Follow-Ups
```

## Cleanup

After a PR is merged or abandoned, remove the local worktree only after confirming no unpushed useful work remains.

```bash
git worktree list
git -C ../greyfield-next-main-runtime-persistence status --short
git worktree remove ../greyfield-next-main-runtime-persistence
```
