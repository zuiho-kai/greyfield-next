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

## Current Main Slice

Implemented package boundaries on main head `b605321`:

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

## Next Slice: V2.0b Memory Control

V2.0a now has a minimal inspection loop. The next implementation slice should move from inspection to user control:

- fake summarizer tests if/when LLM-generated summaries replace the extractive draft.
- user-facing memory management: edit, disable, delete, and export.
- pinned memory and candidate review flow.
- ordinary Settings/Memory Panel path: users can see what was remembered, correct it, disable it without deleting raw chat history, delete selected memory, and export memory evidence.
- benchmark guard for user control: disabled/deleted memory must not be recalled, edited memory must be recalled from the edited text with source evidence, and export must not require external credentials.

## Verification

Current V2.0a verification:

```bash
pnpm exec vitest run packages/core-runtime packages/persistence
pnpm exec tsc -p tsconfig.typecheck.json --noEmit
pnpm harness:memory-benchmark
pnpm exec tsx packages/dev-harness/src/electron-memory-summary-check.ts
```

CI guard:

- `pnpm harness:memory-benchmark` runs in Fast checks, so memory summary/recall quality is guarded even when a PR does not trigger `frontend-full`.
- `pnpm harness:electron:memory-summary` remains the desktop product-path guard: normal Chat turns must create raw session JSONL, summary JSONL, recall events, and visible Settings Memory evidence.
- Main run `28287921556` on head `b605321` passed Fast checks, including `pnpm harness:memory-benchmark`, and `frontend-full`, including the memory summary harness with `summaryCreated: true`, `recallContext: true`, `settingsMemoryVisible: true`, and `summaryIncludesSourceTurns: true`.
