import { join } from "node:path";
import { mkdir, writeFile } from "node:fs/promises";
import { createBrowserResearchTools } from "../../browser-runtime/src/index";
import { OpenAICompatibleLLMProvider } from "../../core-runtime/src/openai-compatible-provider";
import type { GreyfieldConfig } from "../../persistence/src/config-schema";
import { createNekoResearchTools } from "./browser-tools";
import type { NekoPluginEvent } from "./index";

/** Native research policy lives here; the desktop supplies its network transport. */
export function createNekoResearchToolsFactory(options: {
  profilePath: string;
  tracePath?: string;
  getConfig(): GreyfieldConfig | undefined;
  fetch: typeof fetch;
  emit(event: NekoPluginEvent): void;
}) {
  const { tracePath, emit } = options;
  let traceStep = 0;
  let modelTraceStep = 0;
  return () => createNekoResearchTools(createBrowserResearchTools({ profilePath: options.profilePath,
    onPage: () => emit({ type: "research", name: "chrome", status: "running" }),
    ...(tracePath ? { onResult: async (event, page) => {
      await mkdir(tracePath, { recursive: true });
      const name = `voice-${++traceStep}-${event.name}`;
      await writeFile(join(tracePath, `${name}.json`), JSON.stringify({ name: event.name, elapsedMs: event.elapsedMs, ...JSON.parse(event.result.text) }, null, 2));
      await page.screenshot({ path: join(tracePath, `${name}.png`) });
    } } : {})
  }), () => {
    const config = options.getConfig();
    if (!config || config.provider.llm !== "openai-compatible" || !config.provider.apiKey || !config.provider.baseUrl) throw new Error("请先在设置中配置网页研究使用的模型服务。");
    return new OpenAICompatibleLLMProvider({ baseUrl: config.provider.baseUrl, apiKey: config.provider.apiKey, model: config.provider.taskModels.utility || config.provider.model, timeoutMs: 45_000,
      fetch: async (input, init) => {
        const response = await options.fetch(input, init);
        if (tracePath) {
          const step = ++modelTraceStep;
          void response.clone().text().then(async (body) => {
            const chunks = body.split(/\r?\n/).filter((line) => line.startsWith("data: {")).map((line) => JSON.parse(line.slice(6))).flatMap((chunk) => chunk.choices ?? []);
            await mkdir(tracePath, { recursive: true });
            await writeFile(join(tracePath, `voice-model-${step}.json`), JSON.stringify({ model: config.provider.taskModels.utility, question: JSON.parse(String(init?.body)).messages.find((message: { role: string }) => message.role === "user")?.content,
              chunks: chunks.map((choice) => ({ finishReason: choice.finish_reason, keys: Object.keys(choice.delta ?? {}), contentCharacters: choice.delta?.content?.length ?? 0, reasoningCharacters: choice.delta?.reasoning_content?.length ?? 0, tools: choice.delta?.tool_calls })) }, null, 2));
          }).catch(() => {});
        }
        return response;
      } });
  }, (event) => { if (event.type === "assistant.tool.status") emit({ type: "message", data: { ...event, type: "browser_tool_status" } }); });
}
