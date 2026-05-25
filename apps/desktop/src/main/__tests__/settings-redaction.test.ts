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
});
