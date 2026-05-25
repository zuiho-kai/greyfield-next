import { mergeConfig, type GreyfieldConfig, type GreyfieldConfigPatch } from "@greyfield/persistence/config-schema";

export type SaveSettings = (config: GreyfieldConfig) => Promise<void>;
export type EmitSettingsChanged = (config: GreyfieldConfig) => void;

export class SettingsController {
  private config: GreyfieldConfig;

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
    this.config = mergeConfig({
      ...this.config,
      ...patch,
      provider: { ...this.config.provider, ...patch.provider },
      voice: { ...this.config.voice, ...patch.voice },
      audio: { ...this.config.audio, ...patch.audio },
      window: { ...this.config.window, ...patch.window },
      live2d: { ...this.config.live2d, ...patch.live2d },
      hotkeys: { ...this.config.hotkeys, ...patch.hotkeys }
    });
    await this.save(this.config);
    this.emitChanged(this.getCurrent());
    return this.getCurrent();
  }
}
