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

Acceptance covered by tests:

- extractive summary drafts keep source turn IDs.
- unrelated summaries are not recalled by recency alone.
- recall context records reason and source turn IDs.
- summary deletion leaves raw session JSONL intact.
- runtime prompt includes recalled summary context when a summary store is configured.
- long chats create extractive summary segments for old turns that leave recent context.

## Next Slice

V2.0a is not product-complete until users and harnesses can inspect what was recalled. The next implementation slice should add:

- main-process wiring for the summary segment store path.
- minimal memory debug view or harness evidence for ordinary user inspection.
- fake summarizer tests if/when LLM-generated summaries replace the extractive draft.
- recall trace exposure for UI and test artifacts.

## Verification

Current backend verification:

```bash
node_modules/.bin/vitest.cmd run packages/core-runtime packages/persistence
node_modules/.bin/tsc.cmd -p tsconfig.typecheck.json --noEmit
```
