import {
  GreyfieldRuntime,
  InMemorySessionStore,
  OpenAICompatibleASRProvider,
  OpenAICompatibleLLMProvider,
  OpenAICompatibleTTSProvider,
  buildProactiveMemoryDisplayMessage,
  buildProactiveMemoryPolicyForLevel,
  type ASRProvider,
  type CharacterPersona,
  type LLMProvider,
  type MemoryAtom,
  type MemoryAtomExtractionMode,
  type MemoryAtomExtractionStatusReason,
  type MemoryAtomStore,
  type DeletedMemoryEvidence,
  type DeletedMemoryEvidenceStore,
  type MemoryStore,
  type RecallContext,
  type SessionStore,
  type SessionTurn,
  type SessionTurnLookup,
  type SummarySegment,
  type SummarySegmentStore,
  type UpdateMemoryAtom,
  normalizeSummarySegmentUpdate,
  type UpdateSummarySegment,
  type RuntimeEventHandler,
  type RuntimeImageAttachment,
  type RuntimeInputEvent,
  type RuntimeObservationInput,
  type RuntimeOutputEvent,
  type RuntimeSceneContext,
  type ProactiveMemoryDisplayMessage,
  type ProactiveMemoryDisplayResult,
  type ProactiveMemoryTriggerState,
  type TTSProvider,
  type ChatMessage
} from "@greyfield/core-runtime";
import {
  filterDeletedSessionTurns,
  hasDeletedMemoryEvidenceSource,
  sourceTurnIdsContainDeletedEvidence
} from "@greyfield/core-runtime";
import { createDefaultInteractionProfile, FakeStageDriver } from "@greyfield/stage-live2d";
import type { GreyfieldConfig } from "@greyfield/persistence/config-schema";

export interface RuntimeServiceOptions {
  fetch?: typeof fetch;
  loadPersona?: (config: GreyfieldConfig) => Promise<CharacterPersona>;
  memoryStore?: MemoryStore;
  sessionStore?: SessionStore;
  summarySegmentStore?: SummarySegmentStore;
  memoryAtomStore?: MemoryAtomStore;
  deletedMemoryEvidenceStore?: DeletedMemoryEvidenceStore;
  threadId?: string;
  recentTurnLimit?: number;
  recallMaxItems?: number;
  recallMaxCharacters?: number;
  summaryBatchTurnLimit?: number;
  summaryMinTurns?: number;
  llmTimeoutMs?: number;
  asrTimeoutMs?: number;
  ttsTimeoutMs?: number;
}

export interface LLMTestResult {
  ok: boolean;
  message: string;
  firstToken?: string;
}

export interface VoiceTestResult {
  ok: boolean;
  message: string;
  text?: string;
  data?: Uint8Array;
}

export interface MemoryControlResult {
  ok: boolean;
  message: string;
  snapshot?: Awaited<ReturnType<RuntimeService["getMemoryLibrarySnapshot"]>>;
}

export interface MemorySourcePassage {
  sessionId: string;
  turnId: string;
  status: "available" | "missing" | "unavailable";
  role?: SessionTurn["role"];
  text?: string;
  createdAt?: string;
  message?: string;
  observationSource?: boolean;
}

export type MemoryLibrarySummarySegment = SummarySegment & {
  sourcePassages: MemorySourcePassage[];
};

export type MemoryLibraryAtom = MemoryAtom & {
  sourcePassages: MemorySourcePassage[];
};

export interface MemoryLibrarySnapshot {
  threadId: string;
  sessionId: string;
  recentTurns: Awaited<ReturnType<SessionStore["getRecent"]>>;
  summarySegments: MemoryLibrarySummarySegment[];
  memoryAtoms: MemoryLibraryAtom[];
  lastRecallContext?: RecallContext;
  updatedAt: string;
}

export interface MemoryExportResult {
  threadId: string;
  sessionId: string;
  recentTurns: Awaited<ReturnType<SessionStore["getRecent"]>>;
  summarySegments: MemoryLibrarySummarySegment[];
  memoryAtoms: MemoryLibraryAtom[];
  lastRecallContext?: RecallContext;
  exportedAt: string;
}

export type ProactiveDesktopMessage = ProactiveMemoryDisplayMessage;

export interface ProactiveDesktopCheckResult {
  displayed: boolean;
  message?: ProactiveDesktopMessage;
  reason?:
    | "disabled"
    | "missing_atom_store"
    | "active_runtime"
    | "recent_interrupt"
    | "no_screen_context"
    | "vision_model_missing"
    | "vision_model_not_ready"
    | "screen_awareness_cooldown"
    | ProactiveMemoryDisplayResult["reason"];
}

const proactiveInterruptCooldownMs = 60 * 1000;
const screenAwarenessProactiveCooldownMs = 5 * 60 * 1000;

export class RuntimeService {
  private config: GreyfieldConfig;
  private readonly stage = new FakeStageDriver();
  private readonly memoryStore: MemoryStore;
  private readonly sessionStore: SessionStore;
  private readonly summarySegmentStore: SummarySegmentStore | undefined;
  private readonly memoryAtomStore: MemoryAtomStore | undefined;
  private readonly deletedMemoryEvidenceStore: DeletedMemoryEvidenceStore | undefined;
  private readonly interactionProfile = createDefaultInteractionProfile();
  private lastRecallContext: RecallContext | undefined;
  private proactiveTriggerState: ProactiveMemoryTriggerState = {};
  private activeRuntime: GreyfieldRuntime | undefined;
  private testingLLM = false;
  private testingVoice = false;
  private lastInterruptedAtMs: number | undefined;
  private lastScreenAwarenessProactiveAtMs: number | undefined;

  constructor(config: GreyfieldConfig, private readonly options: RuntimeServiceOptions = {}) {
    this.config = config;
    this.memoryStore = options.memoryStore ?? new MainFakeMemoryStore();
    this.sessionStore = options.sessionStore ?? new InMemorySessionStore("desktop-main-session");
    this.summarySegmentStore = options.summarySegmentStore;
    this.memoryAtomStore = options.memoryAtomStore;
    this.deletedMemoryEvidenceStore = options.deletedMemoryEvidenceStore;
  }

  private get threadId(): string {
    return this.options.threadId ?? deriveThreadId(this.config);
  }

  updateConfig(config: GreyfieldConfig): void {
    const previousThreadId = this.threadId;
    this.config = config;
    if (this.threadId !== previousThreadId) {
      this.proactiveTriggerState = {};
    }
  }

  async handle(input: RuntimeInputEvent, emit: RuntimeEventHandler): Promise<void> {
    if (input.type === "runtime.interrupt") {
      this.lastInterruptedAtMs = Date.now();
    }
    if (input.type === "runtime.interrupt" && this.activeRuntime) {
      const runtime = this.activeRuntime;
      try {
        await runtime.handle(input, (event) => this.emitRuntimeEvent(event, emit));
      } finally {
        if (this.activeRuntime === runtime) {
          this.activeRuntime = undefined;
        }
      }
      return;
    }

    if (input.type === "text.input" && this.activeRuntime) {
      await this.activeRuntime.handle({ type: "runtime.interrupt" }, (event) => this.emitRuntimeEvent(event, emit));
    }

    if (input.type === "audio.chunk" && this.activeRuntime) {
      await this.activeRuntime.handle(input, (event) => this.emitRuntimeEvent(event, emit));
      return;
    }

    if (input.type === "audio.end" && this.activeRuntime) {
      const runtime = this.activeRuntime;
      try {
        await runtime.handle(input, (event) => this.emitRuntimeEvent(event, emit));
      } finally {
        if (this.activeRuntime === runtime) {
          this.activeRuntime = undefined;
        }
      }
      return;
    }

    const runtime = await this.createRuntime();
    if (input.type === "text.input" || input.type === "audio.chunk") {
      this.activeRuntime = runtime;
    }
    try {
      await runtime.handle(input, (event) => this.emitRuntimeEvent(event, emit));
    } finally {
      if (this.activeRuntime === runtime && input.type !== "audio.chunk") {
        this.activeRuntime = undefined;
      }
    }
  }

  async getRecentTurns(limit: number): Promise<Array<{ role: "user" | "assistant"; content: string }>> {
    const turns = this.filterMemoryLibraryRecentTurns(await this.sessionStore.getRecent(limit), await this.loadDeletedMemoryEvidence());
    return turns.flatMap((turn) =>
      turn.role === "user" || turn.role === "assistant" ? [{ role: turn.role, content: this.redactSecretText(turn.content) }] : []
    );
  }

  async getMemoryDebugSnapshot(limit = 20): Promise<MemoryLibrarySnapshot> {
    return this.getMemoryLibrarySnapshot(limit);
  }

  async getMemoryLibrarySnapshot(limit = 20): Promise<MemoryLibrarySnapshot> {
    const deletedEvidence = await this.loadDeletedMemoryEvidence();
    const recentTurns = this.filterMemoryLibraryRecentTurns(await this.sessionStore.getRecent(limit), deletedEvidence);
    const visibleSummarySegments = this.filterSummarySegmentsForDeletedEvidence(
      (await this.summarySegmentStore?.list(this.threadId)) ?? [],
      deletedEvidence
    );
    const visibleMemoryAtoms = this.filterMemoryAtomsForDeletedEvidence((await this.memoryAtomStore?.list(this.threadId)) ?? [], deletedEvidence);
    const [summarySegments, memoryAtoms] = await Promise.all([
      this.resolveSummarySegmentSources(visibleSummarySegments, recentTurns, deletedEvidence),
      this.resolveMemoryAtomSources(visibleMemoryAtoms, recentTurns, deletedEvidence)
    ]);
    return this.redactMemoryLibrarySnapshot({
      threadId: this.threadId,
      sessionId: this.sessionStore.sessionId,
      recentTurns,
      summarySegments,
      memoryAtoms,
      ...(this.lastRecallContext ? { lastRecallContext: this.lastRecallContext } : {}),
      updatedAt: new Date().toISOString()
    });
  }

  async updateMemorySummary(id: string, patch: UpdateSummarySegment): Promise<MemoryControlResult> {
    if (!this.summarySegmentStore) {
      return { ok: false, message: "Memory summaries are not available in this runtime." };
    }
    const normalized = normalizeSummarySegmentUpdate(patch);
    if (normalized.summary !== undefined && normalized.summary.length === 0) {
      return { ok: false, message: "Memory summary cannot be empty." };
    }
    if (
      normalized.summary === undefined &&
      normalized.recallCues === undefined &&
      normalized.disabled === undefined
    ) {
      return { ok: false, message: "No memory change was provided." };
    }

    const existing = await this.getCurrentThreadSummarySegment(id);
    if (!existing) {
      return { ok: false, message: `Memory summary ${id} was not found in the current role.` };
    }
    const updated = await this.summarySegmentStore.update(id, normalized);
    if (!updated || updated.threadId !== this.threadId) {
      return { ok: false, message: `Memory summary ${id} was not found in the current role.` };
    }
    this.lastRecallContext = undefined;
    return {
      ok: true,
      message: updated.disabled ? `Memory ${id} disabled.` : `Memory ${id} saved.`,
      snapshot: await this.getMemoryLibrarySnapshot()
    };
  }

  async deleteMemorySummary(id: string): Promise<MemoryControlResult> {
    if (!this.summarySegmentStore) {
      return { ok: false, message: "Memory summaries are not available in this runtime." };
    }
    const existing = await this.getCurrentThreadSummarySegment(id);
    if (!existing) {
      return { ok: false, message: `Memory summary ${id} was not found in the current role.` };
    }
    await this.recordDeletedSummaryEvidence(existing);
    const deleted = await this.summarySegmentStore.delete(id);
    this.lastRecallContext = undefined;
    if (!deleted) {
      return {
        ok: false,
        message: `Memory summary ${id} could not be deleted after remembered source evidence was hidden.`,
        snapshot: await this.getMemoryLibrarySnapshot()
      };
    }
    return {
      ok: true,
      message: `Memory ${id} deleted. Remembered source evidence was hidden from recall, source views, and exports.`,
      snapshot: await this.getMemoryLibrarySnapshot()
    };
  }

  async clearMemorySummaries(): Promise<MemoryControlResult> {
    if (!this.summarySegmentStore) {
      return { ok: false, message: "Memory summaries are not available in this runtime." };
    }
    const summaries = await this.summarySegmentStore.list(this.threadId);
    if (summaries.length === 0) {
      return {
        ok: true,
        message: "No summary memory to clear.",
        snapshot: await this.getMemoryLibrarySnapshot()
      };
    }

    for (const segment of summaries) {
      await this.recordDeletedSummaryEvidence(segment);
    }
    let deletedCount = 0;
    for (const segment of summaries) {
      if (await this.summarySegmentStore.delete(segment.id)) {
        deletedCount += 1;
      }
    }
    this.lastRecallContext = undefined;
    if (deletedCount !== summaries.length) {
      return {
        ok: false,
        message: `Cleared ${deletedCount} of ${summaries.length} summary ${summaries.length === 1 ? "memory" : "memories"} after remembered source evidence was hidden.`,
        snapshot: await this.getMemoryLibrarySnapshot()
      };
    }
    return {
      ok: true,
      message: `Cleared ${summaries.length} summary ${summaries.length === 1 ? "memory" : "memories"}. Remembered source evidence was hidden from recall, source views, and exports.`,
      snapshot: await this.getMemoryLibrarySnapshot()
    };
  }

  async exportMemory(limit = 200): Promise<MemoryExportResult> {
    const snapshot = await this.getMemoryLibrarySnapshot(limit);
    return {
      threadId: snapshot.threadId,
      sessionId: snapshot.sessionId,
      recentTurns: snapshot.recentTurns,
      summarySegments: snapshot.summarySegments,
      memoryAtoms: snapshot.memoryAtoms,
      ...(snapshot.lastRecallContext ? { lastRecallContext: snapshot.lastRecallContext } : {}),
      exportedAt: new Date().toISOString()
    };
  }

  async checkProactiveMemory(sceneContext: RuntimeSceneContext): Promise<ProactiveDesktopCheckResult> {
    if (!this.config.ui.proactiveMemoryEnabled || this.config.ui.proactivityLevel <= 0) {
      return { displayed: false, reason: "disabled" };
    }
    if (this.activeRuntime) {
      return { displayed: false, reason: "active_runtime" };
    }
    if (this.lastInterruptedAtMs !== undefined && Date.now() - this.lastInterruptedAtMs < proactiveInterruptCooldownMs) {
      return { displayed: false, reason: "recent_interrupt" };
    }
    if (!this.memoryAtomStore) {
      return { displayed: false, reason: "missing_atom_store" };
    }

    const atoms = this.filterMemoryAtomsForDeletedEvidence(
      await this.memoryAtomStore.list(this.threadId),
      await this.loadDeletedMemoryEvidence()
    );
    const result = buildProactiveMemoryDisplayMessage({
      atoms,
      sceneContext,
      policy: buildProactiveMemoryPolicyForLevel(this.config.ui.proactivityLevel, {
        enabled: this.config.ui.proactiveMemoryEnabled
      }),
      triggerState: this.proactiveTriggerState
    });
    if (result.response.displayed) {
      this.proactiveTriggerState = result.nextTriggerState;
    }
    return result.response;
  }

  async checkProactiveScreenAwareness(input: {
    attachments: RuntimeImageAttachment[];
    observation?: RuntimeObservationInput;
  }): Promise<ProactiveDesktopCheckResult> {
    if (!this.config.ui.proactiveMemoryEnabled || this.config.ui.proactivityLevel <= 0) {
      return { displayed: false, reason: "disabled" };
    }
    if (this.activeRuntime) {
      return { displayed: false, reason: "active_runtime" };
    }
    if (this.lastInterruptedAtMs !== undefined && Date.now() - this.lastInterruptedAtMs < proactiveInterruptCooldownMs) {
      return { displayed: false, reason: "recent_interrupt" };
    }
    if (this.lastScreenAwarenessProactiveAtMs !== undefined && Date.now() - this.lastScreenAwarenessProactiveAtMs < screenAwarenessProactiveCooldownMs) {
      return { displayed: false, reason: "screen_awareness_cooldown" };
    }
    const attachments = input.attachments.filter((attachment) => attachment.dataUrl.startsWith(`data:${attachment.mimeType};base64,`));
    if (attachments.length === 0) {
      return { displayed: false, reason: "no_screen_context" };
    }
    if (this.config.provider.visionModel.trim().length === 0) {
      return { displayed: false, reason: "vision_model_missing" };
    }
    if (this.validateOpenAICompatibleVisionProviderConfig("chatting with screen awareness")) {
      return { displayed: false, reason: "vision_model_not_ready" };
    }
    const llm = this.createVisionLLMProvider();
    if (!llm) {
      return { displayed: false, reason: "vision_model_not_ready" };
    }

    const messages: ChatMessage[] = [
      {
        role: "system",
        content: [
          "You are Greyfield, a visible Live2D desktop companion.",
          "Screen awareness is enabled and the user has not spoken first.",
          "If the recent desktop visual context gives a natural, low-disturbance reason to speak, say one short sentence.",
          "Do not mention raw screenshots, frame counts, files, or hidden monitoring.",
          "Do not claim control of the desktop."
        ].join("\n")
      },
      {
        role: "user",
        content: [
          {
            type: "text",
            text: "Use this temporary desktop visual context only if it naturally supports one proactive desktop-pet remark."
          },
          ...attachments.map((attachment) => ({
            type: "image_url" as const,
            image_url: { url: attachment.dataUrl, detail: "low" as const }
          }))
        ]
      }
    ];
    let text = "";
    try {
      for await (const chunk of llm.stream(messages)) {
        text += chunk;
        if (text.length > 240) {
          break;
        }
      }
    } catch {
      return { displayed: false, reason: "vision_model_not_ready" };
    }
    const normalized = text.replace(/\s+/g, " ").trim();
    if (normalized.length === 0) {
      return { displayed: false, reason: "no_screen_context" };
    }
    this.lastScreenAwarenessProactiveAtMs = Date.now();
    return {
      displayed: true,
      message: {
        text: normalized,
        createdAt: new Date().toISOString()
      }
    };
  }

  async updateMemoryAtom(id: string, patch: UpdateMemoryAtom): Promise<MemoryControlResult> {
    if (!this.memoryAtomStore) {
      return { ok: false, message: "Atom memory is not available in this runtime." };
    }
    const normalized = normalizeMemoryAtomPatch(patch);
    if (normalized.text !== undefined && normalized.text.length === 0) {
      return { ok: false, message: "Atom memory text cannot be empty." };
    }
    if (normalized.text === undefined && normalized.disabled === undefined && normalized.importance === undefined) {
      return { ok: false, message: "No atom memory change was provided." };
    }

    const existing = await this.getCurrentThreadMemoryAtom(id);
    if (!existing) {
      return { ok: false, message: `Atom memory ${id} was not found in the current role.` };
    }
    const updated = await this.memoryAtomStore.update(id, normalized);
    if (!updated || updated.threadId !== this.threadId) {
      return { ok: false, message: `Atom memory ${id} was not found in the current role.` };
    }
    this.lastRecallContext = undefined;
    return {
      ok: true,
      message: updated.disabled ? `Atom memory ${id} disabled.` : `Atom memory ${id} saved.`,
      snapshot: await this.getMemoryLibrarySnapshot()
    };
  }

  async deleteMemoryAtom(id: string): Promise<MemoryControlResult> {
    if (!this.memoryAtomStore) {
      return { ok: false, message: "Atom memory is not available in this runtime." };
    }
    const existing = await this.getCurrentThreadMemoryAtom(id);
    if (!existing) {
      return { ok: false, message: `Atom memory ${id} was not found in the current role.` };
    }
    await this.recordDeletedAtomEvidence(existing);
    const deleted = await this.memoryAtomStore.delete(id);
    this.lastRecallContext = undefined;
    if (!deleted) {
      return {
        ok: false,
        message: `Atom memory ${id} could not be deleted after remembered source evidence was hidden.`,
        snapshot: await this.getMemoryLibrarySnapshot()
      };
    }
    return {
      ok: true,
      message: `Atom memory ${id} deleted. Remembered source evidence was hidden from recall, source views, and exports.`,
      snapshot: await this.getMemoryLibrarySnapshot()
    };
  }

  async clearCurrentRoleMemoryAtoms(): Promise<MemoryControlResult> {
    if (!this.memoryAtomStore) {
      return { ok: false, message: "Atom memory is not available in this runtime." };
    }
    const atoms = await this.memoryAtomStore.list(this.threadId);
    if (atoms.length === 0) {
      return {
        ok: true,
        message: "No current role atom memories to clear.",
        snapshot: await this.getMemoryLibrarySnapshot()
      };
    }
    for (const atom of atoms) {
      await this.recordDeletedAtomEvidence(atom);
    }
    let deletedCount = 0;
    for (const atom of atoms) {
      if (await this.memoryAtomStore.delete(atom.id)) {
        deletedCount += 1;
      }
    }
    this.lastRecallContext = undefined;
    if (deletedCount !== atoms.length) {
      return {
        ok: false,
        message: `Cleared ${deletedCount} of ${atoms.length} current role atom ${atoms.length === 1 ? "memory" : "memories"} after remembered source evidence was hidden.`,
        snapshot: await this.getMemoryLibrarySnapshot()
      };
    }
    return {
      ok: true,
      message: `Cleared ${atoms.length} current role atom ${atoms.length === 1 ? "memory" : "memories"}. Remembered source evidence was hidden from recall, source views, and exports.`,
      snapshot: await this.getMemoryLibrarySnapshot()
    };
  }

  async exportMemoryAtom(id: string): Promise<MemoryExportResult | null> {
    const atom = await this.getCurrentThreadMemoryAtom(id);
    if (!atom) {
      return null;
    }
    const snapshot = await this.getMemoryLibrarySnapshot(0);
    return {
      threadId: snapshot.threadId,
      sessionId: snapshot.sessionId,
      recentTurns: [],
      summarySegments: [],
      memoryAtoms: snapshot.memoryAtoms.filter((snapshotAtom) => snapshotAtom.id === atom.id),
      exportedAt: new Date().toISOString()
    };
  }

  async testLLM(): Promise<LLMTestResult> {
    if (this.activeRuntime) {
      return {
        ok: false,
        message: "LLM test is unavailable while a chat response is running."
      };
    }
    if (this.testingLLM) {
      return {
        ok: false,
        message: "LLM test is already running."
      };
    }
    const providerConfigError = this.validateOpenAICompatibleProviderConfig("testing");
    if (providerConfigError) {
      return { ok: false, message: providerConfigError };
    }

    this.testingLLM = true;
    try {
      const provider = this.createLLMProvider();
      const messages: ChatMessage[] = [
        { role: "system", content: "You are testing connectivity. Reply with one short token." },
        { role: "user", content: "ping" }
      ];
      for await (const chunk of provider.stream(messages)) {
        const firstToken = chunk.trim();
        if (firstToken.length > 0) {
          return {
            ok: true,
            message: `LLM test succeeded: ${firstToken}`,
            firstToken
          };
        }
      }
      return {
        ok: false,
        message: "LLM test finished without receiving a token."
      };
    } catch (error) {
      return {
        ok: false,
        message: error instanceof Error ? error.message : String(error)
      };
    } finally {
      this.testingLLM = false;
    }
  }

  async testVoice(): Promise<VoiceTestResult> {
    if (this.activeRuntime) {
      return {
        ok: false,
        message: "Voice test is unavailable while a chat response is running."
      };
    }
    if (this.testingVoice) {
      return {
        ok: false,
        message: "Voice test is already running."
      };
    }
    const providerConfigError = this.validateTTSProviderConfig();
    if (providerConfigError) {
      return { ok: false, message: providerConfigError };
    }

    this.testingVoice = true;
    const text = "你好，这是 Greyfield 的语音测试。";
    try {
      const data = await this.createTTSProvider().synthesize(text, this.config.voice.id);
      return {
        ok: true,
        message: "Voice test succeeded.",
        text,
        data
      };
    } catch (error) {
      return {
        ok: false,
        message: error instanceof Error ? error.message : String(error)
      };
    } finally {
      this.testingVoice = false;
    }
  }

  private async createRuntime(): Promise<GreyfieldRuntime> {
    const persona = await this.loadPersona();
    const atomExtractionPolicy = this.resolveMemoryAtomExtractionPolicy();
    return new GreyfieldRuntime({
      llm: this.createLLMProvider(),
      visionLlm: this.createVisionLLMProvider(),
      asr: this.createASRProvider(),
      tts: this.createTTSProvider(),
      memoryStore: this.memoryStore,
      summarySegmentStore: this.summarySegmentStore,
      memoryAtomStore: this.memoryAtomStore,
      deletedMemoryEvidenceStore: this.deletedMemoryEvidenceStore,
      memoryAtomExtractionMode: atomExtractionPolicy.mode,
      ...(atomExtractionPolicy.unavailableReason
        ? { memoryAtomExtractionUnavailableReason: atomExtractionPolicy.unavailableReason }
        : {}),
      sessionStore: this.sessionStore,
      persona,
      voice: this.config.voice.id,
      stage: this.stage,
      threadId: this.threadId,
      recentTurnLimit: this.options.recentTurnLimit,
      recallMaxItems: this.options.recallMaxItems,
      recallMaxCharacters: this.options.recallMaxCharacters,
      summaryBatchTurnLimit: this.options.summaryBatchTurnLimit,
      summaryMinTurns: this.options.summaryMinTurns,
      ttsEnabled: this.config.voice.speechEnabled,
      promptRedactionSecrets: [this.config.provider.apiKey]
    });
  }

  private resolveMemoryAtomExtractionPolicy(): {
    mode: MemoryAtomExtractionMode;
    unavailableReason?: Extract<MemoryAtomExtractionStatusReason, "disabled" | "provider-unavailable">;
  } {
    if (!this.config.memory.llmAtomExtractionEnabled) {
      return { mode: "deterministic", unavailableReason: "disabled" };
    }
    const providerConfigError = this.validateOpenAICompatibleProviderConfig("chatting");
    if (this.config.provider.llm !== "openai-compatible" || providerConfigError) {
      return { mode: "deterministic", unavailableReason: "provider-unavailable" };
    }
    return { mode: "hybrid" };
  }

  private async emitRuntimeEvent(event: RuntimeOutputEvent, emit: RuntimeEventHandler): Promise<void> {
    if (event.type === "memory.recall.context") {
      const context = this.redactRecallContext(event.context);
      this.lastRecallContext = context;
      await emit({ ...event, context });
      return;
    }
    await emit(event);
  }

  private async loadPersona(): Promise<CharacterPersona> {
    return this.options.loadPersona?.(this.config) ?? this.createDefaultPersona();
  }

  private async getCurrentThreadMemoryAtom(id: string): Promise<MemoryAtom | null> {
    const atoms = (await this.memoryAtomStore?.list(this.threadId)) ?? [];
    return atoms.find((atom) => atom.id === id) ?? null;
  }

  private async getCurrentThreadSummarySegment(id: string): Promise<SummarySegment | null> {
    const segments = (await this.summarySegmentStore?.list(this.threadId)) ?? [];
    return segments.find((segment) => segment.id === id) ?? null;
  }

  private async loadDeletedMemoryEvidence(): Promise<DeletedMemoryEvidence[]> {
    if (!this.deletedMemoryEvidenceStore) {
      return [];
    }
    return this.deletedMemoryEvidenceStore.list(this.threadId);
  }

  private filterMemoryLibraryRecentTurns(turns: SessionTurn[], deletedEvidence: DeletedMemoryEvidence[]): SessionTurn[] {
    return filterDeletedSessionTurns(turns, deletedEvidence, this.sessionStore.sessionId).filter(
      (turn) => turn.role === "user" || turn.role === "assistant"
    );
  }

  private filterSummarySegmentsForDeletedEvidence(
    segments: SummarySegment[],
    deletedEvidence: DeletedMemoryEvidence[]
  ): SummarySegment[] {
    return segments.filter((segment) => !sourceTurnIdsContainDeletedEvidence(getSummarySourceRefs(segment, this.sessionStore.sessionId).map((ref) => ref.turnId), deletedEvidence, segment.sessionId));
  }

  private filterMemoryAtomsForDeletedEvidence(atoms: MemoryAtom[], deletedEvidence: DeletedMemoryEvidence[]): MemoryAtom[] {
    return atoms.filter(
      (atom) =>
        !sourceTurnIdsContainDeletedEvidence(atom.sourceTurnIds, deletedEvidence, atom.sourceSessionId ?? this.sessionStore.sessionId)
    );
  }

  private async recordDeletedSummaryEvidence(segment: SummarySegment): Promise<void> {
    if (!this.deletedMemoryEvidenceStore) {
      return;
    }
    const refs = getSummarySourceRefs(segment, this.sessionStore.sessionId);
    await this.recordDeletedEvidence("summary-segment", segment.id, refs);
  }

  private async recordDeletedAtomEvidence(atom: MemoryAtom): Promise<void> {
    if (!this.deletedMemoryEvidenceStore) {
      return;
    }
    await this.recordDeletedEvidence("memory-atom", atom.id, getAtomSourceRefs(atom, this.sessionStore.sessionId));
  }

  private async recordDeletedEvidence(
    kind: "summary-segment" | "memory-atom",
    memoryId: string,
    refs: SourceTurnRef[]
  ): Promise<void> {
    const refsBySession = new Map<string, string[]>();
    for (const ref of refs) {
      refsBySession.set(ref.sessionId, [...(refsBySession.get(ref.sessionId) ?? []), ref.turnId]);
    }
    for (const [sourceSessionId, sourceTurnIds] of refsBySession) {
      if (sourceTurnIds.length === 0) {
        continue;
      }
      await this.deletedMemoryEvidenceStore?.append({
        threadId: this.threadId,
        kind,
        memoryId,
        sourceTurnIds,
        sourceSessionId
      });
    }
  }

  private async resolveSummarySegmentSources(
    segments: SummarySegment[],
    recentTurns: SessionTurn[],
    deletedEvidence: DeletedMemoryEvidence[]
  ): Promise<MemoryLibrarySummarySegment[]> {
    return Promise.all(
      segments.map(async (segment) => ({
        ...segment,
        sourcePassages: await this.resolveSourcePassages(getSummarySourceRefs(segment, this.sessionStore.sessionId), recentTurns, deletedEvidence)
      }))
    );
  }

  private async resolveMemoryAtomSources(
    atoms: MemoryAtom[],
    recentTurns: SessionTurn[],
    deletedEvidence: DeletedMemoryEvidence[]
  ): Promise<MemoryLibraryAtom[]> {
    return Promise.all(
      atoms.map(async (atom) => ({
        ...atom,
        sourcePassages: await this.resolveSourcePassages(getAtomSourceRefs(atom, this.sessionStore.sessionId), recentTurns, deletedEvidence)
      }))
    );
  }

  private async resolveSourcePassages(
    refs: SourceTurnRef[],
    recentTurns: SessionTurn[],
    deletedEvidence: DeletedMemoryEvidence[]
  ): Promise<MemorySourcePassage[]> {
    if (refs.length === 0) {
      return [];
    }
    const currentSessionId = this.sessionStore.sessionId;
    const currentSessionRefs = refs.filter((ref) => ref.sessionId === currentSessionId);
    const currentTurns = new Map(recentTurns.map((turn) => [turn.id, turn]));
    let currentLookupUnavailable = !hasSessionTurnLookup(this.sessionStore);
    if (currentSessionRefs.length > 0 && hasSessionTurnLookup(this.sessionStore)) {
      try {
        for (const turn of await this.sessionStore.getByIds(currentSessionRefs.map((ref) => ref.turnId))) {
          currentTurns.set(turn.id, turn);
        }
      } catch {
        currentLookupUnavailable = true;
      }
    }

    return refs.map((ref) => {
      if (hasDeletedMemoryEvidenceSource(deletedEvidence, ref.turnId, ref.sessionId)) {
        return {
          sessionId: ref.sessionId,
          turnId: ref.turnId,
          status: "unavailable",
          ...(ref.role ? { role: ref.role } : {}),
          ...(ref.createdAt ? { createdAt: ref.createdAt } : {}),
          message: "Source turn was erased with a deleted memory."
        };
      }
      if (ref.sessionId !== currentSessionId) {
        return {
          sessionId: ref.sessionId,
          turnId: ref.turnId,
          status: "unavailable",
          ...(ref.role ? { role: ref.role } : {}),
          ...(ref.createdAt ? { createdAt: ref.createdAt } : {}),
          message: "Source turn belongs to another session and is unavailable in the current local store."
        };
      }
      const turn = currentTurns.get(ref.turnId);
      if (turn && turn.role !== "user" && turn.role !== "assistant") {
        return {
          sessionId: ref.sessionId,
          turnId: ref.turnId,
          status: "unavailable",
          role: turn.role,
          createdAt: turn.createdAt,
          message: "Private runtime event is not a memory source."
        };
      }
      if (!turn) {
        if (currentLookupUnavailable) {
          return {
            sessionId: ref.sessionId,
            turnId: ref.turnId,
            status: "unavailable",
            ...(ref.role ? { role: ref.role } : {}),
            ...(ref.createdAt ? { createdAt: ref.createdAt } : {}),
            message: "Source turn lookup is unavailable in the current local store."
          };
        }
        return {
          sessionId: ref.sessionId,
          turnId: ref.turnId,
          status: "missing",
          ...(ref.role ? { role: ref.role } : {}),
          ...(ref.createdAt ? { createdAt: ref.createdAt } : {}),
          message: "Source turn is missing from the current session store."
        };
      }
      return {
        sessionId: ref.sessionId,
        turnId: ref.turnId,
        status: "available",
        role: turn.role,
        text: turn.content,
        createdAt: turn.createdAt,
        ...(isObservationSourceTurn(turn) ? { observationSource: true } : {})
      };
    });
  }

  private redactMemoryLibrarySnapshot(snapshot: MemoryLibrarySnapshot): MemoryLibrarySnapshot {
    return {
      ...snapshot,
      recentTurns: snapshot.recentTurns.map((turn) => this.redactSessionTurn(turn)),
      summarySegments: snapshot.summarySegments.map((segment) => this.redactSummarySegment(segment)),
      memoryAtoms: snapshot.memoryAtoms.map((atom) => this.redactMemoryAtom(atom)),
      ...(snapshot.lastRecallContext ? { lastRecallContext: this.redactRecallContext(snapshot.lastRecallContext) } : {})
    };
  }

  private redactSessionTurn(turn: SessionTurn): SessionTurn {
    return {
      ...turn,
      content: this.redactSecretText(turn.content),
      ...(turn.meta ? { meta: redactSecretValue(turn.meta, (value) => this.redactSecretText(value)) as Record<string, unknown> } : {})
    };
  }

  private redactSummarySegment(segment: MemoryLibrarySummarySegment): MemoryLibrarySummarySegment {
    return {
      ...segment,
      summary: this.redactSecretText(segment.summary),
      recallCues: segment.recallCues.map((cue) => this.redactSecretText(cue)),
      sourcePassages: segment.sourcePassages.map((passage) => this.redactSourcePassage(passage))
    };
  }

  private redactMemoryAtom(atom: MemoryLibraryAtom): MemoryLibraryAtom {
    return {
      ...atom,
      text: this.redactSecretText(atom.text),
      triggerKeys: atom.triggerKeys.map((key) => this.redactSecretText(key)),
      triggers: redactSecretValue(atom.triggers, (value) => this.redactSecretText(value)) as MemoryAtom["triggers"],
      ...(atom.eventDate
        ? {
            eventDate: {
              ...atom.eventDate,
              sourceText: this.redactSecretText(atom.eventDate.sourceText)
            }
          }
        : {}),
      ...(atom.recurrence
        ? {
            recurrence: {
              ...atom.recurrence,
              sourceText: this.redactSecretText(atom.recurrence.sourceText)
            }
          }
        : {}),
      ...(atom.ritualAction ? { ritualAction: this.redactSecretText(atom.ritualAction) } : {}),
      ...(atom.subject ? { subject: this.redactSecretText(atom.subject) } : {}),
      ...(atom.object ? { object: this.redactSecretText(atom.object) } : {}),
      ...(atom.metadata
        ? { metadata: redactSecretValue(atom.metadata, (value) => this.redactSecretText(value)) as MemoryAtom["metadata"] }
        : {}),
      sourcePassages: atom.sourcePassages.map((passage) => this.redactSourcePassage(passage))
    };
  }

  private redactSourcePassage(passage: MemorySourcePassage): MemorySourcePassage {
    return {
      ...passage,
      ...(passage.text ? { text: this.redactSecretText(passage.text) } : {}),
      ...(passage.message ? { message: this.redactSecretText(passage.message) } : {})
    };
  }

  private redactRecallContext(context: RecallContext): RecallContext {
    return {
      items: context.items.map((item) => ({
        ...item,
        summary: this.redactSecretText(item.summary),
        recallCues: item.recallCues.map((cue) => this.redactSecretText(cue)),
        reason: this.redactSecretText(item.reason)
      })),
      skipped: context.skipped.map((item) => ({
        ...item,
        reason: item.reason
      })),
      budget: context.budget
    };
  }

  private redactSecretText(value: string): string {
    return redactSecretText(value, [this.config.provider.apiKey]);
  }

  private createDefaultPersona(): CharacterPersona {
    return {
      name: "Greyfield",
      userAddress: "you",
      background: "A Live2D desktop companion focused on presence, conversation, and continuity.",
      personality: "Warm, steady, observant, and lightly playful without pretending to control the desktop.",
      speakingStyle: "Keep replies short enough to speak naturally and prefer concrete progress over vague planning.",
      greeting: "你好，我在。",
      tone: "warm, concise, slightly playful",
      boundaries: ["V1 cannot control the desktop", "V1 cannot browse the web on its own"],
      expressionMap: Object.fromEntries(
        Object.entries(this.interactionProfile.emotionReactions).map(([status, reaction]) => [
          status,
          reaction.expression ?? "default"
        ])
      )
    };
  }

  private createLLMProvider(): LLMProvider {
    if (this.config.provider.llm === "openai-compatible") {
      const providerConfigError = this.validateOpenAICompatibleProviderConfig("chatting");
      if (providerConfigError) {
        throw new Error(providerConfigError);
      }
      return new OpenAICompatibleLLMProvider({
        baseUrl: this.config.provider.baseUrl,
        apiKey: this.config.provider.apiKey,
        model: this.config.provider.model,
        fetch: this.options.fetch,
        timeoutMs: this.options.llmTimeoutMs
      });
    }
    return new MainFakeLLMProvider();
  }

  private createVisionLLMProvider(): LLMProvider | undefined {
    if (this.config.provider.visionModel.trim().length === 0) {
      return undefined;
    }
    if (this.config.provider.llm === "openai-compatible") {
      const providerConfigError = this.validateOpenAICompatibleVisionProviderConfig("chatting with screen awareness");
      if (providerConfigError) {
        return undefined;
      }
      return new OpenAICompatibleLLMProvider({
        baseUrl: this.config.provider.baseUrl,
        apiKey: this.config.provider.apiKey,
        model: this.config.provider.visionModel,
        supportsVision: true,
        fetch: this.options.fetch,
        timeoutMs: this.options.llmTimeoutMs
      });
    }
    return new MainFakeVisionLLMProvider();
  }

  private createASRProvider(): ASRProvider {
    if (this.config.provider.asr === "openai-compatible") {
      const providerConfigError = this.validateASRProviderConfig("transcribing");
      if (providerConfigError) {
        throw new Error(providerConfigError);
      }
      return new OpenAICompatibleASRProvider({
        baseUrl: this.config.provider.baseUrl,
        apiKey: this.config.provider.apiKey,
        model: this.config.provider.asrModel,
        fetch: this.options.fetch,
        timeoutMs: this.options.asrTimeoutMs
      });
    }
    return new MainFakeASRProvider();
  }

  private createTTSProvider(): TTSProvider {
    if (this.config.provider.tts === "openai-compatible") {
      return new OpenAICompatibleTTSProvider({
        baseUrl: this.config.provider.baseUrl,
        apiKey: this.config.provider.apiKey,
        model: this.config.provider.ttsModel,
        fetch: this.options.fetch,
        timeoutMs: this.options.ttsTimeoutMs
      });
    }
    return new MainFakeTTSProvider();
  }

  private validateOpenAICompatibleProviderConfig(action: "testing" | "chatting"): string {
    if (this.config.provider.llm !== "openai-compatible") {
      return "";
    }
    if (this.config.provider.baseUrl.trim().length === 0) {
      return `OpenAI-compatible provider needs a Base URL before ${action}.`;
    }
    if (this.config.provider.apiKey.trim().length === 0) {
      return `OpenAI-compatible provider needs an API key before ${action}.`;
    }
    if (this.config.provider.model.trim().length === 0) {
      return `OpenAI-compatible provider needs a model before ${action}.`;
    }
    return "";
  }

  private validateOpenAICompatibleVisionProviderConfig(action: "chatting with screen awareness"): string {
    if (this.config.provider.llm !== "openai-compatible") {
      return "";
    }
    if (this.config.provider.baseUrl.trim().length === 0) {
      return `OpenAI-compatible Vision model needs a Base URL before ${action}.`;
    }
    if (this.config.provider.apiKey.trim().length === 0) {
      return `OpenAI-compatible Vision model needs an API key before ${action}.`;
    }
    if (this.config.provider.visionModel.trim().length === 0) {
      return `OpenAI-compatible Vision model needs a model before ${action}.`;
    }
    return "";
  }

  private validateTTSProviderConfig(): string {
    if (this.config.provider.tts !== "openai-compatible") {
      return "";
    }
    if (this.config.provider.baseUrl.trim().length === 0) {
      return "OpenAI-compatible TTS needs a Base URL before testing voice.";
    }
    if (this.config.provider.apiKey.trim().length === 0) {
      return "OpenAI-compatible TTS needs an API key before testing voice.";
    }
    if (this.config.provider.ttsModel.trim().length === 0) {
      return "OpenAI-compatible TTS needs a TTS model before testing voice.";
    }
    if (this.config.voice.id.trim().length === 0) {
      return "OpenAI-compatible TTS needs a voice before testing voice.";
    }
    return "";
  }

  private validateASRProviderConfig(action: "transcribing"): string {
    if (this.config.provider.asr !== "openai-compatible") {
      return "";
    }
    if (this.config.provider.baseUrl.trim().length === 0) {
      return `OpenAI-compatible ASR needs a Base URL before ${action}.`;
    }
    if (this.config.provider.apiKey.trim().length === 0) {
      return `OpenAI-compatible ASR needs an API key before ${action}.`;
    }
    if (this.config.provider.asrModel.trim().length === 0) {
      return `OpenAI-compatible ASR needs an ASR model before ${action}.`;
    }
    return "";
  }
}

class MainFakeLLMProvider implements LLMProvider {
  async *stream(messages: ChatMessage[]): AsyncIterable<string> {
    yield "你好，我醒着。";
    yield "现在可以继续做桌宠了。";
  }
}

class MainFakeVisionLLMProvider implements LLMProvider {
  readonly supportsVision = true;

  async *stream(messages: ChatMessage[]): AsyncIterable<string> {
    const systemText = typeof messages[0]?.content === "string" ? messages[0].content : "";
    const last = messages.at(-1);
    const attachmentCount = Array.isArray(last?.content)
      ? last.content.filter((part) => part.type === "image_url").length
      : 0;
    if (systemText.includes("Screen awareness is enabled") && attachmentCount > 0) {
      yield "我看到桌面上有新的画面，可以陪你一起看。";
      return;
    }
    if (attachmentCount > 0) {
      yield "我看到了最近的桌面画面。";
      yield "可以继续问我画面里的细节。";
      return;
    }
    yield "我现在没有新的画面可看。";
  }
}

class MainFakeTTSProvider implements TTSProvider {
  async synthesize(text: string): Promise<Uint8Array> {
    return new TextEncoder().encode(`fake-audio:${text}`);
  }
}

class MainFakeASRProvider implements ASRProvider {
  async transcribe(audio: Uint8Array): Promise<string> {
    if (audio.length === 0) {
      return "";
    }
    return "这是麦克风语音输入。";
  }
}

class MainFakeMemoryStore implements MemoryStore {
  async load(): Promise<string> {
    return "- Greyfield Next desktop runtime is using local fake providers.";
  }

  async save(): Promise<void> {
    return undefined;
  }

  async consolidate(): Promise<string> {
    return "- Greyfield Next desktop runtime is using local fake providers.";
  }
}

function deriveThreadId(config: GreyfieldConfig): string {
  const source = config.characterFile.trim() || "default-character";
  const slug = source.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  return `desktop:${slug || "default-character"}`;
}

function normalizeMemoryAtomPatch(patch: UpdateMemoryAtom): UpdateMemoryAtom {
  return {
    ...(patch.text !== undefined ? { text: patch.text.trim() } : {}),
    ...(patch.disabled !== undefined ? { disabled: patch.disabled } : {}),
    ...(patch.importance !== undefined ? { importance: patch.importance } : {}),
    ...(patch.triggers !== undefined ? { triggers: patch.triggers } : {}),
    ...(patch.updatedAt !== undefined ? { updatedAt: patch.updatedAt } : {})
  };
}

interface SourceTurnRef {
  sessionId: string;
  turnId: string;
  role?: SessionTurn["role"];
  createdAt?: string;
}

function getSummarySourceRefs(segment: SummarySegment, currentSessionId: string): SourceTurnRef[] {
  if (segment.sourceTurns.length > 0) {
    return normalizeSourceRefs(
      segment.sourceTurns.map((turn) => ({
        sessionId: turn.sessionId,
        turnId: turn.turnId,
        role: turn.role,
        createdAt: turn.createdAt
      }))
    );
  }
  return normalizeSourceRefs(
    (segment.sourceTurnIds ?? []).map((turnId) => ({
      sessionId: currentSessionId,
      turnId
    }))
  );
}

function getAtomSourceRefs(atom: MemoryAtom, currentSessionId: string): SourceTurnRef[] {
  const sessionId = atom.sourceSessionId ?? currentSessionId;
  return normalizeSourceRefs(
    atom.sourceTurnIds.map((turnId) => ({
      sessionId,
      turnId
    }))
  );
}

function normalizeSourceRefs(refs: SourceTurnRef[]): SourceTurnRef[] {
  const seen = new Set<string>();
  const normalized: SourceTurnRef[] = [];
  for (const ref of refs) {
    const sessionId = ref.sessionId.trim();
    const turnId = ref.turnId.trim();
    if (sessionId.length === 0 || turnId.length === 0) {
      continue;
    }
    const key = `${sessionId}\0${turnId}`;
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    normalized.push({ ...ref, sessionId, turnId });
  }
  return normalized;
}

function hasSessionTurnLookup(store: SessionStore): store is SessionStore & SessionTurnLookup {
  return "getByIds" in store && typeof store.getByIds === "function";
}

function isObservationSourceTurn(turn: SessionTurn): boolean {
  const observation = turn.meta?.observation;
  return (
    typeof observation === "object" &&
    observation !== null &&
    "kind" in observation &&
    observation.kind === "visual-observation"
  );
}

const redactedSecretPlaceholder = "[redacted-secret]";
const providerStyleSecretPattern = /\bsk-[A-Za-z0-9_-]{8,}\b/gu;

function redactSecretText(value: string, configuredSecrets: string[]): string {
  const secrets = [...new Set(configuredSecrets.map((secret) => secret.trim()).filter(Boolean))].sort(
    (left, right) => right.length - left.length
  );
  let redacted = value;
  for (const secret of secrets) {
    redacted = redacted.split(secret).join(redactedSecretPlaceholder);
  }
  return redacted.replace(providerStyleSecretPattern, redactedSecretPlaceholder);
}

function redactSecretValue(value: unknown, redactText: (value: string) => string): unknown {
  if (typeof value === "string") {
    return redactText(value);
  }
  if (Array.isArray(value)) {
    return value.map((item) => redactSecretValue(item, redactText));
  }
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [key, redactSecretValue(item, redactText)])
    );
  }
  return value;
}
