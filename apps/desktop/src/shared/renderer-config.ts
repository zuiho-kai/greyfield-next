import type { GreyfieldConfig } from "@greyfield/persistence/config-schema";
import { API_KEY_MASK } from "./secrets";

/**
 * 渲染进程拿到的配置里，所有密钥都被遮罩替换。
 * 聊天、ASR、TTS 各自可以有独立密钥，所以每项都要单独遮罩、单独暴露"是否已配置"。
 */
export type RendererGreyfieldConfig = Omit<GreyfieldConfig, "provider"> & {
  provider: Omit<GreyfieldConfig["provider"], "apiKey" | "asrApiKey" | "ttsApiKey"> & {
    apiKey: "" | typeof API_KEY_MASK;
    asrApiKey: "" | typeof API_KEY_MASK;
    ttsApiKey: "" | typeof API_KEY_MASK;
    hasApiKey: boolean;
    hasAsrApiKey: boolean;
    hasTtsApiKey: boolean;
  };
};
