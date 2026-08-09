import type { GreyfieldConfig } from "@greyfield/persistence/config-schema";

export interface ExpectedPersistedState {
  providerBaseUrl: string;
  providerApiKey: string;
  providerModel: string;
  plannerModel: string;
  personaPath: string;
  personaName: string;
}

export function formatRendererSecretFailure(input: {
  apiKeyValue: string;
  apiKeyPlaceholder: string;
  savedPlaceholderMatched: boolean;
  rendererContainsKnownSecret: boolean;
  knownSecret: string;
}): string {
  const placeholder = redactSyntheticProviderKey(input.apiKeyPlaceholder, input.knownSecret);
  return [
    "Renderer exposed or failed to mark the saved API key",
    `valueEmpty=${input.apiKeyValue.length === 0}`,
    `valueLength=${input.apiKeyValue.length}`,
    `placeholder=${JSON.stringify(placeholder)}`,
    `savedPlaceholderMatched=${input.savedPlaceholderMatched}`,
    `rendererContainsKnownSecret=${input.rendererContainsKnownSecret}`
  ].join("; ");
}

export function formatPersistedStateFailure(
  config: GreyfieldConfig | null,
  personaContent: string,
  expected: ExpectedPersistedState
): string {
  const provider = config?.provider;
  const apiKey = typeof provider?.apiKey === "string" ? provider.apiKey : "";
  const diagnostic = {
    configPresent: config !== null,
    provider: {
      llmMatches: provider?.llm === "openai-compatible",
      baseUrlMatches: provider?.baseUrl === expected.providerBaseUrl,
      apiKey: apiKey.length > 0 ? "<redacted>" : "",
      apiKeyMatches: apiKey === expected.providerApiKey,
      modelMatches: provider?.model === expected.providerModel,
      plannerMatches: provider?.taskModels?.planner === expected.plannerModel
    },
    characterFileMatches: config?.characterFile === expected.personaPath,
    speechEnabledMatches: config?.voice?.speechEnabled === true,
    personaNamePresent: personaContent.includes(`name: ${expected.personaName}`),
    personaLength: personaContent.length
  };
  return `Timed out waiting for persisted first-launch state; diagnostic=${JSON.stringify(diagnostic)}`;
}

export function redactSyntheticProviderKey(output: string, knownSecret: string): string {
  return knownSecret.length > 0 ? output.split(knownSecret).join("<redacted>") : output;
}
