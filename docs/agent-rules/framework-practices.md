# Absorbed Framework Practices

Use these practices from surveyed open-source workflow repositories without importing their full frameworks.

## From `zuiho-kai/growth-vibe-framework`

- Freeze the current spine before expanding scope.
- For new capability work, state what is in scope and explicitly what is not.
- Treat design, implementation, review, verification, and lesson landing as separate moments.
- Use role perspectives for risky work: Architect for boundaries, Tech Lead for implementation path, QA Lead for acceptance gaps, Developer for concrete changes, Recorder for decisions.

## From `zuiho-kai/claude-workflow-starter`

- Keep the base checkout clean and do feature work in worktrees.
- Preserve lessons as memory/error entries only when they will be reused.
- If context is getting too large, write a concise handoff note before stopping: goal, completed work, current blocker, changed files, verification, next command.
- Repeated mistakes should graduate from incident notes to stronger project rules.
- Code checks must name audit dimensions. Vague "check this" review prompts are not enough.

## From `arabicapp/everything-claude-code`

- Prefer small reusable command patterns over one huge instruction file.
- Verification should be a deliberate loop: build/typecheck/tests/harness/diff review as applicable.
- Use specialized review prompts for code review, build failures, test coverage, docs, and refactors.
- Keep hooks advisory until they prove stable; bad hooks are worse than no hooks.

## From `bmad-code-org/BMAD-METHOD`

- A task is ready for development only when it is actionable, logically ordered, testable, and free of placeholders.
- Keep one branch/PR focused on one cohesive user-facing goal. Split independent deliverables.
- Acceptance criteria should be concrete enough to test, preferably Given/When/Then for user-visible behavior.
- For risky PRs, review in layers: blind bug hunt, edge-case hunt, and acceptance audit.
- Scale process to task size. Small fixes use the fast path; major changes need explicit planning and review.

## From `SuperClaude-Org/SuperClaude_Framework`

- Choose the working mode before acting: research, brainstorm, design, implement, troubleshoot, test, document, or review.
- Use specialist lenses when helpful, but do not let role vocabulary replace evidence.
- Start complex work with a confidence check: unknowns, risky files, required verification, and rollback path.
- Watch context and tool load. Enable only the integrations needed for the current task.
