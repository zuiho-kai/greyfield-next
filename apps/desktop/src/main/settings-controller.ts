import {
  mergeConfig,
  type GreyfieldConfig,
  type GreyfieldConfigPatch,
  type GreyfieldTaskModelConfig
} from "@greyfield/persistence/config-schema";

export type SaveSettings = (config: GreyfieldConfig) => Promise<void>;
export type EmitSettingsChanged = (config: GreyfieldConfig) => void;

export class SettingsController {
  private config: GreyfieldConfig;
  private pendingUpdate: Promise<void> = Promise.resolve();
  private pendingUpdateFailed = false;
  private pendingUpdateError: unknown;

  constructor(
    initialConfig: GreyfieldConfig,
    private readonly save: SaveSettings,
    private readonly emitChanged: EmitSettingsChanged
  ) {
    this.config = mergeConfig(initialConfig);
  }

  getCurrent(): GreyfieldConfig {
    return structuredClone(this.config);
  }

  async awaitPendingUpdates(): Promise<void> {
    while (true) {
      const pending = this.pendingUpdate;
      await pending;
      if (pending === this.pendingUpdate) {
        break;
      }
    }
    if (this.pendingUpdateFailed) {
      throw this.pendingUpdateError;
    }
  }

  async update(patch: GreyfieldConfigPatch): Promise<GreyfieldConfig> {
    const update = this.pendingUpdate.then(async () => {
      try {
        const provider = {
          ...this.config.provider,
          ...patch.provider,
          taskModels: { ...this.config.provider.taskModels, ...patch.provider?.taskModels }
        };
        syncPatchedPairedTaskModelFields(provider, patch.provider?.taskModels);
        this.config = mergeConfig({
          ...this.config,
          ...patch,
          provider,
          voice: { ...this.config.voice, ...patch.voice },
          audio: { ...this.config.audio, ...patch.audio },
          window: { ...this.config.window, ...patch.window },
          live2d: { ...this.config.live2d, ...patch.live2d },
          hotkeys: { ...this.config.hotkeys, ...patch.hotkeys },
          ui: { ...this.config.ui, ...patch.ui },
          memory: { ...this.config.memory, ...patch.memory }
        });
        await this.save(this.config);
        const next = this.getCurrent();
        this.emitChanged(next);
        this.pendingUpdateFailed = false;
        this.pendingUpdateError = undefined;
        return next;
      } catch (error) {
        this.pendingUpdateFailed = true;
        this.pendingUpdateError = error;
        throw error;
      }
    });
    this.pendingUpdate = update.then(
      () => undefined,
      () => undefined
    );
    return update;
  }
}

function syncPatchedPairedTaskModelFields(
  provider: GreyfieldConfig["provider"],
  taskModelsPatch: Partial<GreyfieldTaskModelConfig> | undefined
): void {
  if (!taskModelsPatch) {
    return;
  }
  if (typeof taskModelsPatch.chat === "string") {
    provider.model = taskModelsPatch.chat;
  }
  if (typeof taskModelsPatch.vision === "string") {
    provider.visionModel = taskModelsPatch.vision;
  }
  if (typeof taskModelsPatch.voiceAsr === "string") {
    provider.asrModel = taskModelsPatch.voiceAsr;
  }
  if (typeof taskModelsPatch.voiceTts === "string") {
    provider.ttsModel = taskModelsPatch.voiceTts;
  }
}
