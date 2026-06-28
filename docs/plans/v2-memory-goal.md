# V2 Memory Goal

更新时间：2026-06-29

## Goal

Greyfield memory should become a source-linked, user-correctable companion memory system. The merged V2.0 slices are the storage/control foundation; the product roadmap now continues as V2.1 in [Version Product Book](version-product-book.md).

## Plain-Language Product Status

As of current-head `1997fd2d1128fdb697ed64f12a3dc7d1be6ddae8`, V2.1 reaches the minimum MaiBot-style long-chat memory loop, but it is not full memory-product parity.

What the user can trust now:

- Long chats can leave short context as source-linked summary segments instead of being lost.
- Representative facts, preferences, opinions, dates, and scene memories can become source-linked memory atoms and later be recalled.
- A recall can carry source turn IDs and bounded raw source fragments, so the runtime can recover details instead of only using a vague summary.
- Settings Memory can inspect, edit, disable, enable, delete, export, clear current-role atom memory, and keep role memory isolated.
- A low-disturbance proactive memory bubble can be shown on the desktop pet path, with cooldown and disable gates.

What is still partial or post-V2.1:

- Broad semantic/vector recall and a relationship graph are not implemented.
- The desktop runtime still does not gather real weather, virtual-home, screen, or absence signals into a production proactive scheduler.
- Renderer-level source drilldown UI is still incomplete; source fragments are prompt/runtime evidence, not a polished "why I remembered this" panel for every memory.
- LLM-backed atom extraction exists behind explicit runtime modes and scripted benchmark providers, not as a default Settings/desktop product flow.
- Broader privacy classification and hard erasure semantics remain unfinished; atom clear keeps raw turns and summaries.

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

The current V2.1 benchmark locks `summaryRegressionScore: 1`, `recallRegressionScore: 1`, `atomExtractionScore: 0.95`, `atomRecallScore: 0.8`, `proactiveTriggerScore: 1`, `productReadinessScore: 0.56`, and `v21aScenarioScore: 0.54`; the 2026-06-29 current-head output on `1997fd2d1128fdb697ed64f12a3dc7d1be6ddae8` is `summaryRegressionScore: 1`, `recallRegressionScore: 1`, `atomExtractionScore: 1`, `atomRecallScore: 0.86`, `proactiveTriggerScore: 1`, `productReadinessScore: 0.567`, `productReadinessCapabilityScore: 0.574`, and `v21aScenarioScore: 0.551`. Summary and current-role atom Memory Library controls are proved by `pnpm harness:electron:memory-control` and `pnpm harness:electron:memory-atom-library`; proactive desktop display is proved by `pnpm harness:electron:proactive-desktop-message`; `pnpm harness:memory-benchmark` remains a non-UI gate. Calendar-aware atom recall, unrelated weather false-positive rejection, Chinese full-date anniversary extraction, atom source-passage prompt material from vague negative-game cues, prompt material without atom ID/database terminology, scripted LLM atom extraction, invalid LLM fallback, UI/event noise rejection, and pure core rainy virtual-home hotpot proactive trigger gates for long absence, missing virtual-home state, normal weather, recent activity, cooldown, and non-shared scenes are now covered by dynamic benchmark cases. Broad semantic/vector recall, a relationship graph, production environment feeds, default desktop UX for enabling LLM extraction, and renderer-level source drilldown remain below full implementation. Atom clear does not erase raw turns or summaries.

V2.1e.1 adds an internal `RuntimeSceneContext` input model for proactive memory candidates. Callers must explicitly pass scene signals such as weather, location, objects, absence days, and current time; the memory runtime does not read real weather, screen state, OS state, or desktop windows. #116 adds a desktop proactive-message display path for selected memory candidates, while the production scheduler and real scene-signal feed remain follow-up work.

Still incomplete after these V2.1 slices:

- desktop/Settings UX for enabling LLM-backed atom extraction by default.
- broader durable-write privacy classification beyond the current strict noise/secret filters.
- complete relationship dates, rituals, and scene memory coverage.
- production scene-signal collection and scheduler for real weather, virtual-home, screen, and absence context.
- renderer-level source drilldown UI; atom prompt material can already include bounded source fragments.
- LLM-generated summarizer replacement for the extractive draft.
- vector database recall and relationship graph recall.

## V2.1 Product Direction

V2.1 is not a pending-candidate approval product. Users should not review a daily queue before Greyfield can remember. The intended product shape is:

- background LLM extraction for facts, preferences, opinions, boundaries, relationship events, promises, and scene memories.
- explicit save language writes memory directly.
- automatic writes are conservative and source-linked.
- Settings exposes Memory Library controls for inspect, edit, disable, delete, export, and clear.
- trigger recall uses keywords, aliases, semantic cues, calendar dates, environment cues, and source drilldown.
- benchmark cases include anniversary/rose, game critique with raw evidence drilldown, and rainy virtual-home hotpot scene recall.

## V2.1 MaiBot Parity Closeout

The #114 closeout uses "minimum MaiBot-style loop" as the bar: old chat leaves short context, durable memory can be recalled later, source evidence can recover details, and users can correct or remove memory without approving a daily candidate queue. Current-head meets that minimum loop, with clear post-V2.1 leftovers.

| #114 gate | V2.1 status | Current-head evidence | Post-V2.1 remainder |
| --- | --- | --- | --- |
| Long-chat compression | Done | `pnpm harness:memory-benchmark` passes summary regression and long-chat source traceability with source turn IDs and recall cues. | LLM-generated summary replacement can improve quality later, but the minimum source-linked compression loop exists. |
| Structured long-term memory | Partial | Dynamic benchmark cases cover source-linked atoms for preferences, relationship dates, rose preference, game opinion, privacy rule, and rainy virtual-home hotpot scene; invalid LLM output falls back deterministically. | Default Settings/desktop UX for LLM-backed extraction, broader promise/relationship coverage, and stronger privacy classification remain later work. |
| Trigger recall | Partial | Benchmark covers deterministic summary recall, alias/secondary/negative-game cues, calendar recall, false-positive rejection, prompt budget, disabled-memory skips, and pure core proactive scene candidates. | Broad semantic/vector recall, relationship graph recall, and real environment/virtual-home signal feeds remain post-V2.1. |
| Original-text drilldown | Partial | Atom recall can inject bounded raw source fragments from linked turns for the game-review drilldown case, and Memory Library source states are covered by Electron harnesses. | A polished renderer-level drilldown UI for every memory type is still missing. |
| Manageable and degradable | Partial | `pnpm harness:electron:memory-control` and `pnpm harness:electron:memory-atom-library` prove edit, disable, enable, delete, export, current-role atom clear, role isolation, reload persistence, provider-secret exclusion, and no pending-candidate approval UI; no vector database is required. | Atom clear keeps raw turns and summaries, hard erasure semantics are incomplete, and source management is not yet complete for every memory type. |

Issue closeout recommendation after the #114 PR merges:

| Issue | Recommendation | Reason |
| --- | --- | --- |
| #75 | Close for the V2.1 minimum slice; move broad semantic/vector, relationship graph, and full renderer drilldown to V2.2+. | Calendar, alias/secondary, false-positive, prompt-budget, and source-fragment evidence now exists, but the full long-term recall system is still larger than V2.1. |
| #76 | Close for the V2.1 minimum slice; move production scene-feed scheduler and real external weather/virtual-home integration to V2.2+. | Core scene candidates and desktop proactive bubble display are proved, but real signal collection is not implemented. |
| #77 | Close for the V2.1 minimum slice; move full erasure semantics and complete source-management UX to V2.2+. | Memory Library management is user-visible and harnessed for summary/current-role atoms, while broader privacy/deletion behavior remains partial. |
| #79 | Close after #114 merges if maintainers accept this minimum-loop definition. | The roadmap has reached a documented closeout decision; remaining ideas should become narrower V2.2+ issues instead of keeping V2.1 open indefinitely. |
| #114 | Close with this docs/evidence PR. | The close condition is a merged closeout PR with current-head evidence and explicit post-V2.1 boundaries. |

## Verification

Current memory verification:

```bash
pnpm typecheck
pnpm test:backend
pnpm test:frontend
pnpm harness:memory-benchmark
pnpm harness:electron:memory-control
pnpm harness:electron:memory-atom-library
pnpm harness:electron:proactive-desktop-message
pnpm harness:frontend-full
```

CI guard:

- `pnpm harness:memory-benchmark` runs in Fast checks, so memory summary/recall quality is guarded even when a PR does not trigger `frontend-full`.
- The memory benchmark fixture is the required V2.0 acceptance gate for future memory feature PRs.
- The benchmark fixture records `baselineScores`; future memory PRs may raise or intentionally update those baselines, but they must not silently degrade below them.
- CI uploads the benchmark JSON summary from `.cache/greyfield-memory-benchmark/latest/summary.json`, so PR review can compare actual scores instead of only reading pass/fail status.
- `pnpm harness:electron:memory-summary` runs `packages/dev-harness/src/electron-memory-summary-check.ts` and keeps the V2.0a persistence path stable; `pnpm harness:electron:memory-control` runs `packages/dev-harness/src/electron-memory-control-check.ts` as a separate gate for edit, disable, delete, and export.
- `frontend-full-check.ts` runs `pnpm harness:electron:memory-control`, so baseline frontend-visible memory-control regressions are covered by the aggregate gate.
- #114 current-head evidence on `1997fd2d1128fdb697ed64f12a3dc7d1be6ddae8` passed `pnpm typecheck`, `pnpm harness:memory-benchmark`, `pnpm harness:electron:memory-control`, `pnpm harness:electron:memory-atom-library`, and `pnpm harness:electron:proactive-desktop-message`. The docs-only closeout PR does not change runtime behavior.
- Earlier main run `28289995890` on head `731f951` passed Fast checks, including `pnpm harness:memory-benchmark`, and `frontend-full`, including the memory-control harness with `memoryEditVisible: true`, `memoryExportVisible: true`, `disabledMemorySkipped: true`, `deletedMemoryKeptRawTurns: true`, and `summaryIncludesSourceTurns: true`.
