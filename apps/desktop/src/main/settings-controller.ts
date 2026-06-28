import { mergeConfig, type GreyfieldConfig, type GreyfieldConfigPatch } from "@greyfield/persistence/config-schema";

export type SaveSettings = (config: GreyfieldConfig) => Promise<void>;
export type EmitSettingsChanged = (config: GreyfieldConfig) => void;

export class SettingsController {
  private config: GreyfieldConfig;
  private pendingUpdate: Promise<void> = Promise.resolve();

  constructor(
    initialConfig: GreyfieldConfig,
    private readonly save: SaveSettings,
    private readonly emitChanged: EmitSettingsChanged
  ) {
    this.config = initialConfig;
  }

  getCurrent(): GreyfieldConfig {
    return structuredClone(this.config);
  }

  async update(patch: GreyfieldConfigPatch): Promise<GreyfieldConfig> {
    const update = this.pendingUpdate.then(async () => {
      this.config = mergeConfig({
        ...this.config,
        ...patch,
        provider: { ...this.config.provider, ...patch.provider },
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
      return next;
    });
    this.pendingUpdate = update.then(
      () => undefined,
      () => undefined
    );
    return update;
  }
}
