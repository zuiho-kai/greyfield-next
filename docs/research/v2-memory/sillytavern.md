# SillyTavern Memory Notes

Snapshot:

- Repository: https://github.com/SillyTavern/SillyTavern
- Commit inspected: `51ad27fb86d39a3daca3adaa970375c9670c12df`
- License: AGPL-3.0
- Purpose of this note: extract product and memory mechanics for Greyfield V2.0. Do not copy code.

## Files Inspected

- `public/scripts/world-info.js`
- `public/scripts/extensions/memory/index.js`
- `public/scripts/extensions/vectors/index.js`
- `src/endpoints/worldinfo.js`
- `src/endpoints/vectors.js`
- `src/vectors/*`

## Core Model

SillyTavern has several separate memory-like systems:

- `World Info` / lorebook: user-authored durable entries activated by keyword, depth, budget, recursion, and filtering rules.
- `Memory` extension: rolling summary injected into the prompt.
- `Vectors` extension: embeddings over chat messages or attached data, with optional summarization before embedding.

This separation matters. It avoids treating all memory as the same thing.

## Mechanisms Worth Reusing

### 1. Lorebook As Explicit Durable Memory

World Info entries are user-controlled. They are not hidden model side effects. Important knobs include:

- primary and secondary keys.
- scan depth.
- case sensitivity / whole-word matching.
- recursive scanning.
- activation budget.
- insertion placement.
- optional scans over persona, character description, scenario, creator notes, or chat.

Greyfield's pinned memory should borrow the controllability, not the exact UI.

### 2. Summary Is A Prompt Component

The Memory extension has a summary prompt and template. It can be frozen, positioned in prompt, and updated at intervals.

This maps to Greyfield's rolling summary:

- summary text is a prompt component, not the whole memory system.
- users need freeze/disable controls.
- summary update cadence should be explicit and inspectable.

### 3. Chat Vectorization Has Operational Controls

The Vectors extension exposes practical controls:

- embedding provider/model selection.
- chunk size.
- score threshold.
- query depth / insertion amount.
- optional message summarization before embedding.
- vectorize-all progress and cancellation conditions.

Greyfield V2.0 should include equivalent operational visibility when embeddings are enabled:

- index status.
- embedding provider health.
- rebuild/progress status.
- clear "disabled/degraded" state.

## Product Lessons

### Keyword And Vector Recall Are Complementary

Keyword recall is strong for proper nouns, fixed facts, forbidden terms, and manually authored lore. Vector recall is strong for fuzzy or semantically similar memory.

Greyfield should not choose one. It should expose:

- pinned memory keywords / aliases.
- vector recall over summary segments and pinned memory.
- hybrid recall with a small visible result list.

### Prompt Budget Is A Product Control

SillyTavern's World Info budget and vector insertion controls show that memory is a prompt-budget problem, not just a storage problem.

Greyfield should show memory budget in user-facing terms:

- how many memories were used this turn.
- whether any were skipped because of budget.
- where the memory appears in the prompt context.

## What Greyfield Should Not Copy Yet

- Full SillyTavern power-user surface. Greyfield is a desktop pet, not a full roleplay frontend.
- AGPL code or UI implementation.
- Recursive lorebook complexity in the first V2.0 pass.
- Hidden vectorization surprises. Greyfield should keep embeddings explicit and diagnosable.

## Greyfield Takeaway

Use a two-lane recall system:

```text
Pinned Memory / Lore
  -> keyword aliases, explicit activation, user-owned editing

Summary Segments / Raw Chat
  -> vector or hybrid recall, source-linked, budgeted prompt insertion
```

The first lane is precise and user-authored. The second lane is fuzzy and evidence-backed.

