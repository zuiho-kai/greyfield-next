# Debugging And Knowledge Maintenance

## Bug Locating Discipline

Use evidence before edits. Do not patch by vibes.

Required flow:

1. Reproduce or restate the observed failure precisely.
2. Identify the real path involved: renderer, Electron main, preload IPC, core runtime, audio runtime, Live2D stage, persistence, or harness.
3. Search existing code and tests first with `rg`.
4. Trace the full path before choosing a fix.
5. Reduce to one leading hypothesis before editing. If there are multiple plausible causes, inspect or add a narrow probe first.
6. Change the owning module, not the nearest convenient caller.
7. Verify the failing path, not only a nearby happy path.
8. Remove temporary probes/logs before finishing unless they are intentional diagnostics.

Example path:

```text
user input -> renderer bridge -> preload IPC -> main service ->
runtime event -> renderer state -> stage/bubble
```

## Common Greyfield Bug Traps

- "Live2D renders" does not prove "desktop pet works."
- A transparent-looking window can still block the desktop.
- Electron `setShape` can clip visuals; it is not an input-only mask on Windows.
- Drag bugs often hide as scale or bounds drift. Check native window width/height separately from model transform.
- Playwright input can become brittle when `setIgnoreMouseEvents(..., { forward: true })` is active.
- Renderer fallback runtime behavior does not prove the Electron main-process runtime path.
- Fake providers are required for deterministic QA; real provider success must not replace fake-provider harness coverage.
- API key/config UI working does not prove secrets are owned by the correct process boundary.

## Escalation Rules

- If the same class of bug appears twice, update a retro or create a focused error-book entry.
- If a user corrects the same conclusion twice, assume the current diagnosis is wrong and reopen the evidence chain.
- If a fix requires crossing package boundaries, state why the owner boundary is still correct.

## Commonsense And Knowledge Base

Maintain two kinds of long-lived project memory:

- Commonsense: product/category truths that should guide judgment before code.
- Knowledge base: verified technical references, architecture decisions, failure lessons, and integration constraints.

Current commonsense and knowledge files:

- `docs/desktop-pet-product-commonsense.md`: desktop-pet category truths and QA expectations.
- `docs/product-shape.md`: hard Greyfield V1 product constraints.
- `docs/technical-reference-projects.md`: inspected external references and integration lessons.
- `docs/reference-solutions.md`: chosen implementation constraints from references.
- `docs/failure-retro.md`: old Greyfield failure modes and scope guardrails.
- `docs/qa-retro.md`: QA misses and regression lessons.
- `docs/development-framework-research.md`: framework/tooling research and current process decision.

Update rules:

- Add to commonsense when a lesson is product-category level and should shape future judgment.
- Add to the knowledge base when a lesson is verified against a source, code path, harness, or real failure.
- Add to a retro when the lesson comes from a miss, regression, false completion claim, or user correction.
- Do not create tiny one-off knowledge files for every incident. Prefer appending to the nearest existing document.
- Create a new `docs/runbooks/error-books/*` entry only when repeated failures no longer fit the current retros.
- Every new knowledge entry should include the practical consequence: what future agents should do differently.
