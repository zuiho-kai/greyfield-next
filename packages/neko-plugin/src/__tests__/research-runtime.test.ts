import { expect, it, vi } from "vitest";
import { defaultGreyfieldConfig } from "../../../persistence/src/config-schema";
import { createNekoResearchToolsFactory } from "../research-runtime";

it.each(["utility-model", ""])("keeps the configured endpoint and injected transport for model slot %s", async (utility) => {
  const config = structuredClone(defaultGreyfieldConfig);
  config.provider = { ...config.provider, llm: "openai-compatible", baseUrl: "http://192.168.1.20:8000/v1", apiKey: "test-only-key", model: "chat-model",
    taskModels: { ...config.provider.taskModels, utility } };
  const fetch = vi.fn<typeof globalThis.fetch>(async () => { throw new Error("transport probe"); });
  const tools = createNekoResearchToolsFactory({ profilePath: "unused-profile", getConfig: () => config, fetch, emit: () => {} })();
  await expect(tools.execute("research_web", { question: "Read the requested page" }, new AbortController().signal)).rejects.toThrow("transport probe");
  expect(fetch).toHaveBeenCalledTimes(1);
  const [url, init] = fetch.mock.calls[0]!;
  expect(url).toBe("http://192.168.1.20:8000/v1/chat/completions");
  expect(JSON.parse(String(init?.body)).model).toBe(utility || "chat-model");
});

it("reports missing model configuration before making a provider request", async () => {
  const fetch = vi.fn<typeof globalThis.fetch>();
  const tools = createNekoResearchToolsFactory({ profilePath: "unused-profile", getConfig: () => undefined, fetch, emit: () => {} })();
  await expect(tools.execute("research_web", { question: "Read the requested page" }, new AbortController().signal)).rejects.toThrow("请先在设置中配置");
  expect(fetch).not.toHaveBeenCalled();
});
