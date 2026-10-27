import { describe, expect, it } from "vitest";
import { defaultGreyfieldConfig } from "@greyfield/persistence/config-schema";
import { API_KEY_MASK } from "../../shared/secrets";
import { redactConfigForRenderer } from "../settings-redaction";

describe("settings redaction", () => {
  it("masks provider API keys before broadcasting settings to renderer windows", () => {
    const config = {
      ...defaultGreyfieldConfig,
      provider: {
        ...defaultGreyfieldConfig.provider,
        apiKey: "real-secret"
      }
    };

    const redacted = redactConfigForRenderer(config);

    expect(redacted.provider.apiKey).toBe(API_KEY_MASK);
    expect(redacted.provider.hasApiKey).toBe(true);
    expect(config.provider.apiKey).toBe("real-secret");
  });

  it("keeps an empty API key empty so settings can show an unset state", () => {
    const redacted = redactConfigForRenderer(defaultGreyfieldConfig);

    expect(redacted.provider.apiKey).toBe("");
    expect(redacted.provider.hasApiKey).toBe(false);
  });

  it("masks capability-specific API keys independently of the shared one", () => {
    const config = {
      ...defaultGreyfieldConfig,
      provider: {
        ...defaultGreyfieldConfig.provider,
        apiKey: "chat-secret",
        asrApiKey: "asr-secret",
        ttsApiKey: ""
      }
    };

    const redacted = redactConfigForRenderer(config);

    expect(redacted.provider.apiKey).toBe(API_KEY_MASK);
    expect(redacted.provider.hasApiKey).toBe(true);
    expect(redacted.provider.asrApiKey).toBe(API_KEY_MASK);
    expect(redacted.provider.hasAsrApiKey).toBe(true);
    expect(redacted.provider.ttsApiKey).toBe("");
    expect(redacted.provider.hasTtsApiKey).toBe(false);
    // 原始配置不能被就地改写
    expect(config.provider.asrApiKey).toBe("asr-secret");
  });
});
