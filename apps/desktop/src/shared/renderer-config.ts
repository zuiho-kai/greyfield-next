import type { GreyfieldConfig } from "@greyfield/persistence/config-schema";
import { API_KEY_MASK } from "./secrets";

export type RendererGreyfieldConfig = Omit<GreyfieldConfig, "provider"> & {
  provider: Omit<GreyfieldConfig["provider"], "apiKey"> & {
    apiKey: "" | typeof API_KEY_MASK;
    hasApiKey: boolean;
  };
};
