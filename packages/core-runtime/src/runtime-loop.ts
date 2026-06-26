import { splitCompleteSentences, takeTtsTextWithinBudget } from "@greyfield/audio-runtime";
import type { RuntimeEventHandler, RuntimeInputEvent } from "./events";
import { buildRecallContext, createSummarySegmentDraft, type SummarySegmentStore } from "./memory-context";
import { assemblePrompt } from "./prompt-assembler";
import type { ASRProvider, LLMProvider, MemoryStore, TTSProvider } from "./providers";
import type { CharacterPersona } from "./persona";
import type { SessionStore } from "./session-store";
import type { StageDriver } from "./stage-driver";

export interface GreyfieldRuntimeOptions {
  llm: LLMProvider;
  asr?: ASRProvider;
  tts: TTSProvider;
  memoryStore: MemoryStore;
  summarySegmentStore?: SummarySegmentStore;
  sessionStore: SessionStore;
  persona: CharacterPersona;
  voice: string;
  stage?: StageDriver;
  threadId?: string;
  recentTurnLimit?: number;
  recallMaxItems?: number;
  recallMaxCharacters?: number;
  summaryBatchTurnLimit?: number;
  summaryMinTurns?: number;
  ttsEnabled?: boolean;
  ttsMaxCharactersPerTurn?: number;
}

const defaultTtsMaxCharactersPerTurn = 600;
const defaultSummaryBatchTurnLimit = 12;
const defaultSummaryMinTurns = 4;

export class GreyfieldRuntime {
  private interrupted = false;
  private activeAbortController: AbortController | undefined;
  private audioInputChunks: Uint8Array[] = [];
  private readonly recentTurnLimit: number;
  private readonly threadId: string;

  constructor(private readonly options: GreyfieldRuntimeOptions) {
    this.recentTurnLimit = options.recentTurnLimit ?? 20;
    this.threadId = options.threadId ?? "local-desktop-thread";
  }

  requestInterrupt(): void {
    this.interrupted = true;
    this.activeAbortController?.abort();
  }

  async handle(input: RuntimeInputEvent, emit: RuntimeEventHandler): Promise<void> {
    if (input.type === "runtime.interrupt") {
      this.requestInterrupt();
      await emit({ type: "runtime.status", status: "interrupted" });
      return;
    }

    if (input.type !== "text.input") {
      if (input.type === "audio.chunk") {
        await this.handleAudioChunk(input.data, emit);
        return;
      }
      if (input.type === "audio.end") {
        await this.handleAudioEnd(emit);
        return;
      }
      await emit({ type: "error", message: `Unhandled input event: ${input.type}` });
      return;
    }

    await this.handleTextInput(input.text, emit);
  }

  private async handleAudioChunk(data: Uint8Array, emit: RuntimeEventHandler): Promise<void> {
    if (this.interrupted) {
      return;
    }
    if (!this.activeAbortController) {
      this.activeAbortController = new AbortController();
    }
    if (this.audioInputChunks.length === 0) {
      await emit({ type: "runtime.status", status: "listening" });
    }
    if (data.length > 0) {
      this.audioInputChunks.push(data.slice());
    }
  }

  private async handleAudioEnd(emit: RuntimeEventHandler): Promise<void> {
    if (!this.activeAbortController) {
      this.activeAbortController = new AbortController();
    }
    const audio = concatAudioChunks(this.audioInputChunks);
    this.audioInputChunks = [];
    if (audio.length === 0) {
      await emit({ type: "error", message: "No microphone audio was captured. Check microphone permission and try again." });
      this.activeAbortController = undefined;
      return;
    }
    await emit({ type: "runtime.status", status: "listening" });
    try {
      const transcript = normalizeTranscript(
        await this.requireASRProvider().transcribe(audio, {
          signal: this.activeAbortController.signal
        })
      );
      if (this.interrupted) {
        await emit({ type: "runtime.status", status: "interrupted" });
        await emit({ type: "assistant.audio.end" });
        this.activeAbortController = undefined;
        return;
      }
      if (transcript.length === 0) {
        await emit({ type: "error", message: "Voice input was empty. Try speaking again." });
        this.activeAbortController = undefined;
        return;
      }
      await emit({ type: "transcript.final", text: transcript });
      await this.handleTextInput(transcript, emit);
    } catch (error) {
      if (this.interrupted) {
        await emit({ type: "runtime.status", status: "interrupted" });
        await emit({ type: "assistant.audio.end" });
        return;
      }
      await emit({ type: "error", message: `Voice input failed: ${formatError(error)}` });
    } finally {
      if (this.audioInputChunks.length === 0) {
        this.activeAbortController = undefined;
      }
    }
  }

  private async handleTextInput(text: string, emit: RuntimeEventHandler): Promise<void> {
    this.interrupted = false;
    this.activeAbortController = new AbortController();
    await emit({ type: "runtime.status", status: "thinking" });

    const [memory, recent, handoff, summarySegments] = await Promise.all([
      this.options.memoryStore.load(),
      this.options.sessionStore.getRecent(this.recentTurnLimit),
      this.options.sessionStore.createHandoff(this.recentTurnLimit),
      this.options.summarySegmentStore?.list(this.threadId) ?? Promise.resolve([])
    ]);
    const recallContext = this.options.summarySegmentStore
      ? buildRecallContext({
          input: text,
          summarySegments,
          maxItems: this.options.recallMaxItems,
          maxCharacters: this.options.recallMaxCharacters
        })
      : undefined;
    if (recallContext && (recallContext.items.length > 0 || recallContext.skipped.length > 0)) {
      await emit({ type: "memory.recall.context", context: recallContext });
    }

    const messages = assemblePrompt({
      persona: this.options.persona,
      memory,
      handoff: handoff.summary,
      recent,
      input: text,
      sessionId: this.options.sessionStore.sessionId,
      threadId: this.threadId,
      recallContext
    });

    let fullText = "";
    let sentenceBuffer = "";
    let usedTtsCharacters = 0;

    for await (const chunk of this.options.llm.stream(messages, undefined, { signal: this.activeAbortController.signal })) {
      if (this.interrupted) {
        break;
      }

      fullText += chunk;
      sentenceBuffer += chunk;
      await emit({ type: "assistant.text.delta", text: chunk });

      const split = splitCompleteSentences(sentenceBuffer);
      sentenceBuffer = split.remainder;
      for (const sentence of split.sentences) {
        if (this.interrupted) {
          break;
        }
        usedTtsCharacters = await this.synthesizeSentence(sentence, usedTtsCharacters, emit);
      }
    }

    if (!this.interrupted && sentenceBuffer.trim().length > 0) {
      usedTtsCharacters = await this.synthesizeSentence(sentenceBuffer.trim(), usedTtsCharacters, emit);
    }

    const finalText = normalizeAssistantText(fullText);
    if (this.interrupted) {
      await emit({ type: "runtime.status", status: "interrupted" });
      await emit({ type: "assistant.audio.end" });
      this.activeAbortController = undefined;
      return;
    }

    if (finalText.length > 0) {
      await this.options.sessionStore.append({ role: "user", content: text });
      await this.options.sessionStore.append({ role: "assistant", content: finalText });
      const createdSummary = await this.createSummaryForOldTurns();
      if (createdSummary) {
        await emit({ type: "memory.summary.created", segment: createdSummary });
      }
      await emit({ type: "assistant.text.final", text: finalText });
    }

    await emit({ type: "assistant.audio.end" });

    await emit({ type: "runtime.status", status: "idle" });
    this.activeAbortController = undefined;
  }

  private async synthesizeSentence(sentence: string, usedCharacters: number, emit: RuntimeEventHandler): Promise<number> {
    if (this.options.ttsEnabled === false) {
      return usedCharacters;
    }
    const budget = takeTtsTextWithinBudget(
      sentence,
      usedCharacters,
      this.options.ttsMaxCharactersPerTurn ?? defaultTtsMaxCharactersPerTurn
    );
    const text = budget.text;
    if (text.length === 0) {
      return budget.usedCharacters;
    }
    await emit({ type: "runtime.status", status: "speaking" });
    try {
      const audio = await this.options.tts.synthesize(text, this.options.voice, {
        signal: this.activeAbortController?.signal
      });
      if (this.interrupted) {
        return budget.usedCharacters;
      }
      await emit({ type: "assistant.audio.chunk", text, data: audio });
    } catch (error) {
      if (this.interrupted) {
        return budget.usedCharacters;
      }
      await emit({ type: "assistant.audio.error", text, message: `Voice playback failed: ${formatError(error)}` });
    }
    return budget.usedCharacters;
  }

  private requireASRProvider(): ASRProvider {
    if (!this.options.asr) {
      throw new Error("Voice input is not configured.");
    }
    return this.options.asr;
  }

  private async createSummaryForOldTurns(): Promise<Awaited<ReturnType<SummarySegmentStore["append"]>> | undefined> {
    const summarySegmentStore = this.options.summarySegmentStore;
    if (!summarySegmentStore) {
      return;
    }
    const summaryBatchTurnLimit = this.options.summaryBatchTurnLimit ?? defaultSummaryBatchTurnLimit;
    const turns = await this.options.sessionStore.getRecent(this.recentTurnLimit + summaryBatchTurnLimit);
    const oldTurns = turns.slice(0, Math.max(0, turns.length - this.recentTurnLimit));
    const existing = await summarySegmentStore.list(this.threadId);
    const summarizedTurnIds = new Set(existing.flatMap((segment) => segment.sourceTurns.map((turn) => turn.turnId)));
    const unsummarizedTurns = oldTurns
      .filter((turn) => turn.role === "user" || turn.role === "assistant")
      .filter((turn) => !summarizedTurnIds.has(turn.id))
      .slice(0, summaryBatchTurnLimit);
    if (unsummarizedTurns.length < (this.options.summaryMinTurns ?? defaultSummaryMinTurns)) {
      return;
    }
    const draft = createSummarySegmentDraft({
      sessionId: this.options.sessionStore.sessionId,
      turns: unsummarizedTurns
    });
    if (draft.summary.trim().length === 0 || draft.sourceTurns.length === 0) {
      return;
    }
    return summarySegmentStore.append({
      threadId: this.threadId,
      sessionId: this.options.sessionStore.sessionId,
      summary: draft.summary,
      recallCues: draft.recallCues,
      sourceTurns: draft.sourceTurns
    });
  }
}

function normalizeAssistantText(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

function normalizeTranscript(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

function concatAudioChunks(chunks: Uint8Array[]): Uint8Array {
  const byteLength = chunks.reduce((total, chunk) => total + chunk.length, 0);
  const result = new Uint8Array(byteLength);
  let offset = 0;
  for (const chunk of chunks) {
    result.set(chunk, offset);
    offset += chunk.length;
  }
  return result;
}

function formatError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
