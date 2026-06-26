# Greyfield V2.0 Memory Synthesis

更新时间：2026-06-26

This document distills the memory lessons from:

- [Clowder AI](clowder-ai.md)
- [SillyTavern](sillytavern.md)
- [MaiBot](maibot.md)

It is a product/architecture synthesis for Greyfield V2.0, not an implementation spec.

## One-Sentence Direction

Greyfield V2.0 memory should be a source-linked, user-correctable character memory system:

```text
Raw chat stays intact.
Summary segments compress long context.
Pinned memories are user-controlled durable facts.
Hybrid recall brings back a small, visible set of relevant context.
```

## Core Abstractions

| Abstraction | Meaning | Source Inspiration | Greyfield Rule |
| --- | --- | --- | --- |
| Raw Chat Log | Append-only original conversation turns | Clowder transcript/session truth; MaiBot source messages | Never replace this with summary. |
| Summary Segment | Compressed episode of a time range | Clowder summary segment ledger; MaiBot mid-term memory | Must include source message IDs. |
| Recall Cue | Natural-language retrieval handle | MaiBot `recall_cues`; SillyTavern vector queries | Store alongside every summary segment. |
| Pinned Memory | User-owned durable memory/lore | SillyTavern World Info; Clowder materialized knowledge | Editable, deletable, typed, source-linked. |
| Memory Candidate | Proposed long-term memory awaiting confirmation | Clowder marker/materialization gate | V2.0 should not silently pin memories. |
| Recall Context | Per-turn selected memories inserted into prompt | SillyTavern prompt insertion; Clowder summary-first search | Visible in UI and capped by budget. |
| Recall Trace | What was recalled and why | Clowder recall events | Useful for debugging, not truth scoring. |

## Proposed Greyfield V2.0 Data Flow

```text
1. User/assistant turns append to Raw Chat Log.
2. When live context grows too large, old turns become a Summary Segment.
3. Summary Segment stores summary + recall cues + source message IDs.
4. Candidate extractor proposes durable memories from explicit user statements and summaries.
5. User confirms, edits, rejects, or disables candidates.
6. Confirmed memories become Pinned Memory.
7. Each new prompt uses hybrid recall over pinned memories + summary segments.
8. UI shows the small recall set used for this turn.
9. User corrections update or delete pinned memories; raw logs remain intact.
```

## Memory Types

Greyfield should not store every memory as the same shape.

| Type | Example | Write Policy | Recall Bias |
| --- | --- | --- | --- |
| User fact | "User works in Hong Kong timezone." | Candidate + confirm, or explicit user save | High when conversation references schedule/location |
| User preference | "User dislikes being called boss." | Candidate + confirm | High for style/persona prompts |
| Relationship memory | "We decided Hiyori is the default companion." | Candidate + confirm | High for identity/continuity |
| Important event | "On June 26, V1 closeout was reviewed." | Summary-derived candidate | Medium, recency-sensitive |
| Character setting | "Character calls the user by a chosen nickname." | Character card edit | Always available for that character |
| Boundary / taboo | "Do not read screen by default." | Explicit user setting | High priority, keyword + always-on |
| Summary segment | "Conversation from X to Y covered..." | Automatic when trimming context | Semantic recall, lower priority than pinned memory |

## Retrieval Plan

### V2.0 Minimum

Use three recall lanes:

1. Recent context: latest raw turns.
2. Pinned memory: keyword/alias match plus type priority.
3. Summary segment: vector or fallback lexical recall over summaries and recall cues.

Then fuse results by a simple deterministic ranking:

```text
score =
  explicit pin / boundary boost
  + keyword match boost
  + semantic similarity
  + recency boost for summary segments
  - disabled / stale / superseded penalty
```

Do not implement consumption-weighted ranking in V2.0. First make recall visible and correct.

### V2.x Later

Only after enough telemetry exists:

- consumption signals.
- graph relationships.
- cross-character memory federation.
- L2 rollups.
- automatic candidate promotion rules.

## UI Requirements

### Memory Panel

The user should see:

- pinned memories grouped by type.
- pending candidates.
- summary segments.
- source links back to chat turns.
- enabled/disabled state.
- edit/delete/export controls.
- embedding/index status if semantic recall is enabled.

### Per-Turn Recall Feed

During or after a reply, the user should be able to inspect:

- which memories were used.
- whether each item was pinned memory, summary segment, or recent context.
- why it was recalled: keyword, semantic, always-on, recent.
- whether any high-scoring item was skipped due to prompt budget.

This prevents the "black-box RAG" feeling.

## Safety And Privacy Rules

- No silent long-term memory writes in V2.0.
- Every pinned memory must be editable and deletable.
- Every pinned memory must have provenance or be explicitly user-authored.
- Embeddings are optional. If disabled, keyword/lexical recall still works.
- Logs and diagnostic bundles must redact provider secrets and should not include raw private memories unless explicitly exported.
- Character memory and user memory are separate stores.
- Summary segments cannot be treated as verified facts.

## V2.0 Implementation Phases

### V2.0a: Raw Log + Summary Segments

Deliver:

- summary segment schema.
- summary prompt.
- automatic summary when old messages leave live context.
- source message IDs.
- recall cues.
- UI list with "jump to source".

Acceptance:

- A long fake conversation produces one or more summary segments.
- Raw turns remain available.
- Deleting a summary segment does not delete raw chat.
- Summary prompt tests check no fabrication and required fields.

### V2.0b: Memory Candidates + Pinned Memory

Deliver:

- candidate extractor.
- candidate queue UI.
- memory type schema.
- confirm/edit/reject flow.
- pinned memory list.

Acceptance:

- Explicit user preference creates a candidate, not an automatic pinned memory.
- Confirmed memory appears in pinned list and survives restart.
- Rejected memory is not recalled.
- Edited/deleted memory updates recall behavior.

### V2.0c: Hybrid Recall + Recall Feed

Deliver:

- keyword/alias recall for pinned memories.
- vector or lexical fallback recall for summary segments.
- deterministic prompt budget cap.
- per-turn recall feed.

Acceptance:

- Proper noun / taboo memory is recalled by keyword.
- Semantically similar query recalls a summary segment when embeddings are enabled.
- With embeddings disabled, lexical recall still works and UI shows degraded state.
- Recall feed shows memory type, reason, and source.

## Test And Harness Bar

V2.0 is memory-sensitive, so tests must cover both storage and product trust:

- unit tests for schemas and prompt assembly.
- store tests for raw log, summary segment, candidate, pinned memory.
- fake LLM summary/candidate extractor tests.
- renderer tests for Memory Panel state.
- Electron harness for create/edit/delete/recall ordinary user path.
- privacy tests for export/delete/redaction.
- recall fixture tests with expected memories and expected non-recalls.

## Final Product Shape

The user should experience V2.0 as:

> "It remembers me, but I can see what it remembers, correct it, and trace where it came from."

That is the difference between a trustworthy companion memory and a hidden prompt stuffing system.

