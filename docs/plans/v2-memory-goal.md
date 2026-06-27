# V2 Memory Goal

更新时间：2026-06-27

## Goal

Greyfield V2.0 memory should become a source-linked, user-correctable companion memory system.

The first engineering goal, V2.0a, is merged into `main` via [#63](https://github.com/zuiho-kai/greyfield-next/pull/63):

- keep raw chat turns as the source of truth.
- add summary segments with source turn references.
- build deterministic recall context from summary segments.
- inject recalled context into the runtime prompt only when a summary store is configured.
- prove that deleting summaries does not delete raw turns.

## Non-Goals For V2.0a

- No automatic pinned long-term memory.
- No silent user-fact promotion.
- No vector database requirement.
- No Memory Panel UI in V2.0a; user-facing controls were added later in V2.0b.
- No LLM-generated summary dependency in the first storage slice.

## V2.0a Foundation

Implemented package boundaries on the V2.0a foundation:

- `packages/core-runtime/src/memory-context.ts`: summary segment types, extractive summary draft, lexical/cue recall, prompt formatting.
- `packages/persistence/src/jsonl-summary-segment-store.ts`: source-linked JSONL summary segment persistence.
- `packages/core-runtime/src/runtime-loop.ts`: optional summary recall injection and extractive summary creation for configured runtimes.
- `apps/desktop/src/main/runtime-service.ts`: desktop runtime wiring, memory debug snapshot, and file-backed summary store handoff.
- `apps/desktop/src/renderer/SettingsWindow.vue`: minimal Memory inspection section for raw turn count, summary source turns, and last recall reason.
- `packages/dev-harness/src/electron-memory-summary-check.ts`: ordinary Chat path proof for raw session + summary segment persistence.

Acceptance covered by tests:

- extractive summary drafts keep source turn IDs.
- unrelated summaries are not recalled by recency alone.
- recall context records reason and source turn IDs.
- deterministic memory benchmark scores summary fact coverage, noise rejection, source coverage, recall hit rate, false-positive rejection, and prompt visibility.
- summary deletion leaves raw session JSONL intact.
- runtime prompt includes recalled summary context when a summary store is configured.
- long chats create extractive summary segments for old turns that leave recent context.
- desktop runtime writes `memory/summary-segments.jsonl` under user data and exposes summary/debug state.
- Electron Chat harness proves ordinary chat creates raw turns, one source-linked summary segment, a `memory.summary.created` event, a `memory.recall.context` event, and visible Settings Memory evidence.

## V2.0b Memory Control

V2.0b moved from inspection to user control and is merged into `main` via [#67](https://github.com/zuiho-kai/greyfield-next/pull/67):

- `SummarySegment` carries `disabled` and `updatedAt` metadata, while older JSONL rows remain readable as enabled memories.
- `SummarySegmentStore.update` is the owner boundary for editing summary text, recall cues, and disabled state.
- `buildRecallContext` skips disabled summaries and reports them as skipped instead of injecting them into the prompt.
- Electron main exposes typed IPC for memory update, delete, refresh, and export.
- Settings Memory shows a user-facing summary list with editable summary text, editable cue text, active/disabled state, save, enable/disable, delete, and export.
- Delete removes the selected summary segment only; raw session JSONL remains the source of truth.
- `harness:electron:memory-control` proves the ordinary Settings path: edit summary, export memory evidence, disable a summary, verify disabled memory is not recalled, delete the summary, and verify raw turns remain.

## V2.0c Memory Evaluation Benchmark

V2.0c is the guardrail slice before adding more memory features. It turns `pnpm harness:memory-benchmark` from a small hard-coded regression into a fixture-driven benchmark under `packages/dev-harness/src/fixtures/memory-benchmark.json`.

The benchmark is intentionally local/fake and does not require external keys. It guards:

- long-chat summary source traceability.
- candidate-worthy facts that later memory-promotion UI will need.
- UI/event noise rejection.
- disabled memory not being injected.
- conflict/update ranking where a corrected newer memory wins within budget.
- false-positive rejection for unrelated inputs.
- prompt visibility of reason and source turns.
- prompt character budget skips that report the skipped item and reason.

V2.0d/e work must extend this fixture before claiming automatic memory promotion, memory layering, or vector recall quality. A feature can add a new recall engine later, but it must keep the benchmark passing or explain the updated acceptance fixture in the same PR.

The current V2.0c benchmark separates narrow regression scores from product readiness. `summaryRegressionScore` and `recallRegressionScore` are locked at `1`, while `productReadinessScore` is locked at `0.4` because automatic candidates, explicit review, memory layering, role isolation, and semantic recall are not implemented yet. CI fails if any score drops below the recorded baseline. When future PRs intentionally add harder cases or improve the product, they must update the fixture baseline in the same PR and explain the new accepted score.

Still not in this slice:

- automatic pinned long-term memory.
- memory candidate review and promotion.
- LLM-generated summarizer replacement for the extractive draft.
- vector database recall.

## Verification

Current V2.0c verification:

```bash
pnpm typecheck
pnpm test:backend
pnpm test:frontend
pnpm harness:memory-benchmark
pnpm harness:electron:memory-control
pnpm harness:frontend-full
```

CI guard:

- `pnpm harness:memory-benchmark` runs in Fast checks, so memory summary/recall quality is guarded even when a PR does not trigger `frontend-full`.
- The memory benchmark fixture is the required V2.0 acceptance gate for future memory feature PRs.
- The benchmark fixture records `baselineScores`; future memory PRs may raise or intentionally update those baselines, but they must not silently degrade below them.
- `pnpm harness:electron:memory-summary` and `pnpm harness:electron:memory-control` currently share `packages/dev-harness/src/electron-memory-summary-check.ts`; the former keeps the V2.0a summary foundation entrypoint stable, while the latter names the V2.0b edit/disable/delete/export gate.
- `frontend-full-check.ts` runs `pnpm harness:electron:memory-control`, so frontend-visible memory regressions are covered by the aggregate gate.
- Main run `28289995890` on head `731f951` passed Fast checks, including `pnpm harness:memory-benchmark`, and `frontend-full`, including the memory-control harness with `memoryEditVisible: true`, `memoryExportVisible: true`, `disabledMemorySkipped: true`, `deletedMemoryKeptRawTurns: true`, and `summaryIncludesSourceTurns: true`.
