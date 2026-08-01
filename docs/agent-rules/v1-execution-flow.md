# V1 Execution Flow Rules

These rules turn the from-zero V1 retro into daily execution behavior. They apply to agents and teammates working on Greyfield Next V1.

## 1. Classify Before Work

Before editing code or docs, classify the task:

1. Which `GFN-V1-*` feature does this touch?
2. Is it V1 required work, V1 polish, future work, or explicitly out of scope?
3. What user-visible result changes?
4. What executable acceptance proves it?

If a task cannot map to the feature manifest and is not a pure planning/documentation task, do not silently add it to V1. Update the manifest first or keep it out of scope.

## 2. Product Truth vs Draft State

Use four distinct states:

| State | Meaning | Allowed Action |
| --- | --- | --- |
| Local draft | Content is being shaped and may be wrong. | Edit locally; do not present as confirmed. |
| Issue | Discussion record or PM review artifact. | Paste plans, meeting notes, split proposals, and open questions. |
| PR | Reviewable proposal to change repo truth. | Use after the user confirms content or asks for a PR. |
| `main` | Project truth. | Only after PR checks and merge. |

Meeting notes, PM plans, retros, and teammate split plans should not jump from local draft to PR without user confirmation. If the user says “贴上去”, prefer an issue unless they explicitly ask for a PR or merge.

## 3. User-Visible Task Splitting

New teammate tasks must be split by user-visible outcome, not by file ownership alone.

Every handoff must include:

- Goal: what the user can do or understand after the task.
- Why independent: why this teammate can finish without blocking another stream.
- Do: concrete visible behaviors.
- Do not: explicit V1 boundaries and adjacent temptations to avoid.
- Deliverables: product artifacts, code paths, tests, or harnesses.
- Acceptance: what command, harness, screenshot, or manual flow proves it.
- Dependencies and risks: what can break or block progress.
- Suggested worktree/branch name.

Do not hand off “edit these files” as the main task. File lists can appear only after the user-visible goal is clear.

## 4. V1 Scope Firewall

These stay out of V1 unless the manifest and product plan are explicitly changed:

- desktop control
- browser control
- screen reading
- long-running task orchestration
- multi-agent product behavior
- plugin marketplace
- livestream
- Godot/VRM
- message gateways
- self-generating skills

If a suggested solution needs one of these, choose a smaller V1-compatible alternative.

## 5. Desktop-Pet Acceptance

Live2D rendering alone is not desktop-pet acceptance.

Pet work must preserve:

- transparent frameless pet window
- non-model transparent-area pass-through
- visible model-pixel interaction
- model drag moves window x/y only
- wheel scale is bounded and disabled during drag/pass-through
- speech bubble remains a short stable surface; full chat stays in Chat

Use `pnpm harness:pet:quick` during active pet work. Use `pnpm harness:electron` before claiming a checkpoint or changing settings/chat/main IPC.

## 6. Runtime And Secret Ownership

Hosted Electron real provider calls belong in Electron main only.

Renderer responsibilities:

- send runtime input
- consume runtime events
- display settings, chat, errors, and status
- never construct real providers in hosted Electron mode
- never store raw provider secrets

Electron main responsibilities:

- provider calls
- abort signals
- settings persistence
- session/memory/persona stores
- native window side effects

Fake providers are valid for harnesses and no-host preview. They are not proof that real provider behavior works.

## 7. Stop Means Real Stop

Stop is not just an interrupted UI state.

For provider/runtime work, acceptance must cover:

- active provider request receives an abort signal or closes;
- later chunks do not update the stopped reply;
- concurrent text input interrupts the active run before starting a new one;
- Test LLM is rejected while chat is actively streaming;
- failed or interrupted turns do not pollute JSONL session history.

## 8. Persistence Requires Disk Evidence

Do not treat renderer final UI as proof that disk writes completed.

Persistence acceptance must poll the persisted condition:

- config file changed;
- JSONL contains expected user/assistant turns;
- restart prompt includes prior turns;
- failed provider paths do not append half turns.

Successful assistant turns must persist before `assistant.text.final` is emitted to the renderer.

## 9. Verification Choice

Use `docs/development-speed-policy.md` for command selection.

Default pattern:

- targeted tests while editing;
- fast pet harness for desktop-pet interaction;
- full checkpoint only when claiming a milestone, touching risky surfaces, or preparing a trusted baseline.

Do not slow every small edit with full Electron, but do not claim completion without an executable signal.

## 10. Retro And Rule Updates

When a miss repeats or corrects an assumption:

1. Update the nearest retro or rule doc.
2. Update `v1-features.json` if acceptance/status/QA changed.
3. Update product plan only when the user-facing capability or remaining work changed.

Do not create tiny one-off docs unless the lesson no longer fits existing retros.
