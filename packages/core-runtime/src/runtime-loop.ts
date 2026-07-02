import { splitCompleteSentences, takeTtsTextWithinBudget } from "@greyfield/audio-runtime";
import type { RuntimeEventHandler, RuntimeInputEvent } from "./events";
import {
  buildMemoryAtomRecallContext,
  createMemoryAtomMergePatch,
  DeterministicMemoryAtomExtractor,
  filterMemoryAtomsForAutomaticWrite,
  findSimilarMemoryAtom,
  LLMBackedMemoryAtomExtractor,
  type MemoryAtom,
  type MemoryAtomExtractionMode,
  type MemoryAtomExtractionReport,
  type MemoryAtomExtractionStatus,
  type MemoryAtomExtractionStatusReason,
  type MemoryAtomExtractor,
  type MemoryAtomStore,
  type MemoryAtomWritePolicyOptions
} from "./memory-atoms";
import { buildRecallContext, createSummarySegmentDraft, getSummarySegmentSourceTurnIds, type SummarySegmentStore } from "./memory-context";
import {
  filterDeletedSessionTurns,
  hasDeletedMemoryEvidenceSource,
  sourceTurnIdsContainDeletedEvidence,
  type DeletedMemoryEvidence,
  type DeletedMemoryEvidenceStore
} from "./memory-erasure";
import { assemblePrompt } from "./prompt-assembler";
import type { ASRProvider, LLMProvider, MemoryStore, TTSProvider } from "./providers";
import type { CharacterPersona } from "./persona";
import type { SessionStore, SessionTurn, SessionTurnLookup } from "./session-store";
import type { StageDriver } from "./stage-driver";
import type { RuntimeImageAttachment, RuntimeObservationMetadata } from "./vision-attachments";

export interface GreyfieldRuntimeOptions {
  llm: LLMProvider;
  visionLlm?: LLMProvider;
  asr?: ASRProvider;
  tts: TTSProvider;
  memoryStore: MemoryStore;
  summarySegmentStore?: SummarySegmentStore;
  memoryAtomStore?: MemoryAtomStore;
  deletedMemoryEvidenceStore?: DeletedMemoryEvidenceStore;
  memoryAtomExtractor?: MemoryAtomExtractor;
  memoryAtomExtractionMode?: MemoryAtomExtractionMode;
  memoryAtomExtractionUnavailableReason?: Extract<MemoryAtomExtractionStatusReason, "disabled" | "provider-unavailable">;
  memoryAtomWritePolicy?: MemoryAtomWritePolicyOptions;
  sessionStore: SessionStore;
  persona: CharacterPersona;
  voice: string;
  stage?: StageDriver;
  threadId?: string;
  recentTurnLimit?: number;
  recallMaxItems?: number;
  recallMaxCharacters?: number;
  atomRecallMaxItems?: number;
  atomRecallMaxCharacters?: number;
  summaryBatchTurnLimit?: number;
  summaryMinTurns?: number;
  ttsEnabled?: boolean;
  ttsMaxCharactersPerTurn?: number;
  promptRedactionSecrets?: string[];
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

    await this.handleTextInput(input, emit);
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
      await this.handleTextInput({ type: "text.input", text: transcript }, emit);
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

  private async handleTextInput(input: Extract<RuntimeInputEvent, { type: "text.input" }>, emit: RuntimeEventHandler): Promise<void> {
    const text = input.text;
    const attachments = normalizeRuntimeImageAttachments(input.attachments);
    const observation = createObservationMetadata(input.observation, attachments);
    const llm = attachments.length > 0 ? this.options.visionLlm : this.options.llm;
    if (!llm || (attachments.length > 0 && llm.supportsVision !== true)) {
      await emit({
        type: "error",
        message:
          "Screen awareness needs a Vision model before Greyfield can use visual context. Greyfield kept the screenshot temporary and did not send it to the Chat model."
      });
      return;
    }

    this.interrupted = false;
    this.activeAbortController = new AbortController();
    await emit({ type: "runtime.status", status: "thinking" });

    const [memory, rawRecent, rawHandoff, rawMemoryAtoms, deletedEvidence] = await Promise.all([
      this.options.memoryStore.load(),
      this.options.sessionStore.getRecent(this.recentTurnLimit),
      this.options.sessionStore.createHandoff(this.recentTurnLimit),
      this.loadMemoryAtoms(),
      this.loadDeletedMemoryEvidence()
    ]);
    const recent = sanitizePromptTurns(
      filterDeletedSessionTurns(rawRecent, deletedEvidence, this.options.sessionStore.sessionId),
      this.options.promptRedactionSecrets
    );
    const handoffSummary = buildPromptHandoffSummary({
      summary: rawHandoff.summary,
      turns: rawHandoff.turns,
      deletedEvidence,
      sessionId: this.options.sessionStore.sessionId,
      secrets: this.options.promptRedactionSecrets
    });
    const memoryAtoms = rawMemoryAtoms.filter(
      (atom) => !sourceTurnIdsContainDeletedEvidence(atom.sourceTurnIds, deletedEvidence, atom.sourceSessionId ?? this.options.sessionStore.sessionId)
    );
    const summarySegments = (await this.loadSummarySegments()).filter(
      (segment) => !sourceTurnIdsContainDeletedEvidence(getSummarySegmentSourceTurnIds(segment), deletedEvidence, segment.sessionId)
    );
    const recallContext = this.options.summarySegmentStore
      ? buildRecallContext({
          input: redactPromptPrivateText(text, this.options.promptRedactionSecrets),
          summarySegments,
          maxItems: this.options.recallMaxItems,
          maxCharacters: this.options.recallMaxCharacters
        })
      : undefined;
    if (recallContext && (recallContext.items.length > 0 || recallContext.skipped.length > 0)) {
      await emit({ type: "memory.recall.context", context: recallContext });
    }
    let atomRecallContext =
      memoryAtoms.length > 0
        ? buildMemoryAtomRecallContext({
            input: redactPromptPrivateText(text, this.options.promptRedactionSecrets),
            atoms: memoryAtoms,
            maxItems: this.options.atomRecallMaxItems,
            maxCharacters: this.options.atomRecallMaxCharacters
          })
        : undefined;
    const atomSourceTurns = atomRecallContext ? await this.loadSourceTurnsForAtomRecall(atomRecallContext) : undefined;
    if (atomSourceTurns) {
      atomRecallContext = buildMemoryAtomRecallContext({
        input: redactPromptPrivateText(text, this.options.promptRedactionSecrets),
        atoms: memoryAtoms,
        maxItems: this.options.atomRecallMaxItems,
        maxCharacters: this.options.atomRecallMaxCharacters,
        sourceTurns: atomSourceTurns
      });
    }

    const messages = assemblePrompt({
      persona: this.options.persona,
      memory: redactPromptPrivateText(memory, this.options.promptRedactionSecrets),
      handoff: handoffSummary,
      recent,
      input: redactPromptPrivateText(text, this.options.promptRedactionSecrets),
      inputAttachments: attachments,
      observation,
      sessionId: this.options.sessionStore.sessionId,
      threadId: this.threadId,
      recallContext,
      atomRecallContext
    });

    let fullText = "";
    let sentenceBuffer = "";
    let usedTtsCharacters = 0;

    for await (const chunk of llm.stream(messages, undefined, { signal: this.activeAbortController.signal })) {
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
      const userTurn = await this.options.sessionStore.append({
        role: "user",
        content: text,
        ...(observation ? { meta: { observation } } : {})
      });
      await this.options.sessionStore.append({ role: "assistant", content: finalText });
      const atomExtractionStatus = await this.extractMemoryAtomsForTurn(text, userTurn.id);
      if (atomExtractionStatus) {
        await emit({ type: "memory.atom.extraction.status", status: atomExtractionStatus });
      }
      try {
        const createdSummary = await this.createSummaryForOldTurns();
        if (createdSummary) {
          await emit({ type: "memory.summary.created", segment: createdSummary });
        }
      } catch (error) {
        console.warn(`Greyfield memory summary unavailable: ${formatError(error)}`);
      }
      if (observation) {
        await emit({ type: "observation.used", observation });
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

  private async loadSummarySegments(): Promise<Awaited<ReturnType<SummarySegmentStore["list"]>>> {
    const summarySegmentStore = this.options.summarySegmentStore;
    if (!summarySegmentStore) {
      return [];
    }
    try {
      return await summarySegmentStore.list(this.threadId);
    } catch (error) {
      console.warn(`Greyfield memory recall unavailable: ${formatError(error)}`);
      return [];
    }
  }

  private async loadMemoryAtoms(): Promise<MemoryAtom[]> {
    const memoryAtomStore = this.options.memoryAtomStore;
    if (!memoryAtomStore) {
      return [];
    }
    try {
      return await memoryAtomStore.list(this.threadId);
    } catch (error) {
      console.warn(`Greyfield memory atom recall unavailable: ${formatError(error)}`);
      return [];
    }
  }

  private async loadDeletedMemoryEvidence(): Promise<DeletedMemoryEvidence[]> {
    const store = this.options.deletedMemoryEvidenceStore;
    if (!store) {
      return [];
    }
    return store.list(this.threadId);
  }

  private async loadSourceTurnsForAtomRecall(context: ReturnType<typeof buildMemoryAtomRecallContext>): Promise<SessionTurn[] | undefined> {
    if (context.items.length === 0 || !hasSessionTurnLookup(this.options.sessionStore)) {
      return;
    }
    const deletedEvidence = await this.loadDeletedMemoryEvidence();
    const sourceTurnIds = [...new Set(context.items.flatMap((item) => item.sourceTurnIds))].filter(
      (turnId) => !hasDeletedMemoryEvidenceSource(deletedEvidence, turnId, this.options.sessionStore.sessionId)
    );
    if (sourceTurnIds.length === 0) {
      return;
    }
    try {
      return await this.options.sessionStore.getByIds(sourceTurnIds);
    } catch (error) {
      console.warn(`Greyfield memory atom source drilldown unavailable: ${formatError(error)}`);
      return;
    }
  }

  private async extractMemoryAtomsForTurn(text: string, sourceTurnId: string): Promise<MemoryAtomExtractionStatus | undefined> {
    const memoryAtomStore = this.options.memoryAtomStore;
    if (!memoryAtomStore) {
      return;
    }
    try {
      const extractor = this.createMemoryAtomExtractor();
      const atoms = await extractor.extract({
        text,
        threadId: this.threadId,
        sourceTurnIds: [sourceTurnId],
        sourceSessionId: this.options.sessionStore.sessionId,
        signal: this.activeAbortController?.signal
      });
      const writableAtoms = filterMemoryAtomsForAutomaticWrite(
        { text, threadId: this.threadId, sourceTurnIds: [sourceTurnId], sourceSessionId: this.options.sessionStore.sessionId },
        atoms,
        this.options.memoryAtomWritePolicy
      );
      const existingAtoms = await memoryAtomStore.list(this.threadId);
      const knownAtoms = [...existingAtoms];
      let savedAtomCount = 0;
      for (const atom of writableAtoms) {
        const similar = findSimilarMemoryAtom(knownAtoms, atom);
        if (similar) {
          const updated = await memoryAtomStore.update(similar.id, createMemoryAtomMergePatch(similar, atom));
          if (updated) {
            savedAtomCount += 1;
            const index = knownAtoms.findIndex((known) => known.id === updated.id);
            if (index >= 0) {
              knownAtoms[index] = updated;
            }
          }
          continue;
        }
        knownAtoms.push(await memoryAtomStore.append(atom));
        savedAtomCount += 1;
      }
      return this.buildMemoryAtomExtractionStatus(extractor.getLastReport?.(), savedAtomCount);
    } catch (error) {
      console.warn(`Greyfield memory atom extraction unavailable: ${formatError(error)}`);
      return;
    }
  }

  private buildMemoryAtomExtractionStatus(
    report: MemoryAtomExtractionReport | undefined,
    savedAtomCount: number
  ): MemoryAtomExtractionStatus {
    const unavailableReason = this.options.memoryAtomExtractionUnavailableReason;
    if (unavailableReason === "provider-unavailable") {
      return {
        status: "fallback",
        reason: "provider-unavailable",
        message: "Better memory needs a ready chat provider, so Greyfield used standard local memory for this message.",
        savedAtomCount,
        llmAttempted: false,
        fallbackUsed: true
      };
    }
    if (unavailableReason === "disabled") {
      return {
        status: "standard",
        reason: "disabled",
        message: "Better memory is off, so Greyfield used standard local memory for this message.",
        savedAtomCount,
        llmAttempted: false,
        fallbackUsed: false
      };
    }
    if (report) {
      return {
        status: report.status,
        reason: report.reason,
        message: report.message,
        savedAtomCount,
        llmAttempted: report.llmAttempted,
        fallbackUsed: report.fallbackUsed
      };
    }
    return {
      status: "standard",
      reason: "standard-only",
      message: "Standard local memory checked this message.",
      savedAtomCount,
      llmAttempted: false,
      fallbackUsed: false
    };
  }

  private createMemoryAtomExtractor(): MemoryAtomExtractor {
    if (this.options.memoryAtomExtractor) {
      return this.options.memoryAtomExtractor;
    }
    const mode = this.options.memoryAtomExtractionMode ?? "deterministic";
    if (mode === "llm" || mode === "hybrid") {
      return new LLMBackedMemoryAtomExtractor({
        llm: this.options.llm,
        mode,
        ...this.options.memoryAtomWritePolicy
      });
    }
    return new DeterministicMemoryAtomExtractor();
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
    const deletedEvidence = await this.loadDeletedMemoryEvidence();
    const turns = filterDeletedSessionTurns(
      await this.options.sessionStore.getRecent(this.recentTurnLimit + summaryBatchTurnLimit),
      deletedEvidence,
      this.options.sessionStore.sessionId
    );
    const oldTurns = turns.slice(0, Math.max(0, turns.length - this.recentTurnLimit));
    const existing = await summarySegmentStore.list(this.threadId);
    const summarizedTurnIds = new Set(existing.flatMap((segment) => getSummarySegmentSourceTurnIds(segment)));
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
      sourceTurnIds: draft.sourceTurnIds,
      sourceTurns: draft.sourceTurns
    });
  }
}

function normalizeRuntimeImageAttachments(attachments: RuntimeImageAttachment[] | undefined): RuntimeImageAttachment[] {
  if (!attachments) {
    return [];
  }
  return attachments.filter((attachment) => {
    const dataUrl = attachment.dataUrl.trim();
    const mimeType = attachment.mimeType.trim();
    return dataUrl.startsWith(`data:${mimeType};base64,`) && mimeType.startsWith("image/");
  });
}

function createObservationMetadata(
  observation: Extract<RuntimeInputEvent, { type: "text.input" }>["observation"],
  attachments: RuntimeImageAttachment[]
): RuntimeObservationMetadata | undefined {
  if (attachments.length === 0) {
    return;
  }
  const mode = observation?.mode ?? (attachments.length === 1 ? "single" : "normal");
  const frameCount = observation?.frameCount ?? attachments.length;
  const dedupedFrameCount = observation?.dedupedFrameCount ?? attachments.length;
  return {
    kind: "visual-observation",
    mode,
    frameCount,
    dedupedFrameCount,
    source: observation?.source ?? (mode === "single" ? "user-active-screenshot" : "user-active-observation")
  };
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

function hasSessionTurnLookup(store: SessionStore): store is SessionStore & SessionTurnLookup {
  return typeof (store as { getByIds?: unknown }).getByIds === "function";
}

function sanitizePromptTurns(turns: SessionTurn[], secrets: string[] | undefined): SessionTurn[] {
  return turns
    .filter((turn) => turn.role === "user" || turn.role === "assistant")
    .map((turn) => ({
      ...turn,
      content: redactPromptPrivateText(turn.content, secrets)
    }));
}

function buildPromptHandoffSummary(options: {
  summary: string;
  turns: SessionTurn[];
  deletedEvidence: DeletedMemoryEvidence[];
  sessionId: string;
  secrets: string[] | undefined;
}): string {
  const redactedSummary = redactPromptPrivateText(options.summary, options.secrets);
  if (!handoffSummaryContainsFilteredTurnContent(options)) {
    return redactedSummary;
  }
  return formatPromptTurnFallback(
    sanitizePromptTurns(filterDeletedSessionTurns(options.turns, options.deletedEvidence, options.sessionId), options.secrets)
  );
}

function handoffSummaryContainsFilteredTurnContent(options: {
  summary: string;
  turns: SessionTurn[];
  deletedEvidence: DeletedMemoryEvidence[];
  sessionId: string;
  secrets: string[] | undefined;
}): boolean {
  const summary = redactPromptPrivateText(options.summary, options.secrets);
  return options.turns.some((turn) => {
    if (turn.content.trim().length === 0) {
      return false;
    }
    const filtered =
      hasDeletedMemoryEvidenceSource(options.deletedEvidence, turn.id, options.sessionId) ||
      (turn.role !== "user" && turn.role !== "assistant");
    return filtered && summary.includes(redactPromptPrivateText(turn.content, options.secrets));
  });
}

function formatPromptTurnFallback(turns: SessionTurn[]): string {
  return turns.map((turn) => `${turn.role}: ${turn.content}`).join("\n");
}

function redactPromptPrivateText(value: string, configuredSecrets: string[] = []): string {
  const secrets = [...new Set(configuredSecrets.map((secret) => secret.trim()).filter(Boolean))].sort(
    (left, right) => right.length - left.length
  );
  let redacted = value;
  for (const secret of secrets) {
    redacted = redacted.split(secret).join(redactedSecretPlaceholder);
  }
  return redacted
    .replace(providerStyleSecretPattern, redactedSecretPlaceholder)
    .replace(secretAssignmentPattern, `$1${redactedSecretPlaceholder}`);
}

const redactedSecretPlaceholder = "[redacted-secret]";
const providerStyleSecretPattern = /\bsk-[A-Za-z0-9_-]{8,}\b/gu;
const secretAssignmentPattern = /\b(api[_\s-]?key|secret|token|password|authorization|cookie|credential)\s*[:=]\s*([^\s,;]+)/giu;
