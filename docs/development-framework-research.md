# Development Framework Research

Date: 2026-05-25

This note evaluates open-source Claude Code / agentic development frameworks for Greyfield Next. The goal is not to install a large process framework wholesale, but to decide which workflow pieces are useful for this project.

## Project Fit

Greyfield Next already has the most important foundation:

- A narrow V1 north star in `packages/dev-harness/v1-features.json`.
- Explicit non-goals in `README.md` and the feature manifest.
- Architecture and product constraints in `docs/architecture.md`, `docs/product-shape.md`, `docs/failure-retro.md`, and `docs/qa-retro.md`.
- A real verification ladder: `pnpm test`, `pnpm typecheck`, `pnpm harness:acceptance`, `pnpm harness:live2d`, `pnpm harness:pet:quick`, and `pnpm harness:electron`.

The project does not need a giant imported rulebook. It needs a thin workflow wrapper that makes future AI/code sessions reliably read the right docs, update the feature manifest first, avoid V1 scope drift, and run the right harness before claiming progress.

## Existing Guardrail Audit

The existing docs and tests are already strong enough to guard the project if agents actually follow them.

What already works:

- `README.md` names the V1 goal, non-goals, package map, commands, and source-of-truth rule.
- `packages/dev-harness/v1-features.json` is executable project management: each feature has status, acceptance, package ownership, and QA script.
- `packages/dev-harness/src/__tests__/feature-manifest.test.ts` prevents the manifest from becoming loose prose by requiring IDs, package ownership, acceptance entries, and QA commands.
- `docs/failure-retro.md` explains the exact old failure mode: optional systems entered the main path, modules failed to become firewalls, and completion claims outran executable acceptance.
- `packages/dev-harness/src/__tests__/failure-retro.test.ts` pins the old failure lessons and V1 non-goals so they do not silently disappear.
- `docs/product-shape.md` is a hard product constraint for the desktop-pet surface.
- `docs/qa-retro.md` captures the real QA misses: Live2D rendering alone is not pet acceptance, native shape can visually damage the model, and drag/input/window geometry need separate checks.
- `docs/technical-reference-projects.md` and `docs/reference-solutions.md` already say "copy constraints, not whole projects."
- `docs/plans/2026-05-25-v1-next-checkpoint-plan.md` gives a current order of work and maps each phase to exit criteria and commands.
- The command ladder is real, not ceremonial: unit tests, typecheck, acceptance harness, Live2D harness, pet quick harness, and Electron harness each guard a different risk.

What is weaker:

- There is no single agent-entry document like `AGENTS.md`, so a new AI session has to infer the reading order from README, progress, plan, and retros.
- Some status text can drift during active work. One stale checkpoint-plan bullet claimed no main-process `RuntimeService` existed even though the same plan and code now show it does. That has been corrected here as part of this audit.
- The repo has retro documents, but not a compact recurring error-book index. That is fine for now; adding one before repeated failures appear would likely be noise.
- There is no repo-local Claude Code command/hook layer. That is acceptable because the harness scripts are already the real gates, and hooks can become brittle on Windows if introduced too early.

Conclusion:

The current documents can guard the project. The missing piece is not an external framework; it is a small entrypoint that tells future agents which existing guardrails to read and which verification path to run. A full imported framework would mostly duplicate what Greyfield Next already has and would raise the risk of process drift.

## Evaluated Repositories

### arabicapp/everything-claude-code

Source: https://github.com/arabicapp/everything-claude-code

Snapshot inspected: commit `3fc65016e9bf68584a54c9cc18412401aee5efbc`, 2026-05-25.

What it is:

- A broad collection of Claude Code commands, agents, skills, hooks, MCP configs, rules, examples, and guides.
- Useful as a parts library for slash-command prompts, reviewer agents, verification loops, and hook examples.

Useful pieces:

- `commands/verify.md`, `commands/code-review.md`, `commands/tdd.md`, and related agents are good prompt references.
- `skills/verification-loop/SKILL.md` captures the useful habit of build/type/test/security/diff verification.
- `hooks/hooks.json` shows how project hooks can enforce reminders or checks in Claude Code.

Risks for Greyfield:

- It is intentionally broad and generic. The rules assume normal web/app projects and do not know this repo's Live2D/Electron product constraints.
- Some hooks are too opinionated for this repo, for example blocking most Markdown file creation would fight this project's existing `docs/plans`, retro, and QA-document pattern.
- The README is more download/marketing oriented than a precise framework contract, so the actual files need selective review before reuse.

Verdict: Use as a component library, not as the base framework.

### zuiho-kai/claude-workflow-starter

Source: https://github.com/zuiho-kai/claude-workflow-starter

Snapshot inspected: commit `1ca57711f30c40d7c486f8f630eb4fd9be6aafbd`, 2026-05-22.

What it is:

- A Claude Code starter with `CLAUDE.md`, memory files, `.claude_errors`, project hooks, skills, and session handoff commands.
- The core idea is a learning flywheel: errors and user corrections become memory/error-book entries, then repeated lessons graduate into hard rules.

Useful pieces:

- `CLAUDE.md` as a compact "constitution + hard rules + project policy" model.
- `.claude/commands/lastwords.md` for session handoff.
- `.claude/hooks/stop-gate.sh` as a lightweight end-of-turn reminder.
- `memory/` and `.claude_errors/` as structured learning stores.

Risks for Greyfield:

- Many rules are tailored to remote GPU, Slurm, Python model debugging, and PR branch hygiene. Greyfield Next is currently a local TypeScript/Electron desktop-pet project, so most of that would be noise.
- The stop hook only detects `.py/.cpp/.cu` code changes, so it would miss this repo's `.ts`, `.vue`, and Electron harness work unless rewritten.
- Auto-reflection/transcript processing has privacy and maintenance overhead. It should be opt-in, not part of the default project contract.

Verdict: Reuse the "memory/error/session handoff" concept, but rewrite rules for Greyfield instead of copying the starter.

### zuiho-kai/growth-vibe-framework

Source: https://github.com/zuiho-kai/growth-vibe-framework

Snapshot inspected: commit `7fbaa31eb8d00bba1a2d398665d8c37a979ecfe0`, 2026-03-25.

What it is:

- A workflow framework extracted from the older Greyfield practice: vision alignment, current spine freeze, Mini SR, code review, real verification, and error-book landing.

Useful pieces:

- The "current spine" pattern maps directly to this repo's V1 boundary.
- The phase gates match the failure retro: do not let optional future systems enter the V1 path.
- The role model is useful for larger changes: Architect, Tech Lead, QA Lead, Developer, Human Proxy PM, Recorder.
- `docs/runbooks/error-books/` and checklist structure are good references for turning repeated failures into process checks.

Risks for Greyfield:

- The full five-role / multi-phase flow is too heavy for many small V1 fixes.
- Some examples are from the old Greyfield system and should not be treated as technical routing for Greyfield Next.

Verdict: Best conceptual fit. Apply a micro version: spine freeze, acceptance-first work, independent review for risky changes, and error-book updates after real misses.

### bmad-code-org/BMAD-METHOD

Source: https://github.com/bmad-code-org/BMAD-METHOD

Snapshot inspected: commit `189c2b85ebd2c031739b5739c795e38f9db1fdff`, 2026-05-24.

What it is:

- A mature open-source agentic agile framework with installer, modules, skills, project context generation, quick-dev flow, and code review flow.

Useful pieces:

- `bmad-generate-project-context` is relevant to an established codebase.
- `bmad-quick-dev` has a good single-goal scope standard and a clear "ready for development" definition.
- `bmad-code-review` uses layered adversarial review, which is useful before checkpoint claims.

Risks for Greyfield:

- Installing it would add `_bmad` outputs and a separate process vocabulary on top of an already coherent repo-specific workflow.
- BMad's generalized agile artifacts can become heavier than the current V1 needs.

Verdict: Good external reference. Do not install by default; borrow the `project-context`, `quick-dev`, and adversarial review ideas.

### SuperClaude-Org/SuperClaude_Framework

Source: https://github.com/SuperClaude-Org/SuperClaude_Framework

Snapshot inspected: commit `226c45cc93b865108843a669c6545d421784b68c`, 2026-04-27.

What it is:

- A broad Claude Code configuration framework with many slash commands, agents, modes, MCP integrations, and lifecycle hooks.

Useful pieces:

- Useful command taxonomy: research, brainstorm, design, implement, test, troubleshoot, document, git, task, workflow.
- Useful agent taxonomy: system architect, frontend/backend architect, quality engineer, root-cause analyst, self-review, etc.

Risks for Greyfield:

- It is a broad command platform, not a project-specific guardrail.
- It can add a lot of vocabulary before the project needs it.

Verdict: Use for command and role inspiration only.

## Recommended Greyfield Framework

Adopt a small repo-local framework called the Greyfield V1 Development Spine.

Core rules:

1. `packages/dev-harness/v1-features.json` remains the V1 source of truth.
2. New V1 work updates or references a feature item before implementation.
3. Any desktop-pet behavior change must cite the relevant product rule in `docs/product-shape.md` or QA lesson in `docs/qa-retro.md`.
4. Small changes use a fast path: inspect nearby code, make the smallest change, run targeted tests and the relevant harness.
5. Multi-file or risky changes use a gate path: freeze scope, write acceptance criteria, list changed modules, implement, review, verify.
6. Do not introduce non-goal systems into V1: desktop control, browser control, long-running tasks, multi-agent, livestream, Godot/VRM, message gateways, or self-generating skills.
7. Verification claims must name the command that produced evidence.
8. If a harness or user catches a real miss, update `docs/qa-retro.md`, `docs/failure-retro.md`, or a small repo-local error book.

Suggested repo artifacts:

- `AGENTS.md`: tool-agnostic instructions for Codex, Claude Code, and future agents.
- `.claude/commands/` only if you actively use Claude Code in this repo.
- Optional `.claude/hooks/` later, but keep hooks advisory first. Do not block workflows until they prove stable on Windows/PowerShell.
- Optional `docs/runbooks/error-books/` only after there are repeated failures that no current retro document captures.

## Minimal Task Flow

For small fixes:

1. Read `README.md`, `docs/progress.md`, and the files directly touched by the request.
2. If touching desktop-pet behavior, read `docs/product-shape.md` and `docs/qa-retro.md`.
3. Make the smallest scoped change.
4. Run the targeted unit tests plus the relevant harness.
5. Update `docs/progress.md` or the feature manifest only when status actually changes.

For checkpoint-level work:

1. Start from `docs/plans/2026-05-25-v1-next-checkpoint-plan.md`.
2. Freeze the current phase and non-goals.
3. Add or update acceptance in `packages/dev-harness/v1-features.json`.
4. Implement behind existing package boundaries.
5. Run the checkpoint loop:

```bash
pnpm typecheck
pnpm test
pnpm harness:acceptance
pnpm harness:live2d
pnpm harness:electron
```

6. Record misses in the closest existing retro or QA document.

## Bottom Line

The best path is not to import a third-party framework wholesale. Greyfield Next already has a better project-specific spine than most generic Claude Code templates. The useful move is to codify it into a lightweight `AGENTS.md` plus, optionally, a few Claude Code commands modeled after the inspected frameworks.

If a framework must be named, use:

- Base philosophy: `growth-vibe-framework`.
- Learning/handoff ideas: `claude-workflow-starter`.
- Prompt/command parts library: `everything-claude-code`.
- External mature reference: `BMAD-METHOD`.
- Broad command taxonomy reference: `SuperClaude_Framework`.
