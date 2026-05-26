import { describe, expect, it } from "vitest";
import { readRealProviderEnv, redactRealProviderConfig } from "../real-provider-env";

describe("real provider harness env", () => {
  it("requires base URL, API key, and model", () => {
    expect(() => readRealProviderEnv({})).toThrow(
      "Missing GREYFIELD_REAL_LLM_BASE_URL, GREYFIELD_REAL_LLM_API_KEY, GREYFIELD_REAL_LLM_MODEL"
    );
  });

  it("normalizes config and never exposes the API key in diagnostics", () => {
    const config = readRealProviderEnv({
      GREYFIELD_REAL_LLM_BASE_URL: "https://llm.example.test/v1/",
      GREYFIELD_REAL_LLM_API_KEY: "secret-key",
      GREYFIELD_REAL_LLM_MODEL: "real-model"
    });

    expect(config).toEqual({
      baseUrl: "https://llm.example.test/v1",
      apiKey: "secret-key",
      model: "real-model"
    });
    expect(redactRealProviderConfig(config)).toEqual({
      baseUrl: "https://llm.example.test/v1",
      apiKey: "<redacted>",
      model: "real-model"
    });
  });
});
