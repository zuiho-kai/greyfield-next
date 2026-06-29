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

## Issue And Slice Gate

Roadmap and phase issues are coordination indexes. They are not ready-to-code scopes.

Before assigning implementation work or opening a feature PR:

1. Split the next user-visible function point into an atomic issue.
2. Confirm the issue is small enough for one PR and one owner worktree.
3. Write the issue so another agent can finish it without chat context.
4. Name explicit non-goals so adjacent work does not leak in.
5. Name the acceptance evidence: unit test, benchmark, harness, screenshot, or current-head doc proof.

An atomic implementation issue must include:

- the user-visible result;
- the owned modules or file set;
- required data and API boundaries;
- non-goals and follow-up issue links;
- the exact verification gate;
- the close condition.

A feature PR must link an atomic implementation issue. A roadmap issue may be linked for context, but it cannot be the only linked issue unless the PR only updates planning or documentation.

If a PR starts touching multiple atomic issues, split it before review unless it is explicitly an integration PR. Integration PRs must name the cross-path scenario matrix they prove.

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
- A sub-agent prompt must name the assigned issue, worktree, branch, owned files/modules, non-goals, and verification commands before coding starts.
- For feature implementation after an approved product/issue split, the coordinating agent's start sequence is: confirm issue -> create or select worktree/branch -> spawn the implementation sub-agent -> only then wait/review/merge. The coordinator must not begin business-code edits in the assigned worktree while the sub-agent has not been spawned.
- Worktree creation is not proof that delegation happened. If the user asks why no sub-agent was opened, the answer should be treated as a process miss and landed in these rules or the retro before continuing implementation.
- Before a sub-agent hands off or reports a blocker, the coordinator should not inspect that worker's business diff for early review. Readiness review starts after handoff. If the coordinator has budget while a worker runs, use it on non-overlapping issue delegation, PR/issue coordination, or documentation/rule work.
- Do not let two agents edit the same file set unless a coordinating agent explicitly assigns the split.
- Adjacent atomic issues may still run in parallel even when both could touch `packages/dev-harness` or nearby runtime files. Record the expected collision risk in each prompt, keep branches separate, and resolve conflicts by PR review/rebase after the first provider PR lands. Do not serialize the whole roadmap just because conflicts are possible.
- After spawning workers, the coordinator must not end with a final response that leaves worker completion unattended. Stay in an active wait loop, continue non-overlapping coordination, or create an explicit follow-up wakeup/check. Treat passive `subagent_notification` delivery as status data, not as a reliable main-agent trigger.
- Each agent must read `AGENTS.md` and relevant guardrail docs inside its own worktree before editing.
- Agents must report changed files, verification commands, and unresolved risks before handoff.
- A coordinating agent merges results by PR review, not by copying unreviewed files between worktrees.
- Split parallel work by disjoint write sets first, dependency order second. If one PR creates an interface and another consumes it, merge or rebase the provider PR before approving the consumer.
- When a sibling PR merges while another PR is open, the coordinating agent must rebase the open PR and rerun its targeted verification before marking it ready.
- Do not preserve merge-conflict docs or unrelated edits just because a subagent saw them. If a branch picked up stale roadmap/docs conflicts, drop or recreate that branch around its assigned code slice.
- In each fresh worktree, run `pnpm install`, `pnpm typecheck`, and `pnpm` test/harness commands serially. Parallel agents may run in separate worktrees, but a single worktree must not run two `pnpm` commands concurrently.
- Remote CI waiting should not occupy the main implementation loop. Use a low-frequency watcher or check once at merge readiness while the coordinator continues non-overlapping local work.
- If a sub-agent returns no usable result, hits a limit, or abandons the task, close or explicitly retire it before assigning another agent to the same worktree. Do not keep two live agents on the same worktree.
- Do not close an implementation sub-agent just because it reached a final response, hit a budget ceiling, or says the implementation is ready. The worker still owns that issue/worktree through coordinator review, requested rework, PR feedback, and merge readiness. Prefer `resume` or follow-up input to the same worker when budget returns or review finds defects. Close the worker only after the PR is merged, the PR/worktree is abandoned, or the coordinator records that this worker is retired and no longer owns the worktree.

## Pull Request Rules

- New feature work should end as a pull request to the repository, not an untracked local patch.
- Once an implementation sub-agent hands off a validated branch and coordinator review finds no blocker, open the PR immediately instead of leaving the branch local-only. If workers are expected to open PRs themselves, the assignment prompt must say so explicitly and must require a Chinese PR body plus exact verification results.
- Do not push directly to `main`.
- Keep PRs small enough to review: one atomic feature point, one checkpoint phase with explicit scenario acceptance, or one bug class per PR.
- PR description must include purpose, changed packages, linked V1 feature IDs if any, and exact verification commands/results.
- Before opening a PR, run the relevant fast or checkpoint verification loop and include failures honestly.
- If the PR changes V1 acceptance, update `packages/dev-harness/v1-features.json` in the same branch.
- If the PR fixes a real missed behavior, update the nearest retro/QA doc in the same branch.
- If bot or human review finds that the PR combines unrelated capability, UI, privacy, and architecture work, split the PR instead of continuing review churn.

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
