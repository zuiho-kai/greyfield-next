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
- No Memory Panel UI yet.
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

V2.0b moves from inspection to user control:

- `SummarySegment` carries `disabled` and `updatedAt` metadata, while older JSONL rows remain readable as enabled memories.
- `SummarySegmentStore.update` is the owner boundary for editing summary text, recall cues, and disabled state.
- `buildRecallContext` skips disabled summaries and reports them as skipped instead of injecting them into the prompt.
- Electron main exposes typed IPC for memory update, delete, refresh, and export.
- Settings Memory shows a user-facing summary list with editable summary text, editable cue text, active/disabled state, save, enable/disable, delete, and export.
- Delete removes the selected summary segment only; raw session JSONL remains the source of truth.
- `harness:electron:memory-control` proves the ordinary Settings path: edit summary, export memory evidence, disable a summary, verify disabled memory is not recalled, delete the summary, and verify raw turns remain.

Still not in this slice:

- automatic pinned long-term memory.
- memory candidate review and promotion.
- LLM-generated summarizer replacement for the extractive draft.
- vector database recall.

## Verification

Current V2.0b verification:

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
- `pnpm harness:electron:memory-summary` and `pnpm harness:electron:memory-control` currently share `packages/dev-harness/src/electron-memory-summary-check.ts`; the former keeps the V2.0a summary foundation entrypoint stable, while the latter names the V2.0b edit/disable/delete/export gate.
- `frontend-full-check.ts` runs `pnpm harness:electron:memory-control`, so frontend-visible memory regressions are covered by the aggregate gate.
- Main run `28287921556` on head `b605321` passed Fast checks, including `pnpm harness:memory-benchmark`, and `frontend-full`, including the memory summary harness with `summaryCreated: true`, `recallContext: true`, `settingsMemoryVisible: true`, and `summaryIncludesSourceTurns: true`.
