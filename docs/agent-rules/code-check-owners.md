# Code Check Levels And Owners

Vague review prompts do not protect the repo. Do not ask only "code check this" or "looks good?" Reviews must name the owner level and audit dimensions.

This rule is adapted from `claude-workflow-starter`'s `code_taste` and `reviewer_lens_audit`: tests prove paths; reviewers check ownership, naming, layering, duplication, edge cases, and API surface.

## Owner Map

- Project owner: V1 spine, non-goals, feature manifest, product shape, QA bar, checkpoint readiness.
- `apps/desktop` owner: Electron/Vite/Vue shell, windows, IPC, settings UI, tray, logs, renderer state.
- `packages/stage-live2d` owner: Pixi/Live2D loading, `.model3.json` parsing, touch/motion/expression/mouth driver boundaries.
- `packages/core-runtime` owner: event protocol, prompt assembly, provider abstraction, persona, session loop.
- `packages/audio-runtime` owner: sentence splitting, playback queue, audio level, VAD/ASR/TTS boundaries.
- `packages/persistence` owner: config, memory, character files, session persistence.
- `packages/dev-harness` owner: V1 feature manifest, fake-provider acceptance, Live2D/Electron harnesses.

## Level 0: Author Self Check

Run before asking anyone else to review.

- Diff matches the task and does not include unrelated cleanup.
- Names explain mechanism, not vibes.
- New helpers were preceded by `rg` for existing equivalents.
- Tests live with the behavior owner, not wherever import was convenient.
- Temporary probes/logs are removed unless they are intentional diagnostics.
- Verification commands are listed with real results.

## Level 1: Module Owner Check

Required when a change touches a package boundary or changes behavior inside a package.

The module owner checks:

- Does the logic live with the data/invariant owner?
- Are package boundaries preserved?
- Are tests placed in the package that owns the behavior?
- Are existing helpers/constants reused?
- Does the public/internal API surface stay minimal?
- Are failure modes readable and non-silent?

Module-owner examples:

- A model alpha hit-test change belongs to `packages/stage-live2d`, with renderer usage only consuming the result.
- A runtime interrupt or provider stream change belongs to `packages/core-runtime`, with desktop only forwarding events.
- A settings persistence change belongs to `packages/persistence` or Electron settings controller, not random renderer state.

## Level 2: Integration Owner Check

Required for IPC, runtime event flow, settings/chat/runtime, provider, persistence, or stage integration changes.

The integration owner traces the full path:

- renderer -> preload IPC -> Electron main -> service -> runtime -> event fan-out -> renderer state;
- model path -> manifest resolution -> renderer stage -> harness assertion;
- config edit -> persistence -> settings changed -> runtime rebuild.

The check must confirm:

- Typed IPC/event contracts still match.
- Fake-provider deterministic harness path still works.
- Real-provider wiring does not replace fake-provider QA.
- Secrets and provider calls live on the intended process boundary.
- Interrupt/error states leave UI, runtime, audio, and stage sane.

## Level 3: Project Owner Check

Required before checkpoint claims and PRs that change V1 behavior.

The project owner checks:

- Does this preserve the V1 spine and non-goals?
- Does `packages/dev-harness/v1-features.json` need an update?
- Does desktop-pet product shape still hold?
- Are the right harnesses run for the risk touched?
- Did the work create a lesson that belongs in a retro or knowledge doc?
- Is the PR one cohesive user-facing goal?

## Level 4: PR Gate

Required before opening or merging a feature PR.

- Level 0 self check is complete.
- Relevant Level 1 module-owner checks are complete.
- Level 2 integration check is complete if any cross-boundary path changed.
- Level 3 project-owner check is complete for V1 behavior changes.
- Verification commands/results are in the PR body.
- P0/P1 findings are fixed. P2 findings are fixed or explicitly deferred with rationale.

For frontend-visible PRs, also required:

- The ordinary user path was tested, not only an internal state shortcut.
- Current screenshots were opened and inspected by the author before asking for user verification.
- The PR body names the visual/harness evidence used for Settings, Chat, Pet, speech bubble, Stop, or provider UI changes.
- Product-shape regressions are treated as blockers even if DOM-level assertions pass.

## Reviewer-Lens Audits

For risky PRs, run these four audits explicitly. A sub-agent must return findings or `none found` for each one.

1. Duplication: grep for existing functions, classes, algorithms, constants, fixtures, and helpers that overlap with the change.
2. Layering: identify which module owns the data and invariant; flag logic living in the wrong layer.
3. Edge cases: list boundary values, empty/single/max cases, defaults, cancellation, error paths, and off-by-one risks.
4. Surface area: list new config, API, IPC, CLI, public functions, optional params, and ask whether each can be derived or avoided.

Required prompt shape:

```text
Static review this change. For each audit below, return findings
(P0 blocker / P1 should-fix / P2 nit) or explicitly write "none found".
Do not skip any audit: duplication, layering, edge cases, surface area.
End with: AUDITS RUN: 1,2,3,4 — N findings.
```

For parallel review, split into three agents:

- Agent A: duplication only.
- Agent B: layering only.
- Agent C: edge cases and surface area.

The coordinating agent unions findings and decides fixes.
