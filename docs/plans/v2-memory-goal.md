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
- `packages/dev-harness/src/electron-memory-summary-check.ts`: ordinary Chat path proof for raw session + summary segment persistence.

Acceptance covered by tests:

- extractive summary drafts keep source turn IDs.
- unrelated summaries are not recalled by recency alone.
- recall context records reason and source turn IDs.
- summary deletion leaves raw session JSONL intact.
- runtime prompt includes recalled summary context when a summary store is configured.
- long chats create extractive summary segments for old turns that leave recent context.
- desktop runtime writes `memory/summary-segments.jsonl` under user data and exposes summary/debug state.
- Electron Chat harness proves three user messages create six raw turns, one source-linked summary segment, and a `memory.summary.created` event.

## Next Slice

V2.0a is not product-complete until users and harnesses can inspect what was recalled. The next implementation slice should add:

- minimal Memory debug UI or renderer-accessible inspection panel.
- fake summarizer tests if/when LLM-generated summaries replace the extractive draft.
- recall trace display for UI and test artifacts.

## Verification

Current backend verification:

```bash
node_modules/.bin/vitest.cmd run packages/core-runtime packages/persistence
node_modules/.bin/tsc.cmd -p tsconfig.typecheck.json --noEmit
node_modules/.bin/tsx.cmd packages/dev-harness/src/electron-memory-summary-check.ts
```
