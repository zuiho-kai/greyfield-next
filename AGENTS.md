# Agent Instructions

Greyfield Next is a TypeScript monorepo for a Live2D desktop companion. This file is the compact agent entrypoint: constitution, hard rules, and indexes only. Detailed rules live in linked docs.

## Constitution

- **P1 Evidence first**: Do not claim completion, root cause, or safety without a command, harness, source read, or clearly labeled inference.
- **P2 V1 spine first**: Keep V1 focused on a visible, interruptible, personable Live2D desktop pet with recent context continuity.
- **P3 Executable acceptance**: A feature is not done because prose says so. It needs a test, harness, or executable acceptance path.
- **P4 Owner boundaries**: Logic belongs to the module that owns the data and invariant. Do not patch the nearest caller just because it is convenient.
- **P5 Product shape matters**: Live2D rendering alone is not desktop-pet acceptance. The pet must behave like a transparent desktop object.
- **P6 Scope discipline**: Do not import broad framework behavior or future systems into the V1 path.
- **P7 Review before PR**: Passing tests are necessary, not sufficient. Code checks must cover duplication, layering, edge cases, and surface area.
- **P8 Learn once**: Real misses, repeated bugs, and user corrections must update the nearest knowledge or retro document.
- **P9 Product language first**: Roadmaps, product books, and version goals must start from the user-visible experience, current felt capability, and explicit gaps before implementation tasks, PRs, or sub-agent routing.

## Hard Rules

- `packages/dev-harness/v1-features.json` is the V1 source of truth.
- New V1 acceptance must be represented in the feature manifest and proved by a test or harness.
- Do not add desktop control, browser control, screen reading, long-running task orchestration, multi-agent product behavior, livestream support, Godot/VRM, message gateways, self-generating skills, or plugin marketplace behavior into V1.
- Keep `apps/desktop` as shell/UI/IPC ownership. Runtime policy, provider orchestration, memory, tools, and audio state machines belong behind package boundaries.
- Real Live2D acceptance requires a `.model3.json` path and non-fallback rendering. `pnpm harness:fallback` is diagnostic only.
- Native `BrowserWindow.setShape` is not the default Windows V1 path; it is experimental behind `GREYFIELD_ENABLE_NATIVE_SHAPE=1`.
- New features, checkpoint phases, risky refactors, and multi-agent work use a dedicated git worktree and feature branch when the project is inside a git repo.
- New feature work should end as a pull request, not an untracked local patch. Do not push directly to `main`.
- Never use vague "code check this" review framing. Use module-owner and project-owner review levels plus explicit audit dimensions.
- Frontend-visible PRs are not mergeable on green tests alone. The agent must exercise the ordinary user path, inspect current screenshots, and run the relevant harness gate before asking the user to verify manually.
- Do not poll or wait for GitHub CI, CodeRabbit, or other remote PR bots during active implementation. Use local targeted tests and harnesses while developing; inspect remote CI/bot review only when preparing to mark a PR ready, merge it, or debug an already-failing PR.
- For small, low-risk changes, keep coordination proportional: explain the user-facing exposed surface first, avoid foreground waiting on long remote CI/bot tails, and inspect only focused failure snippets instead of dumping full job logs.
- PRs with unresolved bot-authored inline review threads are not mergeable. Fix the issue or explicitly resolve the thread as not applicable; CI enforces this with `scripts/check-pr-bot-review-threads.mjs`.
- V1 completion claims require a manifest/product-plan audit plus merged main/current-head evidence. PR-local evidence can support review, but it cannot be release wording until rerun on the target branch.
- Electron/browser harnesses that build desktop artifacts or launch windows must run serially unless isolation is explicitly proven. Parallelize unit/static checks, not shared Electron desktop flows.
- In a fresh worktree, run dependency install, `pnpm` tests, and typecheck serially per worktree. Do not start two `pnpm` commands in the same worktree at the same time.
- Prefer appending to existing knowledge docs over creating tiny one-off rule files.
- Roadmap or phase issues are indexes, not implementation scope. Before assigning code work, split the next user-visible function point into an atomic issue with acceptance evidence, non-goals, owner files, and one expected PR.
- Product/version planning is not ready for implementation until the product book states in plain language what the user will feel, what works now, what still does not work, and which benchmark or harness proves the gap.
- Do not spawn an implementation sub-agent until the task names exactly one issue, one dedicated worktree, one branch, the owned file/module surface, and the verification gate. If that agent fails or is reassigned, close or explicitly retire it before another agent touches the same worktree.
- When a feature slice is approved for implementation, the coordinating agent must spawn the assigned implementation sub-agent before touching business code. Creating a worktree or choosing a branch is only setup, not implementation. If the agent cannot spawn the sub-agent, it must stop and report the blocker instead of self-implementing.
- Do not close an implementation sub-agent merely because it returned once, hit a budget limit, or claimed the patch is done. Keep the same agent attached to its issue/worktree through review and rework; resume or send follow-up input when budget returns or review finds fixes. Close it only after the PR is merged/abandoned or the coordinator explicitly retires that worker.
- While an implementation sub-agent is still working, the coordinator must not pre-review that worker's business diff. Wait for handoff or a blocker before inspecting implementation details. Use coordinator time for non-overlapping issue delegation, project coordination, or rule/docs work.
- Do not over-serialize atomic issues merely because they may touch nearby harness or runtime files. Real multi-agent work can create merge conflicts; use dedicated branches, explicit ownership, PR review, rebase, and conflict resolution instead of blocking all adjacent work.
- After spawning implementation sub-agents, the coordinator must keep an active wait/review loop or set an explicit follow-up wakeup before ending the turn. Sub-agent notifications are not a substitute for coordinator ownership; do not assume a completed worker will automatically resume the main agent after a final response.
- Implementation worker prompts should delegate push/open-PR authority by default: after local validation passes, the worker may push its assigned branch and open a Chinese PR unless the coordinator explicitly keeps that step. The coordinator still owns review, merge, issue closeout, and worker shutdown.
- A reviewed, validated implementation branch must not sit as a local-only "ready" branch. After coordinator review finds no blocker, either the authorized worker already pushed/opened the PR, or the coordinator must do it immediately. PR bodies are written in Chinese unless the user asks otherwise.
- Worker completion means validated, artifact-backed, committed, pushed, and attached to a PR/head SHA unless the coordinator explicitly asked for a local-only spike. A local "done" report without push/PR is not a completed implementation handoff.
- Privacy-sensitive user-control features must test the lifecycle, not only the happy path: create, send/use, stop, delete, reload/replay, in-flight cancellation, source display, export/recall, and raw-data non-persistence.
- Desktop-pet environment sensing features must be designed as a felt pet mode or state, not as chat attachment management, unless the user explicitly asks for an upload/preview workflow.
- Screen or visual awareness work must state how it behaves when the user asks, when `proactivityLevel` causes Greyfield to speak first, and when the feature is off. Do not treat visual input and proactive speech as unrelated slices when the user-facing loop is one experience.
- Do not invent user-visible preview/delete/high-frequency/timer/frame-cap interactions from engineering safeguards. Safety limits may exist internally, but visible product controls need explicit product approval.
- Desktop screen awareness uses one ordinary pet-control toggle unless the approved product story says otherwise. Do not add separate Shot, Clear, End, preview, frequency, or frame-management controls to the small desktop panel; sampling and retention policy belong in Settings or internal defaults.
- Before landing rule/docs changes, check the current branch, status, and PR ownership. If the checkout belongs to an open feature PR or has unrelated user/worker changes, use a separate docs branch/worktree instead of mixing process rules into business diffs.

## Required Reading Index

Project state:

- `README.md`: V1 goal, command list, workspace map.
- `docs/progress.md`: current status and QA bar.
- `docs/plans/v1-product-plan.md`: Chinese product-facing V1 plan, current capability, and remaining work.
- `packages/dev-harness/v1-features.json`: feature status, acceptance, package owner, QA script.

Product and QA guardrails:

- `docs/product-shape.md`: hard V1 product constraints.
- `docs/qa-retro.md`: known QA misses and regression lessons.
- `docs/desktop-pet-product-commonsense.md`: desktop-pet category baseline.

Architecture and references:

- `docs/architecture.md`: package boundaries and runtime loop.
- `docs/failure-retro.md`: old Greyfield failure modes and V1 guardrails.
- `docs/technical-reference-projects.md`: external references and what not to copy.
- `docs/reference-solutions.md`: selected reference constraints.

Agent rule details:

- `docs/agent-rules/README.md`: detailed rule index.
- `docs/agent-rules/worktree-pr.md`: multi-agent, worktree, branch, and PR rules.
- `docs/agent-rules/code-check-owners.md`: module-owner/project-owner code check levels.
- `docs/agent-rules/debugging-knowledge.md`: bug locating discipline and knowledge-base maintenance.
- `docs/agent-rules/framework-practices.md`: useful practices absorbed from surveyed frameworks.

## Verification Index

Use `docs/development-speed-policy.md` to choose fast-loop vs checkpoint verification. The default is targeted verification during active edits, then checkpoint verification only when claiming a milestone or touching a high-risk surface.

Fast loop:

```bash
pnpm dev:live2d:fast
pnpm harness:pet:quick
pnpm test
```

Checkpoint loop:

```bash
pnpm typecheck
pnpm test
pnpm harness:acceptance
pnpm harness:live2d
pnpm harness:electron
```

Use the narrowest verification that proves the change during active iteration, then use the checkpoint loop before claiming a checkpoint or changing settings/chat/runtime IPC.

## Current Framework Decision

Do not install or import an external development framework by default. `docs/development-framework-research.md` explains the research and concludes that Greyfield's existing guardrails are enough when agents enter through this file and follow the linked rule docs.
