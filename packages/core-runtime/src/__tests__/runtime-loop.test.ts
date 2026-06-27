import { describe, expect, it, vi } from "vitest";
import { GreyfieldRuntime } from "../runtime-loop";
import { InMemorySessionStore } from "../session-store";
import type { AppendSessionTurn, SessionHandoff, SessionStore, SessionTurn } from "../session-store";
import { normalizeSummarySegment, type SummarySegmentStore } from "../memory-context";
import type { MemoryAtom, MemoryAtomStore, UpdateMemoryAtom } from "../memory-atoms";
import type { LLMProvider, MemoryStore, TTSProvider } from "../providers";
import type { RuntimeOutputEvent } from "../events";

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

    expect(capturedMessages[0]?.content).toContain("Atom recall context:");
    expect(capturedMessages[0]?.content).toContain("memory-atom");
    expect(capturedMessages[0]?.content).toContain("Source turns: session-atoms-1");
    expect(capturedMessages[0]?.content).toContain("Ritual action: 送玫瑰");
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

class TestMemoryAtomStore implements MemoryAtomStore {
  private readonly atoms: MemoryAtom[] = [];

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
