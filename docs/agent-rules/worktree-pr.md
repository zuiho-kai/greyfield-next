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
- Do not let two agents edit the same file set unless a coordinating agent explicitly assigns the split.
- Each agent must read `AGENTS.md` and relevant guardrail docs inside its own worktree before editing.
- Agents must report changed files, verification commands, and unresolved risks before handoff.
- A coordinating agent merges results by PR review, not by copying unreviewed files between worktrees.
- Split parallel work by disjoint write sets first, dependency order second. If one PR creates an interface and another consumes it, merge or rebase the provider PR before approving the consumer.
- When a sibling PR merges while another PR is open, the coordinating agent must rebase the open PR and rerun its targeted verification before marking it ready.
- Do not preserve merge-conflict docs or unrelated edits just because a subagent saw them. If a branch picked up stale roadmap/docs conflicts, drop or recreate that branch around its assigned code slice.
- In each fresh worktree, run `pnpm install`, `pnpm typecheck`, and `pnpm` test/harness commands serially. Parallel agents may run in separate worktrees, but a single worktree must not run two `pnpm` commands concurrently.
- Remote CI waiting should not occupy the main implementation loop. Use a low-frequency watcher or check once at merge readiness while the coordinator continues non-overlapping local work.
- If a sub-agent returns no usable result, hits a limit, or abandons the task, close or explicitly retire it before assigning another agent to the same worktree. Do not keep two live agents on the same worktree.

## Pull Request Rules

- New feature work should end as a pull request to the repository, not an untracked local patch.
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
