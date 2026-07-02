import { describe, expect, it, vi } from "vitest";
import { GreyfieldRuntime } from "../runtime-loop";
import { InMemorySessionStore } from "../session-store";
import type { AppendSessionTurn, SessionHandoff, SessionStore, SessionTurn } from "../session-store";
import { normalizeSummarySegment, type SummarySegmentStore } from "../memory-context";
import type { AppendDeletedMemoryEvidence, DeletedMemoryEvidence, DeletedMemoryEvidenceStore } from "../memory-erasure";
import type { MemoryAtom, MemoryAtomStore, UpdateMemoryAtom } from "../memory-atoms";
import type { LLMProvider, MemoryStore, TTSProvider } from "../providers";
import type { RuntimeOutputEvent } from "../events";
import type { RuntimeImageAttachment } from "../vision-attachments";
import { filterDistinctObservationFrames } from "../vision-attachments";

const memoryStore: MemoryStore = {
  load: async () => "- Prefers direct progress over vague planning.",
  save: async () => undefined,
  consolidate: async () => "- Prefers direct progress over vague planning."
};

describe("GreyfieldRuntime", () => {
  it("streams text deltas, synthesizes complete sentences, and records the turn", async () => {
    const synthesized: string[] = [];
    const llm: LLMProvider = {
      stream: async function* () {
        yield "Hello there. ";
        yield "I am awake.";
      }
    };
    const tts: TTSProvider = {
      synthesize: async (text) => {
        synthesized.push(text);
        return new Uint8Array([text.length]);
      }
    };
    const sessionStore = new InMemorySessionStore("session-a");
    const runtime = new GreyfieldRuntime({
      llm,
      tts,
      memoryStore,
      sessionStore,
      persona: { name: "Greyfield", tone: "alive", boundaries: [], expressionMap: {} },
      voice: "default"
    });
    const events: RuntimeOutputEvent[] = [];

    await runtime.handle({ type: "text.input", text: "Are you there?" }, (event) => {
      events.push(event);
    });

    expect(events.map((event) => event.type)).toContain("assistant.text.delta");
    expect(events).toContainEqual({ type: "assistant.text.final", text: "Hello there. I am awake." });
    expect(events.some((event) => event.type === "assistant.audio.chunk")).toBe(true);
    expect(synthesized).toEqual(["Hello there.", "I am awake."]);
    expect(await sessionStore.getRecent(2)).toMatchObject([
      { role: "user", content: "Are you there?" },
      { role: "assistant", content: "Hello there. I am awake." }
    ]);
  });

  it("sends a temporary screenshot to a vision-capable provider without persisting image data", async () => {
    let capturedMessages: Parameters<LLMProvider["stream"]>[0] = [];
    const sessionStore = new InMemorySessionStore("session-vision");
    const runtime = new GreyfieldRuntime({
      llm: {
        stream: async function* () {
          throw new Error("Chat model should not receive image input.");
        }
      },
      visionLlm: {
        supportsVision: true,
        stream: async function* (messages) {
          capturedMessages = messages;
          yield "I can answer from the screenshot.";
        }
      },
      tts: { synthesize: async (text) => new Uint8Array([text.length]) },
      memoryStore,
      sessionStore,
      persona: { name: "Greyfield", tone: "alive", boundaries: [], expressionMap: {} },
      voice: "default",
      threadId: "thread-vision"
    });
    const events: RuntimeOutputEvent[] = [];

    await runtime.handle(
      {
        type: "text.input",
        text: "看一下这个画面",
        attachments: [makeImageAttachment("frame-1", "screenshot", "A")],
        observation: { id: "obs-a", mode: "single", frameCount: 1, dedupedFrameCount: 1 }
      },
      (event) => {
        events.push(event);
      }
    );

    expect(capturedMessages.at(-1)?.content).toEqual([
      { type: "text", text: "看一下这个画面" },
      { type: "image_url", image_url: { url: expect.stringContaining("data:image/png;base64,"), detail: "high" } }
    ]);
    expect(events).toContainEqual({
      type: "observation.used",
      observation: {
        kind: "visual-observation",
        mode: "single",
        frameCount: 1,
        dedupedFrameCount: 1,
        source: "user-active-screenshot"
      }
    });
    const turns = await sessionStore.getRecent(2);
    expect(JSON.stringify(turns)).not.toContain("data:image");
    expect(turns[0]).toMatchObject({
      role: "user",
      content: "看一下这个画面",
      meta: {
        observation: {
          kind: "visual-observation",
          source: "user-active-screenshot"
        }
      }
    });
  });

  it("uses short observation key frames for a vision-capable provider", async () => {
    let capturedMessages: Parameters<LLMProvider["stream"]>[0] = [];
    const runtime = new GreyfieldRuntime({
      llm: {
        stream: async function* () {
          throw new Error("Chat model should not receive image input.");
        }
      },
      visionLlm: {
        supportsVision: true,
        stream: async function* (messages) {
          capturedMessages = messages;
          yield "I saw the sequence.";
        }
      },
      tts: { synthesize: async (text) => new Uint8Array([text.length]) },
      memoryStore,
      sessionStore: new InMemorySessionStore("session-sequence"),
      persona: { name: "Greyfield", tone: "alive", boundaries: [], expressionMap: {} },
      voice: "default"
    });

    await runtime.handle(
      {
        type: "text.input",
        text: "看一会发生了什么",
        attachments: [
          makeImageAttachment("frame-1", "observation-frame", "A"),
          makeImageAttachment("frame-2", "observation-frame", "B")
        ],
        observation: { id: "obs-sequence", mode: "normal", frameCount: 3, dedupedFrameCount: 2, durationMs: 6000 }
      },
      () => undefined
    );

    const content = capturedMessages.at(-1)?.content;
    expect(Array.isArray(content) ? content.filter((part) => part.type === "image_url") : []).toHaveLength(2);
    expect(capturedMessages[0]?.content).toContain("Temporary visual observation:");
    expect(capturedMessages[0]?.content).toContain("Frames sent this turn: 2 of 3.");
    expect(JSON.stringify(capturedMessages)).toContain("data:image/png;base64,");
  });

  it("uses desktop screen awareness metadata without persisting raw frame data", async () => {
    let capturedMessages: Parameters<LLMProvider["stream"]>[0] = [];
    const sessionStore = new InMemorySessionStore("session-screen-awareness");
    const runtime = new GreyfieldRuntime({
      llm: {
        stream: async function* () {
          throw new Error("Chat model should not receive screen awareness image input.");
        }
      },
      visionLlm: {
        supportsVision: true,
        stream: async function* (messages) {
          capturedMessages = messages;
          yield "I used the recent desktop visual context.";
        }
      },
      tts: { synthesize: async (text) => new Uint8Array([text.length]) },
      memoryStore,
      sessionStore,
      persona: { name: "Greyfield", tone: "alive", boundaries: [], expressionMap: {} },
      voice: "default",
      threadId: "thread-screen-awareness"
    });

    await runtime.handle(
      {
        type: "text.input",
        text: "桌面上是什么？",
        attachments: [makeImageAttachment("screen-frame-1", "observation-frame", "screen")],
        observation: {
          id: "screen-1",
          mode: "normal",
          frameCount: 1,
          dedupedFrameCount: 1,
          source: "desktop-screen-awareness"
        }
      },
      () => undefined
    );

    expect(capturedMessages[0]?.content).toContain("recent desktop visual context from Screen awareness mode");
    const turns = await sessionStore.getRecent(2);
    expect(JSON.stringify(turns)).not.toContain("data:image");
    expect(turns[0]).toMatchObject({
      role: "user",
      content: "桌面上是什么？",
      meta: {
        observation: {
          source: "desktop-screen-awareness"
        }
      }
    });
  });

  it("routes visual turns to the Vision model and ordinary text to the Chat model", async () => {
    let chatCalls = 0;
    let visionCalls = 0;
    const runtime = new GreyfieldRuntime({
      llm: {
        stream: async function* () {
          chatCalls += 1;
          yield "Chat reply.";
        }
      },
      visionLlm: {
        supportsVision: true,
        stream: async function* () {
          visionCalls += 1;
          yield "Vision reply.";
        }
      },
      tts: { synthesize: async (text) => new Uint8Array([text.length]) },
      memoryStore,
      sessionStore: new InMemorySessionStore("session-routing"),
      persona: { name: "Greyfield", tone: "alive", boundaries: [], expressionMap: {} },
      voice: "default"
    });

    await runtime.handle({ type: "text.input", text: "普通聊天" }, () => undefined);
    await runtime.handle(
      {
        type: "text.input",
        text: "看一下",
        attachments: [makeImageAttachment("frame-1", "screenshot", "A")]
      },
      () => undefined
    );

    expect(chatCalls).toBe(1);
    expect(visionCalls).toBe(1);
  });

  it("degrades clearly when screen awareness context reaches a provider without vision", async () => {
    let streamCalled = false;
    const sessionStore = new InMemorySessionStore("session-screen-awareness-no-vision");
    const runtime = new GreyfieldRuntime({
      llm: {
        stream: async function* () {
          streamCalled = true;
          yield "Should not run.";
        }
      },
      tts: { synthesize: async (text) => new Uint8Array([text.length]) },
      memoryStore,
      sessionStore,
      persona: { name: "Greyfield", tone: "alive", boundaries: [], expressionMap: {} },
      voice: "default"
    });
    const events: RuntimeOutputEvent[] = [];

    await runtime.handle(
      {
        type: "text.input",
        text: "桌面上是什么？",
        attachments: [makeImageAttachment("screen-frame-1", "observation-frame", "screen")],
        observation: {
          id: "screen-1",
          mode: "normal",
          frameCount: 1,
          dedupedFrameCount: 1,
          source: "desktop-screen-awareness"
        }
      },
      (event) => {
        events.push(event);
      }
    );

    expect(streamCalled).toBe(false);
    expect(events).toContainEqual({
      type: "error",
      message:
        "Screen awareness needs a ready Vision model before Greyfield can use visual context. Greyfield kept the screenshot temporary and did not send it to the Chat model."
    });
    expect(await sessionStore.getRecent(2)).toEqual([]);
  });

  it("degrades clearly when the provider does not support vision", async () => {
    let streamCalled = false;
    const sessionStore = new InMemorySessionStore("session-no-vision");
    const runtime = new GreyfieldRuntime({
      llm: {
        stream: async function* () {
          streamCalled = true;
          yield "Should not run.";
        }
      },
      tts: { synthesize: async (text) => new Uint8Array([text.length]) },
      memoryStore,
      sessionStore,
      persona: { name: "Greyfield", tone: "alive", boundaries: [], expressionMap: {} },
      voice: "default"
    });
    const events: RuntimeOutputEvent[] = [];

    await runtime.handle(
      {
        type: "text.input",
        text: "看一下",
        attachments: [makeImageAttachment("frame-1", "screenshot", "A")]
      },
      (event) => {
        events.push(event);
      }
    );

    expect(streamCalled).toBe(false);
    expect(events).toContainEqual({
      type: "error",
      message:
        "Screen awareness needs a ready Vision model before Greyfield can use visual context. Greyfield kept the screenshot temporary and did not send it to the Chat model."
    });
    expect(await sessionStore.getRecent(2)).toEqual([]);
  });

  it("filters duplicate observation frames and caps high frequency input", () => {
    const result = filterDistinctObservationFrames(
      [
        { id: "a", dataUrl: "data:image/png;base64,A", hash: "same" },
        { id: "b", dataUrl: "data:image/png;base64,B", hash: "same" },
        { id: "c", dataUrl: "data:image/png;base64,C", hash: "c" },
        { id: "d", dataUrl: "data:image/png;base64,D", hash: "d" }
      ],
      { maxFrames: 2 }
    );

    expect(result.frames.map((frame) => frame.id)).toEqual(["a", "c"]);
    expect(result.duplicateCount).toBe(1);
    expect(result.truncated).toBe(true);
  });

  it("injects recalled summary segments into the LLM prompt when a summary store is configured", async () => {
    let capturedMessages: Parameters<LLMProvider["stream"]>[0] = [];
    const summarySegmentStore: SummarySegmentStore = {
      append: async () => {
        throw new Error("not used");
      },
      get: async () => null,
      update: async () => null,
      delete: async () => false,
      list: async () => [
        normalizeSummarySegment({
          id: "summary-1",
          threadId: "thread-a",
          sessionId: "session-a",
          summary: "Earlier conversation established Hiyori as the preferred Live2D model.",
          recallCues: ["hiyori", "live2d"],
          sourceTurns: [
            {
              sessionId: "session-a",
              turnId: "session-a-1",
              role: "user",
              createdAt: "2026-06-26T01:00:00.000Z"
            }
          ],
          createdAt: "2026-06-26T01:00:01.000Z"
        })
      ]
    };
    const runtime = new GreyfieldRuntime({
      llm: {
        stream: async function* (messages) {
          capturedMessages = messages;
          yield "Hiyori remains preferred.";
        }
      },
      tts: { synthesize: async (text) => new Uint8Array([text.length]) },
      memoryStore,
      summarySegmentStore,
      sessionStore: new InMemorySessionStore("session-a"),
      persona: { name: "Greyfield", tone: "alive", boundaries: [], expressionMap: {} },
      voice: "default",
      threadId: "thread-a"
    });
    const events: RuntimeOutputEvent[] = [];

    await runtime.handle({ type: "text.input", text: "Hiyori 还是默认模型吗？" }, (event) => {
      events.push(event);
    });

    expect(capturedMessages[0]?.content).toContain("Recall context:");
    expect(capturedMessages[0]?.content).toContain("summary-1");
    expect(capturedMessages[0]?.content).toContain("Source turns: session-a-1");
    expect(events).toContainEqual(
      expect.objectContaining({
        type: "memory.recall.context",
        context: expect.objectContaining({
          items: [expect.objectContaining({ id: "summary-1", reason: "cue:hiyori" })]
        })
      })
    );
  });

  it("preserves the session store handoff summary when it does not contain filtered turn content", async () => {
    let capturedMessages: Parameters<LLMProvider["stream"]>[0] = [];
    let sequence = 0;
    const sessionStore: SessionStore = {
      sessionId: "session-compact-handoff",
      append: async (turn: AppendSessionTurn): Promise<SessionTurn> => {
        sequence += 1;
        return {
          id: `session-compact-handoff-${sequence}`,
          role: turn.role,
          content: turn.content,
          createdAt: turn.createdAt ?? "2026-06-29T00:00:00.000Z",
          meta: turn.meta
        };
      },
      getRecent: async () => [],
      createHandoff: async (): Promise<SessionHandoff> => ({
        sessionId: "session-compact-handoff",
        summary: "COMPACT_HANDOFF_SUMMARY_FROM_STORE",
        turns: [
          {
            id: "session-compact-handoff-old",
            role: "user",
            content: "raw old turn text should not replace the store handoff summary",
            createdAt: "2026-06-28T00:00:00.000Z"
          }
        ]
      })
    };
    const runtime = new GreyfieldRuntime({
      llm: {
        stream: async function* (messages) {
          capturedMessages = messages;
          yield "Store summary preserved.";
        }
      },
      tts: { synthesize: async (text) => new Uint8Array([text.length]) },
      memoryStore,
      sessionStore,
      persona: { name: "Greyfield", tone: "alive", boundaries: [], expressionMap: {} },
      voice: "default",
      threadId: "thread-compact-handoff"
    });

    await runtime.handle({ type: "text.input", text: "继续" }, () => undefined);

    const system = capturedMessages[0]?.content ?? "";
    expect(system).toContain("Recent handoff:\nCOMPACT_HANDOFF_SUMMARY_FROM_STORE");
    expect(system).not.toContain("raw old turn text should not replace");
  });

  it("extracts memory atoms after a successful turn and recalls them into later prompts", async () => {
    const memoryAtomStore = new TestMemoryAtomStore();
    const sessionStore = new InMemorySessionStore("session-atoms");
    let capturedMessages: Parameters<LLMProvider["stream"]>[0] = [];
    const runtime = new GreyfieldRuntime({
      llm: {
        stream: async function* (messages) {
          capturedMessages = messages;
          yield "I will remember that.";
        }
      },
      tts: { synthesize: async (text) => new Uint8Array([text.length]) },
      memoryStore,
      memoryAtomStore,
      sessionStore,
      persona: { name: "Greyfield", tone: "alive", boundaries: [], expressionMap: {} },
      voice: "default",
      threadId: "thread-atoms"
    });

    await runtime.handle(
      { type: "text.input", text: "今天是我们第一次遇见的纪念日，记住我送你一朵玫瑰，以后每年提醒我。" },
      () => undefined
    );

    const storedAtoms = await memoryAtomStore.list("thread-atoms");
    expect(storedAtoms).toHaveLength(1);
    expect(storedAtoms[0]).toMatchObject({
      type: "relationship_event",
      sourceTurnIds: ["session-atoms-1"],
      ritualAction: "送玫瑰"
    });

    await runtime.handle({ type: "text.input", text: "初遇纪念日要准备什么？" }, () => undefined);

    expect(capturedMessages[0]?.content).toContain("Long-term recall context:");
    expect(capturedMessages[0]?.content).toContain("Source-linked relationship memory");
    expect(capturedMessages[0]?.content).not.toContain("memory-atom");
    expect(capturedMessages[0]?.content).not.toContain(storedAtoms[0]?.id);
    expect(capturedMessages[0]?.content).toContain("Source turns: session-atoms-1");
    expect(capturedMessages[0]?.content).toContain("Ritual action: 送玫瑰");
  });

  it("can run hybrid LLM-backed atom extraction through the runtime without network access", async () => {
    const memoryAtomStore = new TestMemoryAtomStore();
    const sessionStore = new InMemorySessionStore("session-llm-atoms");
    const runtime = new GreyfieldRuntime({
      llm: {
        stream: async function* (messages) {
          if (messageContentText(messages[0]?.content).includes("You extract Greyfield long-term memory atoms")) {
            yield JSON.stringify({
              atoms: [
                {
                  type: "preference",
                  text: "User likes red roses as a meaningful flower.",
                  importance: 0.86,
                  object: "rose",
                  triggers: {
                    exact: ["红玫瑰", "玫瑰"],
                    aliases: ["喜欢的花", "花"],
                    secondary: ["rose"]
                  },
                  metadata: { preferenceType: "flower", color: "red" }
                }
              ]
            });
            return;
          }
          yield "I will remember that.";
        }
      },
      tts: { synthesize: async (text) => new Uint8Array([text.length]) },
      memoryStore,
      memoryAtomStore,
      memoryAtomExtractionMode: "hybrid",
      sessionStore,
      persona: { name: "Greyfield", tone: "alive", boundaries: [], expressionMap: {} },
      voice: "default",
      threadId: "thread-llm-atoms"
    });

    await runtime.handle(
      { type: "text.input", text: "我们第一次相遇是 2024 年 5 月 20 日，那天我拿着一支红玫瑰。" },
      () => undefined
    );

    const storedAtoms = await memoryAtomStore.list("thread-llm-atoms");
    expect(storedAtoms.map((atom) => atom.type)).toEqual(expect.arrayContaining(["relationship_event", "preference"]));
    expect(storedAtoms.find((atom) => atom.type === "preference")).toMatchObject({
      sourceTurnIds: ["session-llm-atoms-1"],
      object: "rose",
      metadata: { preferenceType: "flower", color: "red" }
    });
  });

  it("updates similar memory atoms instead of appending duplicates on repeated saves", async () => {
    const memoryAtomStore = new TestMemoryAtomStore();
    const sessionStore = new InMemorySessionStore("session-atom-dedupe");
    const runtime = new GreyfieldRuntime({
      llm: {
        stream: async function* (messages) {
          if (messageContentText(messages[0]?.content).includes("You extract Greyfield long-term memory atoms")) {
            yield JSON.stringify({
              atoms: [
                {
                  type: "preference",
                  text: "User likes red roses.",
                  importance: 0.5,
                  object: "rose",
                  triggers: {
                    exact: ["红玫瑰", "玫瑰"],
                    aliases: ["喜欢的花", "花"],
                    secondary: []
                  },
                  metadata: { preferenceType: "flower" }
                }
              ]
            });
            return;
          }
          yield "Stored.";
        }
      },
      tts: { synthesize: async (text) => new Uint8Array([text.length]) },
      memoryStore,
      memoryAtomStore,
      memoryAtomExtractionMode: "llm",
      sessionStore,
      persona: { name: "Greyfield", tone: "alive", boundaries: [], expressionMap: {} },
      voice: "default",
      threadId: "thread-atom-dedupe"
    });

    await runtime.handle({ type: "text.input", text: "记住我喜欢红玫瑰。" }, () => undefined);
    await runtime.handle({ type: "text.input", text: "以后也记住我喜欢红玫瑰。" }, () => undefined);

    const storedAtoms = await memoryAtomStore.list("thread-atom-dedupe");
    expect(storedAtoms).toHaveLength(1);
    expect(storedAtoms[0]).toMatchObject({
      type: "preference",
      object: "rose",
      importance: 0.65,
      sourceTurnIds: ["session-atom-dedupe-1", "session-atom-dedupe-3"]
    });
  });

  it("hydrates recalled atom prompt material with bounded source fragments", async () => {
    const memoryAtomStore = new TestMemoryAtomStore();
    const sessionStore = new InMemorySessionStore("session-atom-source");
    let capturedMessages: Parameters<LLMProvider["stream"]>[0] = [];
    const runtime = new GreyfieldRuntime({
      llm: {
        stream: async function* (messages) {
          capturedMessages = messages;
          yield "Stored.";
        }
      },
      tts: { synthesize: async (text) => new Uint8Array([text.length]) },
      memoryStore,
      memoryAtomStore,
      sessionStore,
      persona: { name: "Greyfield", tone: "alive", boundaries: [], expressionMap: {} },
      voice: "default",
      threadId: "thread-atom-source"
    });

    await runtime.handle(
      {
        type: "text.input",
        text: "我给《星环旅店》的差评原文是：教程像坏掉的电梯，剧情把玩家当成没睡醒的测试员。"
      },
      () => undefined
    );
    await runtime.handle(
      { type: "text.input", text: "这个新游戏也很傻逼，好像之前某个游戏，之前为什么这么说？" },
      () => undefined
    );

    const system = capturedMessages[0]?.content ?? "";
    expect(system).toContain("Long-term recall context:");
    expect(system).toContain("Source-linked opinion memory");
    expect(system).not.toContain("memory-atom");
    expect(system).not.toMatch(/\batom-(?:fact|preference|opinion|relationship_event|episodic_scene|promise)-[\w-]+/u);
    expect(system).toContain("Source fragments:");
    expect(system).toContain("教程像坏掉的电梯");
    expect(system).toContain("剧情把玩家当成没睡醒的测试员");
  });

  it("keeps deleted evidence and provider secrets out of prompt material", async () => {
    const memoryAtomStore = new TestMemoryAtomStore([
      {
        id: "atom-hiyori-deleted",
        threadId: "thread-erased",
        type: "preference",
        text: "Deleted evidence target: User prefers Hiyori.",
        sourceTurnIds: ["session-erased-1"],
        sourceSessionId: "session-erased",
        createdAt: "2026-06-29T00:00:00.000Z",
        updatedAt: "2026-06-29T00:00:00.000Z",
        importance: 0.9,
        triggerKeys: ["hiyori"],
        triggers: {
          exact: ["Hiyori"],
          aliases: [],
          secondary: []
        }
      }
    ]);
    const deletedEvidenceStore = new TestDeletedMemoryEvidenceStore([
      {
        id: "deleted-evidence-atom-hiyori",
        threadId: "thread-erased",
        kind: "memory-atom",
        memoryId: "atom-hiyori-deleted",
        sourceSessionId: "session-erased",
        sourceTurnIds: ["session-erased-1"],
        deletedAt: "2026-06-29T00:00:01.000Z"
      }
    ]);
    const sessionStore = new InMemorySessionStore("session-erased");
    await sessionStore.append({
      role: "user",
      content: "Deleted raw source says Hiyori is my favorite model and sk-erasedsource123456.",
      createdAt: "2026-06-29T00:00:00.000Z"
    });
    await sessionStore.append({
      role: "event",
      content: "window:set-hit-test private event noise with apiKey=sk-privateevent123456",
      createdAt: "2026-06-29T00:00:01.000Z"
    });
    let capturedMessages: Parameters<LLMProvider["stream"]>[0] = [];
    const runtime = new GreyfieldRuntime({
      llm: {
        stream: async function* (messages) {
          capturedMessages = messages;
          yield "No deleted evidence.";
        }
      },
      tts: { synthesize: async (text) => new Uint8Array([text.length]) },
      memoryStore: {
        load: async () => "- Provider key sk-memoryprompt123456 should be redacted.",
        save: async () => undefined,
        consolidate: async () => ""
      },
      memoryAtomStore,
      deletedMemoryEvidenceStore: deletedEvidenceStore,
      sessionStore,
      persona: { name: "Greyfield", tone: "alive", boundaries: [], expressionMap: {} },
      voice: "default",
      threadId: "thread-erased",
      promptRedactionSecrets: ["configured-provider-secret"]
    });

    await runtime.handle({ type: "text.input", text: "Hiyori 还记得吗？apiKey=sk-currentinput123456" }, () => undefined);

    const system = capturedMessages[0]?.content ?? "";
    const serializedMessages = JSON.stringify(capturedMessages);
    expect(system).not.toContain("Deleted evidence target");
    expect(system).not.toContain("Deleted raw source says Hiyori");
    expect(serializedMessages).not.toContain("window:set-hit-test");
    expect(serializedMessages).not.toMatch(/\bsk-[A-Za-z0-9_-]{8,}\b/u);
    expect(serializedMessages).toContain("[redacted-secret]");
  });

  it("fails closed before prompt assembly when deleted evidence cannot be loaded", async () => {
    let streamCalled = false;
    const runtime = new GreyfieldRuntime({
      llm: {
        stream: async function* () {
          streamCalled = true;
          yield "Should not be generated.";
        }
      },
      tts: { synthesize: async (text) => new Uint8Array([text.length]) },
      memoryStore,
      memoryAtomStore: new TestMemoryAtomStore([
        {
          id: "atom-erased",
          threadId: "thread-erased",
          type: "preference",
          text: "Deleted evidence target: User prefers Hiyori.",
          sourceTurnIds: ["session-erased-1"],
          sourceSessionId: "session-erased",
          createdAt: "2026-06-29T00:00:00.000Z",
          updatedAt: "2026-06-29T00:00:00.000Z",
          importance: 0.9,
          triggerKeys: ["hiyori"],
          triggers: {
            exact: ["Hiyori"],
            aliases: [],
            secondary: []
          }
        }
      ]),
      deletedMemoryEvidenceStore: {
        append: async () => {
          throw new Error("append is not used by this test");
        },
        list: async () => {
          throw new Error("deleted evidence unavailable");
        }
      },
      sessionStore: new InMemorySessionStore("session-erased"),
      persona: { name: "Greyfield", tone: "alive", boundaries: [], expressionMap: {} },
      voice: "default",
      threadId: "thread-erased"
    });

    await expect(runtime.handle({ type: "text.input", text: "Hiyori 还记得吗？" }, () => undefined)).rejects.toThrow(
      "deleted evidence unavailable"
    );
    expect(streamCalled).toBe(false);
  });

  it("keeps chat usable when memory atom storage is unavailable", async () => {
    const runtime = new GreyfieldRuntime({
      llm: {
        stream: async function* () {
          yield "Reply survived.";
        }
      },
      tts: { synthesize: async (text) => new Uint8Array([text.length]) },
      memoryStore,
      memoryAtomStore: {
        append: async () => {
          throw new Error("atom append failed");
        },
        list: async () => {
          throw new Error("atom list failed");
        },
        update: async () => null,
        delete: async () => false
      },
      sessionStore: new InMemorySessionStore("session-atom-failure"),
      persona: { name: "Greyfield", tone: "alive", boundaries: [], expressionMap: {} },
      voice: "default",
      threadId: "thread-atom-failure"
    });
    const events: RuntimeOutputEvent[] = [];

    await runtime.handle({ type: "text.input", text: "记住我喜欢雨天火锅。" }, (event) => {
      events.push(event);
    });

    expect(events).toContainEqual({ type: "assistant.text.final", text: "Reply survived." });
    expect(events).toContainEqual({ type: "assistant.audio.end" });
    expect(events).toContainEqual({ type: "runtime.status", status: "idle" });
  });

  it("creates extractive summary segments for turns that leave recent context", async () => {
    const sessionStore = new InMemorySessionStore("session-summary");
    const summaries: Awaited<ReturnType<SummarySegmentStore["list"]>> = [];
    const summarySegmentStore: SummarySegmentStore = {
      append: async (segment) => {
        const stored = normalizeSummarySegment({
          id: `summary-${summaries.length + 1}`,
          ...segment,
          createdAt: segment.createdAt ?? "2026-06-26T01:00:00.000Z"
        });
        summaries.push(stored);
        return stored;
      },
      get: async (id) => summaries.find((summary) => summary.id === id) ?? null,
      update: async () => null,
      delete: async () => false,
      list: async () => summaries
    };
    const runtime = new GreyfieldRuntime({
      llm: {
        stream: async function* () {
          yield "Stored reply.";
        }
      },
      tts: { synthesize: async (text) => new Uint8Array([text.length]) },
      memoryStore,
      summarySegmentStore,
      sessionStore,
      persona: { name: "Greyfield", tone: "alive", boundaries: [], expressionMap: {} },
      voice: "default",
      threadId: "thread-summary",
      recentTurnLimit: 2,
      summaryBatchTurnLimit: 4,
      summaryMinTurns: 4
    });

    const events: RuntimeOutputEvent[] = [];
    await runtime.handle({ type: "text.input", text: "第一轮：我喜欢 Hiyori。" }, (event) => {
      events.push(event);
    });
    await runtime.handle({ type: "text.input", text: "第二轮：记住 Live2D 模型偏好。" }, (event) => {
      events.push(event);
    });
    await runtime.handle({ type: "text.input", text: "第三轮：继续。" }, (event) => {
      events.push(event);
    });

    expect(summaries).toHaveLength(1);
    expect(summaries[0]?.summary).toContain("第一轮：我喜欢 Hiyori");
    expect(summaries[0]?.sourceTurns.map((turn) => turn.turnId)).toEqual([
      "session-summary-1",
      "session-summary-2",
      "session-summary-3",
      "session-summary-4"
    ]);
    expect(events).toContainEqual(
      expect.objectContaining({
        type: "memory.summary.created",
        segment: expect.objectContaining({ id: "summary-1" })
      })
    );
    expect(await sessionStore.getRecent(6)).toHaveLength(6);
  });

  it("skips memory recall, summary, and atom extraction when memory is disabled", async () => {
    const unavailableMemoryStore: MemoryStore = {
      load: async () => {
        throw new Error("memory should not be loaded");
      },
      save: async () => undefined,
      consolidate: async () => ""
    };
    const summarySegmentStore: SummarySegmentStore = {
      append: async () => {
        throw new Error("summary should not be appended");
      },
      get: async () => null,
      update: async () => null,
      delete: async () => false,
      list: async () => {
        throw new Error("summary should not be listed");
      }
    };
    const memoryAtomStore = new TestMemoryAtomStore([]);
    const runtime = new GreyfieldRuntime({
      llm: {
        stream: async function* () {
          yield "Memory is paused.";
        }
      },
      tts: { synthesize: async (text) => new Uint8Array([text.length]) },
      memoryStore: unavailableMemoryStore,
      summarySegmentStore,
      memoryAtomStore,
      memoryEnabled: false,
      memoryAtomExtractionMode: "hybrid",
      sessionStore: new InMemorySessionStore("session-memory-off"),
      persona: { name: "Greyfield", tone: "alive", boundaries: [], expressionMap: {} },
      voice: "default",
      threadId: "thread-memory-off"
    });
    const events: RuntimeOutputEvent[] = [];

    await runtime.handle({ type: "text.input", text: "Remember that I like roses." }, (event) => {
      events.push(event);
    });

    expect(events).toContainEqual({ type: "assistant.text.final", text: "Memory is paused." });
    expect(events).not.toContainEqual(expect.objectContaining({ type: "memory.recall.context" }));
    expect(events).not.toContainEqual(expect.objectContaining({ type: "memory.summary.created" }));
    expect(events).not.toContainEqual(expect.objectContaining({ type: "memory.atom.extraction.status" }));
    expect(await memoryAtomStore.list("thread-memory-off")).toHaveLength(0);
  });

  it("keeps chat usable when summary recall storage is unavailable", async () => {
    const summarySegmentStore: SummarySegmentStore = {
      append: async () => {
        throw new Error("not used");
      },
      get: async () => null,
      update: async () => null,
      delete: async () => false,
      list: async () => {
        throw new Error("summary list failed");
      }
    };
    const runtime = new GreyfieldRuntime({
      llm: {
        stream: async function* () {
          yield "Reply survived.";
        }
      },
      tts: { synthesize: async (text) => new Uint8Array([text.length]) },
      memoryStore,
      summarySegmentStore,
      sessionStore: new InMemorySessionStore("session-recall-failure"),
      persona: { name: "Greyfield", tone: "alive", boundaries: [], expressionMap: {} },
      voice: "default",
      threadId: "thread-recall-failure"
    });
    const events: RuntimeOutputEvent[] = [];

    await runtime.handle({ type: "text.input", text: "Hiyori 还是默认模型吗？" }, (event) => {
      events.push(event);
    });

    expect(events).toContainEqual({ type: "assistant.text.final", text: "Reply survived." });
    expect(events).toContainEqual({ type: "assistant.audio.end" });
    expect(events).toContainEqual({ type: "runtime.status", status: "idle" });
  });

  it("keeps chat usable when summary append fails after the turn is persisted", async () => {
    const sessionStore = new InMemorySessionStore("session-summary-failure");
    const summarySegmentStore: SummarySegmentStore = {
      append: async () => {
        throw new Error("summary append failed");
      },
      get: async () => null,
      update: async () => null,
      delete: async () => false,
      list: async () => []
    };
    const runtime = new GreyfieldRuntime({
      llm: {
        stream: async function* () {
          yield "Stored reply.";
        }
      },
      tts: { synthesize: async (text) => new Uint8Array([text.length]) },
      memoryStore,
      summarySegmentStore,
      sessionStore,
      persona: { name: "Greyfield", tone: "alive", boundaries: [], expressionMap: {} },
      voice: "default",
      threadId: "thread-summary-failure",
      recentTurnLimit: 2,
      summaryBatchTurnLimit: 4,
      summaryMinTurns: 4
    });
    const runTurn = async (text: string): Promise<RuntimeOutputEvent[]> => {
      const events: RuntimeOutputEvent[] = [];
      await runtime.handle({ type: "text.input", text }, (event) => {
        events.push(event);
      });
      return events;
    };

    await runTurn("第一轮：我喜欢 Hiyori。");
    await runTurn("第二轮：记住 Live2D 模型偏好。");
    const appendFailureTurnEvents = await runTurn("第三轮：继续。");

    expect(appendFailureTurnEvents).toContainEqual({ type: "assistant.text.final", text: "Stored reply." });
    expect(appendFailureTurnEvents).toContainEqual({ type: "assistant.audio.end" });
    expect(appendFailureTurnEvents).toContainEqual({ type: "runtime.status", status: "idle" });
    expect(await sessionStore.getRecent(6)).toHaveLength(6);
  });

  it("stops later model chunks after an interrupt", async () => {
    let runtime: GreyfieldRuntime;
    const sessionStore = new InMemorySessionStore("session-a");
    const llm: LLMProvider = {
      stream: async function* () {
        yield "First sentence. ";
        runtime.requestInterrupt();
        yield "Second sentence.";
      }
    };
    const tts: TTSProvider = {
      synthesize: async (text) => new Uint8Array([text.length])
    };
    runtime = new GreyfieldRuntime({
      llm,
      tts,
      memoryStore,
      sessionStore,
      persona: { name: "Greyfield", tone: "alive", boundaries: [], expressionMap: {} },
      voice: "default"
    });
    const events: RuntimeOutputEvent[] = [];

    await runtime.handle({ type: "text.input", text: "Please continue" }, (event) => {
      events.push(event);
    });

    expect(events).toContainEqual({ type: "runtime.status", status: "interrupted" });
    expect(events).not.toContainEqual({ type: "assistant.text.final", text: "First sentence." });
    expect(events).not.toContainEqual({ type: "runtime.status", status: "idle" });
    expect(events.map((event) => JSON.stringify(event)).join("\n")).not.toContain("Second sentence");
    expect(await sessionStore.getRecent(2)).toEqual([]);
  });

  it("does not append a half turn when the provider fails", async () => {
    const sessionStore = new InMemorySessionStore("session-provider-failure");
    const runtime = new GreyfieldRuntime({
      llm: {
        stream: async function* () {
          throw new Error("provider rejected");
        }
      },
      tts: {
        synthesize: async (text) => new Uint8Array([text.length])
      },
      memoryStore,
      sessionStore,
      persona: { name: "Greyfield", tone: "alive", boundaries: [], expressionMap: {} },
      voice: "default"
    });

    await expect(runtime.handle({ type: "text.input", text: "请重试" }, () => undefined)).rejects.toThrow("provider rejected");

    expect(await sessionStore.getRecent(2)).toEqual([]);
  });

  it("keeps the text turn when TTS fails and reports a voice-only error", async () => {
    const sessionStore = new InMemorySessionStore("session-tts-failure");
    const runtime = new GreyfieldRuntime({
      llm: {
        stream: async function* () {
          yield "Text remains.";
        }
      },
      tts: {
        synthesize: async () => {
          throw new Error("speaker unavailable");
        }
      },
      memoryStore,
      sessionStore,
      persona: { name: "Greyfield", tone: "alive", boundaries: [], expressionMap: {} },
      voice: "default"
    });
    const events: RuntimeOutputEvent[] = [];

    await runtime.handle({ type: "text.input", text: "say it" }, (event) => {
      events.push(event);
    });

    expect(events).toContainEqual({
      type: "assistant.audio.error",
      text: "Text remains.",
      message: "Voice playback failed: speaker unavailable"
    });
    expect(events).toContainEqual({ type: "assistant.text.final", text: "Text remains." });
    expect(await sessionStore.getRecent(2)).toMatchObject([
      { role: "user", content: "say it" },
      { role: "assistant", content: "Text remains." }
    ]);
  });

  it("skips TTS when voice output is disabled", async () => {
    const synthesize = vi.fn(async (text: string) => new Uint8Array([text.length]));
    const runtime = new GreyfieldRuntime({
      llm: {
        stream: async function* () {
          yield "Quiet response.";
        }
      },
      tts: { synthesize },
      memoryStore,
      sessionStore: new InMemorySessionStore("session-tts-disabled"),
      persona: { name: "Greyfield", tone: "alive", boundaries: [], expressionMap: {} },
      voice: "default",
      ttsEnabled: false
    });
    const events: RuntimeOutputEvent[] = [];

    await runtime.handle({ type: "text.input", text: "quiet" }, (event) => {
      events.push(event);
    });

    expect(synthesize).not.toHaveBeenCalled();
    expect(events.some((event) => event.type === "assistant.audio.chunk")).toBe(false);
    expect(events).toContainEqual({ type: "assistant.text.final", text: "Quiet response." });
  });

  it("transcribes audio input and routes the transcript through the text runtime", async () => {
    const transcribe = vi.fn(async () => "Use voice");
    const sessionStore = new InMemorySessionStore("session-audio-input");
    const runtime = new GreyfieldRuntime({
      llm: {
        stream: async function* () {
          yield "Voice reply.";
        }
      },
      asr: { transcribe },
      tts: {
        synthesize: async (text) => new Uint8Array([text.length])
      },
      memoryStore,
      sessionStore,
      persona: { name: "Greyfield", tone: "alive", boundaries: [], expressionMap: {} },
      voice: "default"
    });
    const events: RuntimeOutputEvent[] = [];

    await runtime.handle({ type: "audio.chunk", data: new Uint8Array([1, 2]) }, (event) => {
      events.push(event);
    });
    await runtime.handle({ type: "audio.chunk", data: new Uint8Array([3]) }, (event) => {
      events.push(event);
    });
    await runtime.handle({ type: "audio.end" }, (event) => {
      events.push(event);
    });

    expect(transcribe).toHaveBeenCalledWith(new Uint8Array([1, 2, 3]), expect.objectContaining({ signal: expect.any(AbortSignal) }));
    expect(events).toContainEqual({ type: "runtime.status", status: "listening" });
    expect(events).toContainEqual({ type: "transcript.final", text: "Use voice" });
    expect(events).toContainEqual({ type: "assistant.text.final", text: "Voice reply." });
    expect(await sessionStore.getRecent(2)).toMatchObject([
      { role: "user", content: "Use voice" },
      { role: "assistant", content: "Voice reply." }
    ]);
  });

  it("caps spoken text per turn", async () => {
    const synthesized: string[] = [];
    const runtime = new GreyfieldRuntime({
      llm: {
        stream: async function* () {
          yield "First long sentence. Second sentence.";
        }
      },
      tts: {
        synthesize: async (text) => {
          synthesized.push(text);
          return new Uint8Array([text.length]);
        }
      },
      memoryStore,
      sessionStore: new InMemorySessionStore("session-tts-budget"),
      persona: { name: "Greyfield", tone: "alive", boundaries: [], expressionMap: {} },
      voice: "default",
      ttsMaxCharactersPerTurn: 12
    });

    await runtime.handle({ type: "text.input", text: "long" }, () => undefined);

    expect(synthesized).toEqual(["First long…"]);
  });

  it("persists the successful turn before emitting the final assistant text", async () => {
    const order: string[] = [];
    const sessionStore: SessionStore = {
      sessionId: "session-order",
      append: async (turn: AppendSessionTurn) => {
        order.push(`append:${turn.role}`);
        return {
          id: `session-order-${order.length}`,
          role: turn.role,
          content: turn.content,
          createdAt: "2026-05-27T00:00:00.000Z",
          meta: turn.meta
        };
      },
      getRecent: async () => [],
      createHandoff: async (): Promise<SessionHandoff> => ({
        sessionId: "session-order",
        turns: [] satisfies SessionTurn[],
        summary: ""
      })
    };
    const runtime = new GreyfieldRuntime({
      llm: {
        stream: async function* () {
          yield "Persist me.";
        }
      },
      tts: {
        synthesize: async (text) => new Uint8Array([text.length])
      },
      memoryStore,
      sessionStore,
      persona: { name: "Greyfield", tone: "alive", boundaries: [], expressionMap: {} },
      voice: "default"
    });

    await runtime.handle({ type: "text.input", text: "record this" }, async (event) => {
      if (event.type === "assistant.text.final") {
        order.push("emit:final");
      }
    });

    expect(order).toEqual(["append:user", "append:assistant", "emit:final"]);
  });

  it("passes an abort signal to the LLM provider and aborts it on interrupt", async () => {
    let runtime: GreyfieldRuntime;
    let capturedSignal: AbortSignal | undefined;
    const llm: LLMProvider = {
      stream: async function* (_messages, _tools, options) {
        capturedSignal = options?.signal;
        yield "First sentence. ";
        runtime.requestInterrupt();
        yield "Second sentence.";
      }
    };
    runtime = new GreyfieldRuntime({
      llm,
      tts: { synthesize: async (text) => new Uint8Array([text.length]) },
      memoryStore,
      sessionStore: new InMemorySessionStore("session-abort"),
      persona: { name: "Greyfield", tone: "alive", boundaries: [], expressionMap: {} },
      voice: "default"
    });

    await runtime.handle({ type: "text.input", text: "Please continue" }, () => undefined);

    expect(capturedSignal).toBeInstanceOf(AbortSignal);
    expect(capturedSignal?.aborted).toBe(true);
  });

  it("does not emit stale audio when interrupted during TTS synthesis", async () => {
    let runtime: GreyfieldRuntime;
    let finishTts: (() => void) | undefined;
    const ttsStarted = new Promise<void>((resolve) => {
      const sessionStore = new InMemorySessionStore("session-interrupt-tts");
      runtime = new GreyfieldRuntime({
        llm: {
          stream: async function* () {
            yield "First sentence.";
          }
        },
        tts: {
          synthesize: async () => {
            resolve();
            await new Promise<void>((finish) => {
              finishTts = finish;
            });
            return new Uint8Array([255, 0, 255, 0]);
          }
        },
        memoryStore,
        sessionStore,
        persona: { name: "Greyfield", tone: "alive", boundaries: [], expressionMap: {} },
        voice: "default"
      });
    });
    const events: RuntimeOutputEvent[] = [];
    const running = runtime!.handle({ type: "text.input", text: "stop audio" }, (event) => {
      events.push(event);
    });
    await ttsStarted;

    runtime!.requestInterrupt();
    finishTts?.();
    await running;

    expect(events.some((event) => event.type === "assistant.audio.chunk")).toBe(false);
    expect(events).toContainEqual({ type: "runtime.status", status: "interrupted" });
  });

  it("emits synthesized audio without driving stage mouth from encoded bytes", async () => {
    const setMouthOpen = vi.fn();
    const runtime = new GreyfieldRuntime({
      llm: {
        stream: async function* () {
          yield "Loud sentence.";
        }
      },
      tts: {
        synthesize: async () => new Uint8Array([0, 255, 0, 255])
      },
      memoryStore,
      sessionStore: new InMemorySessionStore("session-mouth"),
      persona: { name: "Greyfield", tone: "alive", boundaries: [], expressionMap: {} },
      voice: "default",
      stage: {
        loadModel: async () => undefined,
        setExpression: async () => undefined,
        playMotion: async () => undefined,
        setMouthOpen
      }
    });
    const events: RuntimeOutputEvent[] = [];

    await runtime.handle({ type: "text.input", text: "say it" }, (event) => {
      events.push(event);
    });

    expect(events.some((event) => event.type === "assistant.audio.chunk")).toBe(true);
    expect(setMouthOpen).not.toHaveBeenCalled();
  });
});

function makeImageAttachment(
  id: string,
  source: RuntimeImageAttachment["source"],
  marker: string
): RuntimeImageAttachment {
  return {
    id,
    source,
    dataUrl: `data:image/png;base64,${Buffer.from(marker).toString("base64")}`,
    mimeType: "image/png",
    createdAt: "2026-06-30T00:00:00.000Z",
    hash: marker
  };
}

function messageContentText(content: Parameters<LLMProvider["stream"]>[0][number]["content"] | undefined): string {
  if (typeof content === "string") {
    return content;
  }
  return content?.flatMap((part) => (part.type === "text" ? [part.text] : [])).join(" ") ?? "";
}

class TestMemoryAtomStore implements MemoryAtomStore {
  constructor(private readonly atoms: MemoryAtom[] = []) {}

  async append(atom: MemoryAtom): Promise<MemoryAtom> {
    const existingIndex = this.atoms.findIndex((stored) => stored.id === atom.id);
    if (existingIndex >= 0) {
      this.atoms[existingIndex] = atom;
      return atom;
    }
    this.atoms.push(atom);
    return atom;
  }

  async list(threadId: string): Promise<MemoryAtom[]> {
    return this.atoms.filter((atom) => atom.threadId === threadId);
  }

  async update(id: string, patch: UpdateMemoryAtom): Promise<MemoryAtom | null> {
    const atom = this.atoms.find((stored) => stored.id === id);
    if (!atom) {
      return null;
    }
    Object.assign(atom, patch);
    return atom;
  }

  async delete(id: string): Promise<boolean> {
    const index = this.atoms.findIndex((atom) => atom.id === id);
    if (index < 0) {
      return false;
    }
    this.atoms.splice(index, 1);
    return true;
  }
}

class TestDeletedMemoryEvidenceStore implements DeletedMemoryEvidenceStore {
  constructor(private records: DeletedMemoryEvidence[]) {}

  async append(record: AppendDeletedMemoryEvidence): Promise<DeletedMemoryEvidence> {
    const stored: DeletedMemoryEvidence = {
      id: `deleted-${record.kind}-${record.memoryId}-${this.records.length + 1}`,
      threadId: record.threadId,
      kind: record.kind,
      memoryId: record.memoryId,
      sourceTurnIds: record.sourceTurnIds,
      ...(record.sourceSessionId ? { sourceSessionId: record.sourceSessionId } : {}),
      deletedAt: record.deletedAt ?? "2026-06-29T00:00:00.000Z"
    };
    this.records.push(stored);
    return stored;
  }

  async list(threadId: string): Promise<DeletedMemoryEvidence[]> {
    return this.records.filter((record) => record.threadId === threadId);
  }
}
