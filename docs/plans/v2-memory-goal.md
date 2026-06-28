# V2 Memory Goal

更新时间：2026-06-28

## Goal

Greyfield memory should become a source-linked, user-correctable companion memory system. The merged V2.0 slices are the storage/control foundation; the product roadmap now continues as V2.1 in [Version Product Book](version-product-book.md).

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
- durable memory extraction cases that later Memory Atom work must satisfy.
- UI/event noise rejection.
- disabled memory not being injected.
- conflict/update ranking where a corrected newer memory wins within budget.
- false-positive rejection for unrelated inputs.
- prompt visibility of reason and source turns.
- prompt character budget skips that report the skipped item and reason.

V2.1 work must extend this fixture before claiming memory atom extraction, scene memory, calendar recall, evidence drilldown, memory layering, or vector recall quality. A feature can add a new recall engine later, but it must keep the benchmark passing or explain the updated acceptance fixture in the same PR.

The current V2.1 benchmark locks `summaryRegressionScore: 1`, `recallRegressionScore: 1`, `atomExtractionScore: 0.95`, `atomRecallScore: 0.8`, `proactiveTriggerScore: 1`, `productReadinessScore: 0.56`, and `v21aScenarioScore: 0.54`; the computed output is `atomExtractionScore: 1`, `atomRecallScore: 0.8`, `proactiveTriggerScore: 1`, `productReadinessScore: 0.567`, `productReadinessCapabilityScore: 0.574`, and `v21aScenarioScore: 0.551`. Summary and current-role atom Memory Library controls are proved by `pnpm harness:electron:memory-control`, `pnpm harness:electron:memory-atom-library`, and `pnpm harness:frontend-full`; `pnpm harness:memory-benchmark` remains a non-UI gate. Calendar-aware atom recall, unrelated weather false-positive rejection, Chinese full-date anniversary extraction, atom source-passage prompt material from vague negative-game cues, prompt material without atom ID/database terminology, scripted LLM atom extraction, invalid LLM fallback, UI/event noise rejection, and pure core rainy virtual-home hotpot proactive trigger gates for long absence, missing virtual-home state, normal weather, recent activity, cooldown, and non-shared scenes are now covered by dynamic benchmark cases, while desktop proactive scheduling, external weather integration, semantic recall, default desktop UX for enabling LLM extraction, and renderer-level source drilldown remain below full implementation. Atom clear does not erase raw turns or summaries.

Still incomplete after these V2.1 slices:

- desktop/Settings UX for enabling LLM-backed atom extraction by default.
- broader durable-write privacy classification beyond the current strict noise/secret filters.
- complete relationship dates, rituals, and scene memory coverage.
- environment trigger recall in the desktop runtime and desktop proactive scheduling.
- renderer-level source drilldown UI; atom prompt material can already include bounded source fragments.
- LLM-generated summarizer replacement for the extractive draft.
- vector database recall.

## V2.1 Product Direction

V2.1 is not a pending-candidate approval product. Users should not review a daily queue before Greyfield can remember. The intended product shape is:

- background LLM extraction for facts, preferences, opinions, boundaries, relationship events, promises, and scene memories.
- explicit save language writes memory directly.
- automatic writes are conservative and source-linked.
- Settings exposes Memory Library controls for inspect, edit, disable, delete, export, and clear.
- trigger recall uses keywords, aliases, semantic cues, calendar dates, environment cues, and source drilldown.
- benchmark cases include anniversary/rose, game critique with raw evidence drilldown, and rainy virtual-home hotpot scene recall.

## Verification

Current memory verification:

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
- CI uploads the benchmark JSON summary from `.cache/greyfield-memory-benchmark/latest/summary.json`, so PR review can compare actual scores instead of only reading pass/fail status.
- `pnpm harness:electron:memory-summary` and `pnpm harness:electron:memory-control` currently share `packages/dev-harness/src/electron-memory-summary-check.ts`; the former keeps the V2.0a summary foundation entrypoint stable, while the latter names the V2.0b edit/disable/delete/export gate.
- `frontend-full-check.ts` runs `pnpm harness:electron:memory-control`, so frontend-visible memory regressions are covered by the aggregate gate.
- Main run `28289995890` on head `731f951` passed Fast checks, including `pnpm harness:memory-benchmark`, and `frontend-full`, including the memory-control harness with `memoryEditVisible: true`, `memoryExportVisible: true`, `disabledMemorySkipped: true`, `deletedMemoryKeptRawTurns: true`, and `summaryIncludesSourceTurns: true`.
