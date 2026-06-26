# Clowder AI Memory Notes

Snapshot:

- Repository: https://github.com/zts212653/clowder-ai
- Commit inspected: `79b6e9acb51aa1f48ed799ecf7bc3469719b505d`
- License: MIT
- Purpose of this note: extract memory-system lessons for Greyfield V2.0. This is not a full code audit.

## Files Inspected

- `docs/decisions/020-f102-memory-system-architecture.md`
- `docs/decisions/015-knowledge-object-contract.md`
- `docs/features/F102-memory-adapter-refactor.md`
- `docs/features/F200-memory-recall-eval.md`
- `packages/shared/src/types/memory.ts`
- `packages/shared/src/types/summary.ts`
- `packages/api/src/domains/cats/services/session/buildThreadMemory.ts`
- `packages/api/src/domains/memory/schema.ts`

## Core Model

Clowder separates runtime conversation state from searchable memory:

- `Thread`: shared conversation unit. Summaries and searchable conversation memory belong here.
- `Session Chain`: per-agent runtime chain inside a thread. This is for resume, audit, and raw event drill-down.
- `Transcript / JSONL`: permanent raw evidence. Summaries and indexes do not replace it.
- `summary_segments`: append-only summary ledger. This gives compressed memory provenance and rebuildability.
- `evidence_docs` / `evidence_passages`: searchable read models compiled from durable sources.
- `evidence_vectors` / `passage_vectors`: semantic indexes, separate from source truth.
- `recall_events`: telemetry showing which search results were exposed, consumed, abandoned, or followed.

The important product principle is `summary-first, raw-on-demand`: use summaries for normal recall, but keep raw transcript paths available when a summary loses detail.

## Mechanisms Worth Reusing

### 1. Raw Evidence Outlives Summary

Clowder treats the index as compiled output, not truth. `evidence.sqlite` can be rebuilt; original docs, transcript, and segment ledgers are the durable source.

Greyfield should use the same stance:

- Raw chat turns remain append-only.
- Summary segments are derived records with source message IDs.
- Pinned memories must carry provenance back to raw turns or summary segments.

### 2. Thread-Level Summary, Not Per-Agent Summary

Clowder's ADR says the semantic summary unit is the thread, not each agent session. That prevents duplicate summaries when multiple agents participate in the same conversation.

Greyfield has one visible companion, but the same lesson maps to:

- `conversationId` or `chatThreadId` owns summary.
- A character/session runtime can restart without duplicating summary truth.

### 3. LSM-Style Compaction

Clowder models summaries as layers:

- L0: recent raw messages / live context.
- L1: topic summary segments.
- L2: future rollups.

This is useful for Greyfield because a desktop companion will accumulate long casual conversations. V2.0 should start with L0 + L1 and design L2 as a future read-path improvement.

### 4. Three Retrieval Modes

Clowder distinguishes:

- lexical search: exact terms, feature IDs, names.
- semantic search: vector nearest-neighbor for fuzzy/cross-language recall.
- hybrid search: independent lexical + semantic recall, fused by ranking.

The key warning is that semantic must not depend on BM25 candidates. If BM25 fails to recall a relevant memory, reranking BM25 cannot recover it.

### 5. Recall Telemetry Is Useful But Dangerous

F200 uses behavior such as search result -> read/follow to estimate navigation utility. This is valuable, but the spec explicitly warns that consumption is a proxy, not truth.

Greyfield can borrow a lighter version:

- Record which memories were recalled for a chat turn.
- Record whether the user opened, edited, disabled, or deleted them later.
- Do not automatically promote a memory to "more true" just because it was recalled often.

## What Greyfield Should Not Copy Yet

- Full multi-agent session-chain complexity. Greyfield V2.0 has one desktop companion flow.
- Full graph/edge governance. Useful later, too heavy for V2.0.
- Consumption-weighted reranking as an early feature. V2.0 should first make recall visible and correct.
- Heavy sidecar requirements by default. Embedding should be optional and fake/local-testable.

## Greyfield Takeaway

The strongest reusable abstraction is:

```text
Raw Chat Log -> Summary Segment Ledger -> Search Index -> Recall Trace
                         |
                         v
                  Memory Candidate -> Pinned Memory
```

Summary compresses context, index enables recall, pinned memory expresses user-approved long-term facts, and raw logs keep the system auditable.

