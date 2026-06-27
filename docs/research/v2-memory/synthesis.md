# Greyfield V2.1 Memory Synthesis

更新时间：2026-06-28

This document distills the memory lessons from:

- [Clowder AI](clowder-ai.md)
- [SillyTavern](sillytavern.md)
- [MaiBot](maibot.md)

It is a product/architecture synthesis for Greyfield V2.1 memory. The detailed roadmap lives in [Version Product Book](../../plans/version-product-book.md).

## One-Sentence Direction

Greyfield memory should feel like shared history, not a debug panel:

```text
Raw chat stays intact.
Summary compresses long context.
LLM extraction writes source-linked memory atoms.
Trigger recall uses keywords, semantics, dates, environment, and scene cues.
Source drilldown recovers original detail when summary is not enough.
Users can inspect, correct, delete, export, or disable memory.
```

## Reference Takeaways

| Reference | Useful Lesson | Greyfield Rule |
| --- | --- | --- |
| Clowder AI | Raw conversation remains recoverable even after summary | Never replace original turns with summaries. |
| SillyTavern | Lorebook/World Info triggers make memory appear at the right moment | Memory needs trigger keys, aliases, secondary cues, and insertion rules. |
| MaiBot | Long chat memory should become structured concepts/relationships, not only text blobs | Use LLM extraction for atoms and scene memories. |

## Core Abstractions

| Abstraction | Meaning | Required Fields |
| --- | --- | --- |
| Raw Chat Turn | Original user/assistant message | `turnId`, `sessionId`, `role`, `text`, `createdAt` |
| Summary Segment | Compressed episode for token budget | `summary`, `sourceTurnIds`, `recallCues`, `timeRange` |
| Memory Atom | Durable fact/opinion/preference/event/promise | `type`, `naturalText`, `structured`, `triggerKeys`, `sourceTurnIds` |
| Scene Memory | Shared emotional scene | `place`, `weather`, `objects`, `mood`, `relationshipMeaning`, `sourceTurnIds` |
| Trigger Rule | Why memory should be recalled | `exactKeys`, `aliases`, `semanticCues`, `calendar`, `environment`, `priority` |
| Recall Trace | What entered the prompt and why | `memoryId`, `reason`, `sourceTurnIds`, `budgetDecision` |

## Data Flow

```text
1. User/assistant turns append to Raw Chat Log.
2. Older turns are summarized into source-linked Summary Segments.
3. LLM extractor scans new turns and summaries for durable Memory Atoms and Scene Memories.
4. Explicit save language writes memory immediately.
5. Background extraction writes only when importance, confidence, cooldown, and dedupe pass.
6. Each prompt recalls recent turns + relevant atoms + relevant summaries.
7. If an atom is too compressed for the current question, Source Drilldown fetches raw turns.
8. Settings Memory Library lets the user inspect, edit, disable, delete, and export.
```

## Memory Types

| Type | Example | Trigger Style |
| --- | --- | --- |
| User fact | "User works in Hong Kong timezone." | schedule/location mentions |
| Preference | "User dislikes being called boss." | style/persona prompt assembly |
| Opinion | "User strongly disliked xxx game because of pacing, monetization, and story." | target name, similar game, negative comparison |
| Boundary | "Do not read screen by default." | always-on guard |
| Relationship event | "2026-06-28 was our first meeting day." | date, anniversary, user asks about today |
| Promise / ritual | "Give a rose or gift on the yearly anniversary." | yearly calendar trigger |
| Scene memory | "Rainy virtual home, open window, hotpot together." | rain, home, window, hotpot, long absence |
| Summary segment | "The last work session focused on V1 voice QA." | semantic/lexical recall with lower priority |

## Explicit Examples

### Anniversary / Rose

User says:

```text
今天是我们第一次遇到的日子。我送你一朵玫瑰，明年也记得送我礼物或者玫瑰。
```

The extractor should create a relationship memory:

```json
{
  "type": "relationship_event",
  "naturalText": "2026-06-28 is the first meeting anniversary; the user gave a rose and expects a rose or gift every year.",
  "structured": {
    "event": "first_meeting_anniversary",
    "eventDate": "2026-06-28",
    "recurrence": "yearly",
    "ritualAction": ["rose", "gift"]
  },
  "triggerKeys": ["第一次遇到", "纪念日", "玫瑰", "礼物"],
  "sourceTurnIds": ["..."]
}
```

On 2027-06-28, calendar recall should bring this into context even if the user does not repeat the exact words.

### Game Critique With Source Drilldown

User says a game is bad and lists detailed reasons. The durable atom can stay short:

```json
{
  "type": "opinion",
  "naturalText": "The user strongly disliked xxx game and compared future bad games against it.",
  "structured": {
    "target": "xxx_game",
    "sentiment": "strong_negative",
    "reasonSummary": ["pacing", "monetization", "story"]
  },
  "triggerKeys": ["xxx", "游戏", "很傻逼", "缺点"],
  "sourceTurnIds": ["turn-1", "turn-2", "turn-3"]
}
```

If the user later says another game feels similar, the atom should recall first, then Source Drilldown should fetch the original turns to recover concrete details.

### Rainy Home Hotpot Scene

User describes:

```text
某天下雨，我们在虚拟世界的家里开着窗吃火锅。
```

The extractor should create a scene memory:

```json
{
  "type": "episodic_scene",
  "naturalText": "A shared rainy virtual-home scene: open window, hotpot, quiet intimate mood.",
  "structured": {
    "place": "virtual_home",
    "weather": "rain",
    "objects": ["window", "hotpot"],
    "mood": ["quiet", "intimate", "nostalgic"],
    "relationshipMeaning": "shared_memory"
  },
  "triggerKeys": ["下雨", "窗", "火锅", "家", "很久没回来"],
  "sourceTurnIds": ["..."]
}
```

If the virtual world is raining and the user has been absent for a long time, proactive recall may generate a low-frequency message in character voice.

## Retrieval Plan

Use multiple recall lanes, then fuse with budget:

1. Recent raw turns.
2. High-priority boundaries and explicit user saves.
3. Keyword/alias trigger for memory atoms.
4. Semantic recall over atom text, cues, and summaries.
5. Calendar recall for anniversaries, birthdays, promises, and rituals.
6. Environment recall for scene cues such as rain, home, window, and long absence.
7. Source drilldown when the recalled atom is relevant but lacks detail.

Prompt injection must record why each item was included or skipped.

## UI Requirements

The user should not see a daily pending-candidate approval queue.

Settings should provide a Memory Library:

- grouped memory list: facts, preferences, opinions, relationship, events, scenes, summaries.
- natural-language memory text.
- source links back to chat turns.
- last used time and recall reason.
- edit, disable, delete, export, and clear controls.
- character/user/session isolation.

Per-turn recall trace can be a debug or advanced view, not the primary product surface.

## Safety And Privacy Rules

- Explicit save language must write memory.
- Background writes require importance, confidence, dedupe, and cooldown.
- All durable memory must have provenance or be user-authored.
- Users can edit, disable, delete, export, or turn off memory.
- Embeddings are optional; lexical recall must still work.
- Diagnostic bundles redact provider secrets and do not include raw private memory unless explicitly exported.
- Screen captures do not become long-term memory unless the user explicitly saves them.
- Character memory and user memory are separate stores.
- Summary segments are compressed evidence, not verified facts.

## Test And Harness Bar

Memory work is not complete without benchmark evidence:

- extraction cases for explicit save, anniversary/rose, game critique, and rainy home hotpot scene.
- trigger cases for keyword, alias, semantic, calendar, environment, and false positives.
- source drilldown cases that require raw-turn details.
- privacy cases for disable/delete/export and secret redaction.
- role isolation cases.
- prompt budget cases where skipped memories are reported.

The benchmark should start low while features are missing, then raise baselines as real capability lands.

## Final Product Shape

The user should experience V2.1 as:

> "It remembers what we lived through together, can naturally bring it back later, and lets me correct or delete anything wrong."
