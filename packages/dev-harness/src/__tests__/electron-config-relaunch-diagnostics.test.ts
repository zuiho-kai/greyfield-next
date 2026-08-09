import { describe, expect, it } from "vitest";
import { defaultGreyfieldConfig } from "@greyfield/persistence/config-schema";
import {
  formatPersistedStateFailure,
  formatRendererSecretFailure,
  redactSyntheticProviderKey,
  type ExpectedPersistedState
} from "../electron-config-relaunch-diagnostics";

const secret = "synthetic-review-secret";
const expected: ExpectedPersistedState = {
  providerBaseUrl: "http://127.0.0.1:1234/v1",
  providerApiKey: secret,
  providerModel: "review-chat-model",
  plannerModel: "review-planner-model",
  personaPath: "C:/tmp/review-persona.yaml",
  personaName: "ReviewPersona"
};

describe("config relaunch diagnostics", () => {
  it("does not include the renderer API-key value in a redaction failure", () => {
    const diagnostic = formatRendererSecretFailure({
      apiKeyValue: secret,
      apiKeyPlaceholder: `Saved ${secret}`,
      savedPlaceholderMatched: false,
      rendererContainsKnownSecret: true,
      knownSecret: secret
    });

    expect(diagnostic).not.toContain(secret);
    expect(diagnostic).toContain(`valueLength=${secret.length}`);
  });

  it("redacts the config API key and reports only persisted-field matches", () => {
    const config = {
      ...defaultGreyfieldConfig,
      characterFile: expected.personaPath,
      provider: {
        ...defaultGreyfieldConfig.provider,
        llm: "openai-compatible" as const,
        baseUrl: expected.providerBaseUrl,
        apiKey: secret,
        model: expected.providerModel,
        taskModels: {
          ...defaultGreyfieldConfig.provider.taskModels,
          planner: expected.plannerModel
        }
      },
      voice: {
        ...defaultGreyfieldConfig.voice,
        speechEnabled: true
      }
    };

    const diagnostic = formatPersistedStateFailure(config, `name: ${expected.personaName}\nsecret: ${secret}\n`, expected);

    expect(diagnostic).not.toContain(secret);
    expect(diagnostic).toContain('"apiKey":"<redacted>"');
    expect(diagnostic).toContain('"apiKeyMatches":true');
  });

  it("replaces every known synthetic provider key occurrence in Electron output", () => {
    const diagnostic = redactSyntheticProviderKey(`first=${secret}; second=${secret}`, secret);

    expect(diagnostic).toBe("first=<redacted>; second=<redacted>");
  });
});
