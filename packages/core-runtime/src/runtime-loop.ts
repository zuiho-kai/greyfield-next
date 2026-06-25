import { mapAudioLevelToMouthOpen, measureAudioLevel, splitCompleteSentences, takeTtsTextWithinBudget } from "@greyfield/audio-runtime";
import type { RuntimeEventHandler, RuntimeInputEvent } from "./events";
import { assemblePrompt } from "./prompt-assembler";
import type { LLMProvider, MemoryStore, TTSProvider } from "./providers";
import type { CharacterPersona } from "./persona";
import type { SessionStore } from "./session-store";
import type { StageDriver } from "./stage-driver";

export interface GreyfieldRuntimeOptions {
  llm: LLMProvider;
  tts: TTSProvider;
  memoryStore: MemoryStore;
  sessionStore: SessionStore;
  persona: CharacterPersona;
  voice: string;
  stage?: StageDriver;
  threadId?: string;
  recentTurnLimit?: number;
  ttsEnabled?: boolean;
  ttsMaxCharactersPerTurn?: number;
}

const defaultTtsMaxCharactersPerTurn = 600;

export class GreyfieldRuntime {
  private interrupted = false;
  private activeAbortController: AbortController | undefined;
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
      await this.options.stage?.setMouthOpen(0);
      return;
    }

    if (input.type !== "text.input") {
      await emit({ type: "error", message: `Unhandled input event: ${input.type}` });
      return;
    }

    await this.handleTextInput(input.text, emit);
  }

  private async handleTextInput(text: string, emit: RuntimeEventHandler): Promise<void> {
    this.interrupted = false;
    this.activeAbortController = new AbortController();
    await emit({ type: "runtime.status", status: "thinking" });

    const [memory, recent, handoff] = await Promise.all([
      this.options.memoryStore.load(),
      this.options.sessionStore.getRecent(this.recentTurnLimit),
      this.options.sessionStore.createHandoff(this.recentTurnLimit)
    ]);

    const messages = assemblePrompt({
      persona: this.options.persona,
      memory,
      handoff: handoff.summary,
      recent,
      input: text,
      sessionId: this.options.sessionStore.sessionId,
      threadId: this.threadId
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
      await this.options.stage?.setMouthOpen(0);
      await emit({ type: "assistant.audio.end" });
      this.activeAbortController = undefined;
      return;
    }

    if (finalText.length > 0) {
      await this.options.sessionStore.append({ role: "user", content: text });
      await this.options.sessionStore.append({ role: "assistant", content: finalText });
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
      await this.options.stage?.setMouthOpen(mapAudioLevelToMouthOpen(measureAudioLevel(audio)));
      await emit({ type: "assistant.audio.chunk", text, data: audio });
    } catch (error) {
      if (this.interrupted) {
        return budget.usedCharacters;
      }
      await emit({ type: "assistant.audio.error", text, message: `Voice playback failed: ${formatError(error)}` });
    } finally {
      await this.options.stage?.setMouthOpen(0);
    }
    return budget.usedCharacters;
  }
}

function normalizeAssistantText(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

function formatError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
