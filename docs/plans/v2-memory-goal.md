# V2 Memory Goal

更新时间：2026-06-26

## Goal

Greyfield V2.0 memory should become a source-linked, user-correctable companion memory system.

The first engineering goal is V2.0a:

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

## Current Slice

Implemented package boundaries:

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

## Next Slice

V2.0a now has a minimal inspection loop. The next implementation slice should move from inspection to user control:

- fake summarizer tests if/when LLM-generated summaries replace the extractive draft.
- user-facing memory management: edit, disable, delete, and export.
- pinned memory and candidate review flow.

## Verification

Current backend verification:

```bash
node_modules/.bin/vitest.cmd run packages/core-runtime packages/persistence
node_modules/.bin/tsc.cmd -p tsconfig.typecheck.json --noEmit
node_modules/.bin/tsx.cmd packages/dev-harness/src/memory-benchmark.ts
node_modules/.bin/tsx.cmd packages/dev-harness/src/electron-memory-summary-check.ts
```

CI guard:

- `pnpm harness:memory-benchmark` runs in Fast checks, so memory summary/recall quality is guarded even when a PR does not trigger `frontend-full`.
- `pnpm harness:electron:memory-summary` remains the desktop product-path guard: normal Chat turns must create raw session JSONL, summary JSONL, recall events, and visible Settings Memory evidence.
