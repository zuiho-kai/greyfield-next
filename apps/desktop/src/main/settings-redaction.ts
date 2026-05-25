import type { GreyfieldConfig } from "@greyfield/persistence/config-schema";
import type { RendererGreyfieldConfig } from "../shared/renderer-config";
import { API_KEY_MASK } from "../shared/secrets";

export function redactConfigForRenderer(config: GreyfieldConfig): RendererGreyfieldConfig {
  const hasApiKey = config.provider.apiKey.length > 0;
  return {
    ...config,
    provider: {
      ...config.provider,
      apiKey: hasApiKey ? API_KEY_MASK : "",
      hasApiKey
    }
  };
}
