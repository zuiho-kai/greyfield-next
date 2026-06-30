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

## Greyfield PR Backtrace Practices

These practices were promoted from the V1 closeout PR sequence #41-#57.

| PRs | Lesson | Future rule |
| --- | --- | --- |
| #41 | Independently green feature slices still created cross-branch regressions when integrated: Stop had to stay available while voice output was queued, natural speech completion had to clear shared UI, and bubble click-through state had to remain fresh. | Treat integration as its own user-facing goal. After merging slices locally, rerun cross-path harnesses and audit shared state, not only each slice's original test. |
| #42 | Dragging failed when the pointer crossed transparent model pixels during an active drag. | Pet interaction tests must include continuity across alpha/hit-test transitions, not only the start point. |
| #43 | Settings API key input looked saved but became uneditable because masked settings echoes were mapped through two renderer paths. | Settings and secret UI must test ordinary typing/editing paths and every settings sync listener, not only persistence output. |
| #44 | Frontend regressions kept escaping narrow tests. | Frontend-visible changes need the aggregate `frontend-full` gate and current screenshot inspection before user handoff. |
| #45 | Settings visual polish and destroyed auxiliary windows were V1 quality issues, not optional cleanup. | Window lifecycle and product readability are acceptance surfaces when they block ordinary users. |
| #46 | The Stop-audio harness was flaky because it waited on Settings queue state before proving the Pet speech probe had both utterances. | Harnesses must synchronize on the owner of the condition under test; downstream UI state can be diagnostic, not the only gate. |
| #54 | Real TTS playback was valuable, but it did not satisfy the full V1 voice scope. | A partial capability PR must preserve the larger feature status and explicitly prevent release wording from shrinking to the implemented subset. |
| #55 | Full voice required microphone capture, ASR, transcript routing, TTS playback, waveform mouth movement, and Stop cleanup together. | Voice completion is a scenario matrix, not a single provider check. Keep fake/local OpenAI-compatible harnesses so the path is testable without secrets or hardware. |
| #56 | After merge, docs still had PR-local evidence wording until a follow-up corrected them. | Any PR that changes completion status needs a post-merge current-head doc pass or a preplanned docs follow-up. |
| #57 | A retro alone recorded the incident but did not change the operating framework. | Repeated or severe misses must graduate from retro notes into agent rules, verification policy, or review gates. |
| #59 | Floating controls existed and Stop-audio passed, but manual QA still found malformed active button visuals, odd bubble placement, and overlapping speech. | Frontend-visible acceptance must assert trigger-after-click visual states and forbidden concurrent states directly; existence, final cleanup, and green Stop tests are not enough. |
| #67-#68 | The V2.0b memory-control work shipped useful functionality, but too much thread budget was spent watching CI/CodeRabbit and doing post-merge evidence cleanup inside the same feature loop. | During development, use local targeted checks. Treat CI/CodeRabbit as merge-readiness gates only; if remote checks are pending and no merge decision is being made, report status and stop waiting. Split post-merge docs cleanup from the next feature unless release wording is the immediate task. |
| #95-#97 | V2.1 memory work used broad phase issues as implementation containers, so one PR mixed source drilldown UI, privacy redaction, exports, and source-session correctness. Sub-agent retries then spent tokens without increasing mergeable output. | Split roadmap phases into atomic implementation issues before coding. Each sub-agent gets one issue, one worktree, one branch, one expected PR, and a verification gate. If review shows mixed scope, split before more CI or agent retries. |
| #158 | V2.3 visual observation implemented useful capture/provider/privacy plumbing, but the product shape drifted into a Chat screenshot attachment manager with preview/delete/frequency controls. The intended desktop-pet loop was screen awareness: a mode in the pet controls that can support both user questions and proactive speech. | For desktop-pet awareness features, define the felt mode first, place the entry in the ordinary pet surface, and state the relationship to `proactivityLevel` before coding. Do not expose frame caps, timers, preview/delete, or frequency tiers as product controls unless the user approved them. Keep one felt loop in one corrective PR instead of splitting UI/runtime/proactive/privacy by technical layer. |
| 2026-06-28 V2.1 planning | V2.1 memory work produced useful backend and benchmark pieces, but the product discussion drifted into PR/status accounting. The user asked for a product book in human language: what the pet should feel like, what is actually felt today, and what remains missing. | Product/version work must pass the product design gate before implementation: write the user-facing story, current felt status, backend-only status, missing product gaps, and next user-visible slice before creating more issues, PRs, or sub-agent assignments. |

## Completion Claim Discipline

- Derive the release claim from `packages/dev-harness/v1-features.json`, `docs/plans/v1-product-plan.md`, and the actual user path, then map each requirement to evidence.
- Separate three evidence classes: PR-local review evidence, merged current-head evidence, and credentialed external-provider evidence.
- A partial feature may merge only if the docs and PR body keep the unimplemented remainder visible.
- Do not mark a feature done because the last implemented slice passed. Mark it done only after the whole scenario matrix has current-head proof.
- If the user says the scope is still missing, reopen the evidence map before defending the previous claim.

## Product Planning Discipline

- Start product answers with the user-visible experience, not with PR count, package names, or CI status.
- State what the user can feel in the current app separately from what is only backend scaffolding or benchmark proof.
- Keep "not done" items explicit when they block the intended product feeling.
- Only after the product story is clear should the agent split atomic issues, assign sub-agents, or discuss verification details.
- For memory work, the default product question is: "Does the pet feel like it shares history with the user, and can it prove why it remembered something?"
