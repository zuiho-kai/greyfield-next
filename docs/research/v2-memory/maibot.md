# MaiBot Memory Notes

Snapshot:

- Repository: https://github.com/Mai-with-u/MaiBot
- Commit inspected: `2fcb086751268be16a9ba6012c05e0390a8da8da`
- License: GPL-3.0
- Purpose of this note: extract memory-system lessons for Greyfield V2.0. Do not copy code.

## Files Inspected

- `src/A_memorix/RELEASE_SUMMARY_1.0.0.md`
- `src/A_memorix/core/runtime/sdk_memory_kernel.py`
- `src/maisaka/memory/mid_term.py`
- `prompts/zh-CN/mid_term_memory_summary.prompt`
- Related tree paths under `src/A_memorix/core/*`, `pytests/A_memorix_test/*`, `dashboard/src/components/memory/*`.

## Core Model

MaiBot has two relevant memory lines:

- `A_Memorix`: a dedicated memory subsystem with vector store, graph store, metadata store, relation/profile services, episode services, retrieval tuning, self-checks, migrations, and web UI.
- `maisaka mid-term memory`: a chat-context compression mechanism that turns trimmed chat history into a memory message with `summary` and `recall_cues`.

## Mechanisms Worth Reusing

### 1. Mid-Term Memory From Trimmed Context

`mid_term.py` builds memory from messages that are about to be cut from short-term context. The generated payload includes:

- time range.
- participants.
- summary.
- recall cues.
- source messages.
- optional embeddings for recall cues.

This is a direct fit for Greyfield:

```text
messages leaving live context -> summary segment + recall cues + source ids
```

The prompt explicitly asks recall cues to describe future situations where the information may be useful. That is stronger than simple keyword extraction.

### 2. Recall Cues Are First-Class

MaiBot does not only store a summary. It asks the model to produce `recall_cues`: natural-language retrieval handles for later semantic matching.

Greyfield should store both:

- `summary`: what happened.
- `recallCues`: when and why this should be recalled.

### 3. Memory Messages Are Distinct From Normal Chat

Maisaka uses distinct message types/source kinds for mid-term memory and memory reference messages. That prevents compressed memory from pretending to be a normal user/assistant turn.

Greyfield should do the same:

- raw chat turn.
- summary segment.
- recalled memory reference.
- pinned memory.

These should be different records and different UI concepts.

### 4. Runtime Self-Checks And Degraded Mode

A_Memorix includes runtime self-checks, embedding dimension detection, vector rebuild status, metadata-only write fallback, and vector backfill queues.

Greyfield V2.0 can start smaller, but should preserve the product rule:

- embedding unavailable must be visible.
- metadata writes can continue when vectors are degraded.
- vector rebuild/backfill status should be inspectable.

## Product Lessons

### Episode Memory Is More Than A Flat Fact List

A_Memorix release notes call out episodes, episode paragraphs, pending paragraphs, segmentation, retrieval service, graph relation recall, and aggregate query. The lesson is that long memory often needs event/episode structure, not only facts.

For Greyfield V2.0:

- "Important event" should be a memory type.
- Event memory can link to people, preferences, and relationship state.
- Full graph relation recall can wait until V2.x.

### Summary Quality Matters

The mid-term summary prompt asks for topic flow, positions, conclusions, TODOs, and important details. It also says not to fabricate and to preserve message-boundary context.

Greyfield's summary prompt should be similarly strict and testable.

## What Greyfield Should Not Copy Yet

- A_Memorix's full graph/profile/relation stack in V2.0.
- Heavy migration and tuning UI before the basic user memory loop exists.
- Silent automatic long-term memory writes.
- GPL code.

## Greyfield Takeaway

MaiBot's most useful V2.0 abstraction is:

```text
Context Trim Event
  -> Summary Segment
       summary
       recallCues
       participants
       timeRange
       sourceMessageIds
       optional cue embeddings
  -> Later Recall Reference
```

This gives Greyfield a practical path to avoid context overflow while preserving enough handles for future recall.

