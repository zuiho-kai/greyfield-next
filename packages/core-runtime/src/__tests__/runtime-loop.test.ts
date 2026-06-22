import { describe, expect, it, vi } from "vitest";
import { GreyfieldRuntime } from "../runtime-loop";
import { InMemorySessionStore } from "../session-store";
import type { AppendSessionTurn, SessionHandoff, SessionStore, SessionTurn } from "../session-store";
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

  it("drives mouth-open from synthesized audio level and resets after playback", async () => {
    const mouthOpenValues: number[] = [];
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
        setMouthOpen: async (value) => {
          mouthOpenValues.push(value);
        }
      }
    });

    await runtime.handle({ type: "text.input", text: "say it" }, () => undefined);

    expect(mouthOpenValues[0]).toBeGreaterThan(0.9);
    expect(mouthOpenValues.at(-1)).toBe(0);
  });
});
