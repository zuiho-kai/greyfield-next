import type { GreyfieldConfig } from "@greyfield/persistence/config-schema";
import type { RendererGreyfieldConfig } from "../shared/renderer-config";
import { API_KEY_MASK } from "../shared/secrets";

export function redactConfigForRenderer(config: GreyfieldConfig): RendererGreyfieldConfig {
  const hasApiKey = config.provider.apiKey.length > 0;
  const hasAsrApiKey = (config.provider.asrApiKey ?? "").length > 0;
  const hasTtsApiKey = (config.provider.ttsApiKey ?? "").length > 0;
  return {
    ...config,
    provider: {
      ...config.provider,
      apiKey: hasApiKey ? API_KEY_MASK : "",
      hasApiKey,
      asrApiKey: hasAsrApiKey ? API_KEY_MASK : "",
      hasAsrApiKey,
      ttsApiKey: hasTtsApiKey ? API_KEY_MASK : "",
      hasTtsApiKey
    }
  };
}
