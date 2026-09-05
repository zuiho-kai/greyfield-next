import {
  GreyfieldRuntime,
  InMemorySessionStore,
  LLMBackedMemoryAtomExtractor,
  MemoryManager,
  buildProactiveMemoryDisplayMessage,
  buildProactiveMemoryPolicyForLevel,
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
  type ChatMessage
} from "@greyfield/core-runtime";
import { createWebTools, type PublicWebFetch } from "../../../../packages/core-runtime/src/web-tools";
import {
  filterDeletedSessionTurns,
  hasDeletedMemoryEvidenceSource,
  persistProfileFacts,
  type ProfileFactStore,
  sourceTurnIdsContainDeletedEvidence
} from "@greyfield/core-runtime";
import { createDefaultInteractionProfile, FakeStageDriver } from "@greyfield/stage-live2d";
import { mergeConfig, type GreyfieldConfig } from "@greyfield/persistence/config-schema";
import { loadRuntimePersona } from "./runtime-persona";
import {
  RuntimeProviderFactory,
  testLLMProviderConnectivity,
  testVoiceProviderConnectivity,
  type LLMTestResult,
  type VoiceTestResult
} from "./runtime-providers";
import type { MemoryStoresV2 } from "./memory-v2-init";
import type { JsonlTopicIndexStore, SqliteCoreMemoryStore } from "@greyfield/persistence";
import type { DesktopProfileFact } from "../shared/ipc";

export interface RuntimeServiceOptions {
  fetch?: typeof fetch;
  webFetch?: PublicWebFetch;
  webTools?: import("@greyfield/core-runtime").WebTools;
  loadPersona?: (config: GreyfieldConfig) => Promise<CharacterPersona>;
  memoryStore?: MemoryStore;
  sessionStore?: SessionStore;
  summarySegmentStore?: SummarySegmentStore;
  memoryAtomStore?: MemoryAtomStore;
  deletedMemoryEvidenceStore?: DeletedMemoryEvidenceStore;
  profileStore?: ProfileFactStore;
  memoryV2UserDataPath?: string;
  initializeMemoryStoresV2?: (characterId: string, userDataPath: string) => MemoryStoresV2;
  memoryEnabled?: boolean;
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

export type { LLMTestResult, VoiceTestResult } from "./runtime-providers";

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

export interface MemoryLibraryCoreMemory {
  id: string;
  text: string;
  strength: number;
  kind: "explicit" | "topic";
  createdAt: string;
  lastRecalledAt?: string;
  disabled: boolean;
}

export interface MemoryLibrarySnapshot {
  threadId: string;
  sessionId: string;
  recentTurns: Awaited<ReturnType<SessionStore["getRecent"]>>;
  summarySegments: MemoryLibrarySummarySegment[];
  memoryAtoms: MemoryLibraryAtom[];
  coreMemories: MemoryLibraryCoreMemory[];
  lastRecallContext?: RecallContext;
  updatedAt: string;
}

export interface MemoryExportResult {
  threadId: string;
  sessionId: string;
  recentTurns: Awaited<ReturnType<SessionStore["getRecent"]>>;
  summarySegments: MemoryLibrarySummarySegment[];
  memoryAtoms: MemoryLibraryAtom[];
  coreMemories: MemoryLibraryCoreMemory[];
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
    | "stale_screen_context"
    | "screen_awareness_in_flight"
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
  private providerFactory: RuntimeProviderFactory;
  private testingLLMGeneration: number | undefined;
  private providerTestGeneration = 0;
  private testingVoice = false;
  private lastInterruptedAtMs: number | undefined;
  private lastScreenAwarenessProactiveAtMs: number | undefined;
  private screenAwarenessProactiveInFlight = false;

  // New memory system (V2)
  private memoryStoresV2?: MemoryStoresV2;
  private memoryManagerV2?: MemoryManager;
  private profileStoreV2?: ProfileFactStore;
  private memoryV2CharacterId?: string;
  private memoryV2InitializationError?: string;
  private useNewMemorySystem: boolean;

  constructor(config: GreyfieldConfig, private readonly options: RuntimeServiceOptions = {}) {
    this.config = mergeConfig(config);
    this.memoryStore = options.memoryStore ?? new MainFakeMemoryStore();
    this.sessionStore = options.sessionStore ?? new InMemorySessionStore("desktop-main-session");
    this.summarySegmentStore = options.summarySegmentStore;
    this.memoryAtomStore = options.memoryAtomStore;
    this.deletedMemoryEvidenceStore = options.deletedMemoryEvidenceStore;
    this.profileStoreV2 = options.profileStore;
    this.providerFactory = new RuntimeProviderFactory(this.config, this.options);

    this.useNewMemorySystem = false;
    this.refreshMemoryV2();
  }

  /**
   * (Re)initialize the V2 memory system to match the current config.
   * Called from the constructor and from updateConfig: switching the
   * character must move reads and writes to that character's own
   * memory-v2/<characterId> data instead of silently reusing the old one.
   */
  private refreshMemoryV2(): void {
    const configEnabled = shouldUseNewMemorySystem(this.config);
    if (!configEnabled) {
      this.teardownMemoryV2();
      this.memoryV2InitializationError = "V2 memory disabled by config.";
      this.useNewMemorySystem = false;
      return;
    }

    let characterId: string;
    try {
      characterId = deriveCharacterId(this.config);
    } catch (error) {
      console.error("[MemoryV2] Failed to derive character id:", error);
      this.teardownMemoryV2();
      this.memoryV2InitializationError = error instanceof Error ? error.message : String(error);
      this.useNewMemorySystem = false;
      return;
    }

    const nativeManagerEnabled =
      this.options.memoryEnabled !== false &&
      this.options.memoryV2UserDataPath !== undefined &&
      this.options.initializeMemoryStoresV2 !== undefined;
    if (!nativeManagerEnabled) {
      this.teardownMemoryV2();
      this.memoryV2CharacterId = characterId;
      this.profileStoreV2 = this.options.profileStore;
      this.memoryV2InitializationError = undefined;
      this.useNewMemorySystem = false;
      return;
    }

    if (this.memoryManagerV2 && characterId === this.memoryV2CharacterId) {
      this.useNewMemorySystem = true;
      return;
    }

    // Character changed (or first init): flush and close the previous
    // manager in the background, then build a fresh stack for the new id.
    this.teardownMemoryV2();
    this.memoryV2CharacterId = characterId;
    this.profileStoreV2 = this.options.profileStore;
    try {
      this.memoryStoresV2 = this.options.initializeMemoryStoresV2!(characterId, this.options.memoryV2UserDataPath!);
      this.profileStoreV2 = this.options.profileStore ?? this.memoryStoresV2.profileStore;
      // One long-lived manager for the whole service: a GreyfieldRuntime
      // is created per interaction, so the manager (and its unindexed-turn
      // buffer) must live here or batch indexing never accumulates.
      // The LLM wrapper delegates lazily so updateConfig picks up new
      // provider settings without rebuilding the manager.
      const lazyLlm: LLMProvider = {
        stream: (messages, tools, streamOptions) =>
          this.providerFactory.createChatLLMProvider().stream(messages, tools, streamOptions)
      };
      this.memoryManagerV2 = new MemoryManager(
        this.memoryStoresV2.topicStore,
        this.memoryStoresV2.coreStore,
        lazyLlm,
        this.sessionStore.sessionId,
        characterId,
        {
          batchSize: 50,
          // Layer 1 drilldown: recall quotes raw turns when a topic hits
          ...(hasSessionTurnLookup(this.sessionStore) ? { turnLookup: this.sessionStore } : {}),
          // Layer 4: User profile facts
          profileStore: this.memoryStoresV2.profileStore
        }
      );
      this.memoryV2CharacterId = characterId;
      this.memoryV2InitializationError = undefined;
      this.useNewMemorySystem = true;
      console.log("[MemoryV2] Initialized new memory system for character:", characterId);
    } catch (error) {
      console.error("[MemoryV2] Failed to initialize new memory system:", error);
      this.teardownMemoryV2();
      this.memoryV2CharacterId = characterId;
      this.profileStoreV2 = this.options.profileStore;
      this.memoryV2InitializationError = error instanceof Error ? error.message : String(error);
      this.useNewMemorySystem = false;
    }
  }

  private teardownMemoryV2(): void {
    const previous = this.memoryManagerV2;
    this.memoryManagerV2 = undefined;
    this.memoryStoresV2 = undefined;
    this.profileStoreV2 = this.options.profileStore;
    this.memoryV2CharacterId = undefined;
    if (previous) {
      // close() flushes unindexed turns before closing the store; the old
      // character's data lives in its own directory, so this can run in the
      // background without racing the new manager.
      void previous.close().catch((error) => {
        console.error("[MemoryV2] Failed to close previous memory system:", error);
      });
    }
  }

  /**
   * Flush unindexed turns and close the memory stores. Called on app quit.
   */
  async shutdown(): Promise<void> {
    await this.options.webTools?.dispose?.().catch(() => {});
    if (this.memoryManagerV2) {
      try {
        await this.memoryManagerV2.close();
      } catch (error) {
        console.error("[MemoryV2] Failed to shut down memory system:", error);
      }
    }
  }

  private get threadId(): string {
    return this.options.threadId ?? deriveThreadId(this.config);
  }

  updateConfig(config: GreyfieldConfig): void {
    const previousThreadId = this.threadId;
    const previousProviderTestFingerprint = providerTestFingerprint(this.config);
    this.config = mergeConfig(config);
    if (providerTestFingerprint(this.config) !== previousProviderTestFingerprint) {
      this.invalidateProviderTest();
    }
    this.providerFactory = new RuntimeProviderFactory(this.config, this.options);
    if (this.threadId !== previousThreadId) {
      this.proactiveTriggerState = {};
    }
    this.refreshMemoryV2();
  }

  invalidateProviderTest(): void {
    this.providerTestGeneration += 1;
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

  async getSessionContinuity(): Promise<{ restoredRecentMessageCount: number }> {
    const limit = this.options.recentTurnLimit ?? 20;
    const recentMessages = await this.sessionStore.getRecent(limit);
    return { restoredRecentMessageCount: recentMessages.length };
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
    const [summarySegments, memoryAtoms, coreMemories] = await Promise.all([
      this.resolveSummarySegmentSources(visibleSummarySegments, recentTurns, deletedEvidence),
      this.resolveMemoryAtomSources(visibleMemoryAtoms, recentTurns, deletedEvidence),
      this.loadCoreMemoriesForLibrary()
    ]);
    return this.redactMemoryLibrarySnapshot({
      threadId: this.threadId,
      sessionId: this.sessionStore.sessionId,
      recentTurns,
      summarySegments,
      memoryAtoms,
      coreMemories,
      ...(this.lastRecallContext ? { lastRecallContext: this.lastRecallContext } : {}),
      updatedAt: new Date().toISOString()
    });
  }

  private async loadCoreMemoriesForLibrary(): Promise<MemoryLibraryCoreMemory[]> {
    const store = this.memoryStoresV2?.coreStore;
    if (!store) {
      return [];
    }
    try {
      const memories = await store.getBySession(this.sessionStore.sessionId, true);
      return memories.map((memory) => ({
        id: memory.id,
        text: memory.text,
        strength: memory.strength,
        kind: memory.sources.topicIds?.length ? "topic" as const : "explicit" as const,
        createdAt: memory.createdAt.toISOString(),
        ...(memory.lastRecalledAt ? { lastRecalledAt: memory.lastRecalledAt.toISOString() } : {}),
        disabled: memory.disabled
      }));
    } catch (error) {
      console.error("[MemoryV2] Failed to load core memories for library:", error);
      return [];
    }
  }

  async toggleCoreMemory(id: string, disabled: boolean): Promise<MemoryControlResult> {
    const store = this.memoryStoresV2?.coreStore;
    if (!store) {
      return { ok: false, message: "Core memory is not available in this runtime." };
    }
    const existing = await store.get(id);
    if (!existing || existing.sessionId !== this.sessionStore.sessionId) {
      return { ok: false, message: `Core memory ${id} was not found.` };
    }
    await store.update(id, { disabled });
    return {
      ok: true,
      message: disabled ? "Core memory disabled. It will no longer be recalled." : "Core memory enabled.",
      snapshot: await this.getMemoryLibrarySnapshot()
    };
  }

  async deleteCoreMemory(id: string): Promise<MemoryControlResult> {
    const store = this.memoryStoresV2?.coreStore;
    if (!store) {
      return { ok: false, message: "Core memory is not available in this runtime." };
    }
    const existing = await store.get(id);
    if (!existing || existing.sessionId !== this.sessionStore.sessionId) {
      return { ok: false, message: `Core memory ${id} was not found.` };
    }
    const deleted = await store.delete(id);
    if (!deleted) {
      return { ok: false, message: `Core memory ${id} was not found.` };
    }
    return {
      ok: true,
      message: "Core memory deleted.",
      snapshot: await this.getMemoryLibrarySnapshot()
    };
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
      coreMemories: snapshot.coreMemories,
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
    if (this.screenAwarenessProactiveInFlight) {
      return { displayed: false, reason: "screen_awareness_in_flight" };
    }
    if (this.lastScreenAwarenessProactiveAtMs !== undefined && Date.now() - this.lastScreenAwarenessProactiveAtMs < screenAwarenessProactiveCooldownMs) {
      return { displayed: false, reason: "screen_awareness_cooldown" };
    }
    const attachments = input.attachments.filter((attachment) => attachment.dataUrl.startsWith(`data:${attachment.mimeType};base64,`));
    if (attachments.length === 0) {
      return { displayed: false, reason: "no_screen_context" };
    }
    if (!hasFreshScreenAwarenessAttachment(attachments, Date.now(), this.config.ui.screenAwarenessStaleAfterSeconds * 1000)) {
      return { displayed: false, reason: "stale_screen_context" };
    }
    if (this.providerFactory.resolveVisualTaskModel().length === 0) {
      return { displayed: false, reason: "vision_model_missing" };
    }
    if (this.providerFactory.validateOpenAICompatibleVisionProviderConfig("chatting with screen awareness")) {
      return { displayed: false, reason: "vision_model_not_ready" };
    }
    const llm = this.providerFactory.createVisionLLMProvider();
    if (!llm) {
      return { displayed: false, reason: "vision_model_not_ready" };
    }

    this.screenAwarenessProactiveInFlight = true;
    this.lastScreenAwarenessProactiveAtMs = Date.now();
    try {
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
      for await (const chunk of llm.stream(messages)) {
        text += chunk;
        if (text.length > 240) {
          break;
        }
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
    } catch {
      return { displayed: false, reason: "vision_model_not_ready" };
    } finally {
      this.screenAwarenessProactiveInFlight = false;
    }
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
      coreMemories: [],
      exportedAt: new Date().toISOString()
    };
  }

  async testLLM(): Promise<LLMTestResult | undefined> {
    if (this.activeRuntime) {
      return {
        ok: false,
        message: "LLM test is unavailable while a chat response is running."
      };
    }
    const testGeneration = this.providerTestGeneration;
    if (this.testingLLMGeneration === testGeneration) {
      return {
        ok: false,
        message: "LLM test is already running."
      };
    }
    const providerConfigError = this.providerFactory.validateOpenAICompatibleProviderConfig("testing");
    if (providerConfigError) {
      return { ok: false, message: providerConfigError };
    }

    this.testingLLMGeneration = testGeneration;
    try {
      const result = await testLLMProviderConnectivity(this.providerFactory.createChatLLMProvider());
      return testGeneration === this.providerTestGeneration ? result : undefined;
    } catch (error) {
      if (testGeneration !== this.providerTestGeneration) {
        return undefined;
      }
      return {
        ok: false,
        message: error instanceof Error ? error.message : String(error)
      };
    } finally {
      if (this.testingLLMGeneration === testGeneration) {
        this.testingLLMGeneration = undefined;
      }
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
    const providerConfigError = this.providerFactory.validateTTSProviderConfig();
    if (providerConfigError) {
      return { ok: false, message: providerConfigError };
    }

    this.testingVoice = true;
    try {
      return await testVoiceProviderConnectivity(this.providerFactory.createTTSProvider(), this.config.voice.id);
    } catch (error) {
      return {
        ok: false,
        message: error instanceof Error ? error.message : String(error)
      };
    } finally {
      this.testingVoice = false;
    }
  }

  // Profile fact management (V2 memory system)
  private profileUnavailableResult(): MemoryControlResult {
    return {
      ok: false,
      message: `User profile is not available (${this.memoryV2InitializationError ?? "V2 memory disabled"}).`
    };
  }

  async getProfileFacts(): Promise<DesktopProfileFact[]> {
    const profileStore = this.profileStoreV2;
    if (!profileStore || !this.memoryV2CharacterId) {
      return [];
    }

    const facts = await profileStore.getBySession(
      this.sessionStore.sessionId,
      this.memoryV2CharacterId,
      true
    );

    return facts.map(f => ({
      id: f.id,
      category: f.category,
      key: f.key,
      value: f.value,
      createdAt: f.createdAt.toISOString(),
      disabled: f.disabled
    }));
  }

  async updateProfileFact(id: string, updates: { disabled?: boolean }): Promise<MemoryControlResult> {
    const profileStore = this.profileStoreV2;
    if (!profileStore) {
      return this.profileUnavailableResult();
    }

    const existing = await profileStore.get(id);
    if (!existing || existing.sessionId !== this.sessionStore.sessionId) {
      return { ok: false, message: `Profile fact ${id} not found in current session.` };
    }

    await profileStore.update(id, updates);
    return {
      ok: true,
      message: updates.disabled ? `Profile fact ${id} disabled.` : `Profile fact ${id} enabled.`,
      snapshot: await this.getMemoryLibrarySnapshot()
    };
  }

  async createProfileFact(fact: {
    category: "allergy" | "important-date" | "identity" | "preference" | "free-form";
    key: string;
    value: string;
  }): Promise<MemoryControlResult> {
    const profileStore = this.profileStoreV2;
    if (!profileStore || !this.memoryV2CharacterId) {
      return this.profileUnavailableResult();
    }

    const [result] = await persistProfileFacts({
      store: profileStore,
      facts: [fact],
      sessionId: this.sessionStore.sessionId,
      characterId: this.memoryV2CharacterId,
      sourceTurnIds: []
    });
    return {
      ok: true,
      message: result?.action === "created"
        ? `Profile fact created: ${fact.key}`
        : `Profile fact updated: ${fact.key}`,
      snapshot: await this.getMemoryLibrarySnapshot()
    };
  }

  async deleteProfileFact(id: string): Promise<MemoryControlResult> {
    const profileStore = this.profileStoreV2;
    if (!profileStore || !this.memoryV2CharacterId) {
      return this.profileUnavailableResult();
    }

    const existing = await profileStore.get(id);
    if (
      !existing ||
      existing.sessionId !== this.sessionStore.sessionId ||
      existing.characterId !== this.memoryV2CharacterId
    ) {
      return { ok: false, message: `Profile fact ${id} not found in current session.` };
    }

    const deleted = await profileStore.delete(id);
    return {
      ok: deleted,
      message: deleted ? `Profile fact ${id} deleted.` : `Profile fact ${id} was not deleted.`,
      snapshot: await this.getMemoryLibrarySnapshot()
    };
  }

  private async createRuntime(): Promise<GreyfieldRuntime> {
    const persona = await this.loadPersona();
    const atomExtractionPolicy = this.resolveMemoryAtomExtractionPolicy();
    return new GreyfieldRuntime({
      llm: this.providerFactory.createChatLLMProvider(),
      webTools: this.options.webTools ?? createWebTools(this.options.webFetch),
      visionLlm: this.providerFactory.createVisionLLMProvider(),
      asr: this.providerFactory.createASRProvider(),
      tts: this.providerFactory.createTTSProvider(),
      memoryStore: this.memoryStore,
      summarySegmentStore: this.summarySegmentStore,
      memoryAtomStore: this.memoryAtomStore,
      deletedMemoryEvidenceStore: this.deletedMemoryEvidenceStore,
      memoryEnabled: this.options.memoryEnabled ?? true,
      memoryAtomExtractionMode: atomExtractionPolicy.mode,
      ...(atomExtractionPolicy.mode === "hybrid" ? { memoryAtomExtractor: this.createMemoryAtomExtractor() } : {}),
      ...(atomExtractionPolicy.unavailableReason
        ? { memoryAtomExtractionUnavailableReason: atomExtractionPolicy.unavailableReason }
        : {}),

      // New memory system (V2)
      useNewMemorySystem: this.useNewMemorySystem,
      memoryManager: this.memoryManagerV2,
      topicIndexStore: this.memoryStoresV2?.topicStore,
      coreMemoryStore: this.memoryStoresV2?.coreStore,
      profileFactStore: this.profileStoreV2,
      profileCharacterId: this.memoryV2CharacterId,

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
    const providerConfigError = this.providerFactory.validateOpenAICompatibleTaskModelConfig("memory", "memory extraction");
    if (this.config.provider.llm !== "openai-compatible" || providerConfigError) {
      return { mode: "deterministic", unavailableReason: "provider-unavailable" };
    }
    return { mode: "hybrid" };
  }

  private createMemoryAtomExtractor(): LLMBackedMemoryAtomExtractor {
    return new LLMBackedMemoryAtomExtractor({
      llm: this.providerFactory.createTaskLLMProvider("memory"),
      mode: "hybrid"
    });
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
    return loadRuntimePersona({
      config: this.config,
      interactionProfile: this.interactionProfile,
      loadPersona: this.options.loadPersona
    });
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
      coreMemories: snapshot.coreMemories.map((memory) => ({ ...memory, text: this.redactSecretText(memory.text) })),
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
}

function providerTestFingerprint(config: GreyfieldConfig): string {
  return JSON.stringify([
    config.provider.llm,
    config.provider.baseUrl,
    config.provider.apiKey,
    config.provider.model,
    config.provider.taskModels.chat
  ]);
}

function shouldUseNewMemorySystem(config: GreyfieldConfig): boolean {
  return config.memory.useV2System !== false;
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

function deriveCharacterId(config: GreyfieldConfig): string {
  const source = config.characterFile.trim() || "default-character";
  const slug = source.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  return slug || "default-character";
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

function hasFreshScreenAwarenessAttachment(attachments: RuntimeImageAttachment[], nowMs: number, maxAgeMs: number): boolean {
  return attachments.some((attachment) => {
    const createdAtMs = Date.parse(attachment.createdAt);
    const ageMs = nowMs - createdAtMs;
    return Number.isFinite(createdAtMs) && ageMs >= 0 && ageMs <= maxAgeMs;
  });
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
