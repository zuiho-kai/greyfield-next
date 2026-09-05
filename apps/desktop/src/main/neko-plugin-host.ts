import { BrowserWindow, ipcMain, net } from "electron";
import { join } from "node:path";
import { mkdir, writeFile } from "node:fs/promises";
import { createBrowserResearchTools } from "@greyfield/browser-runtime";
import { OpenAICompatibleLLMProvider } from "@greyfield/core-runtime";
import type { GreyfieldConfig } from "@greyfield/persistence/config-schema";
import { createNekoResearchTools } from "../../../../packages/neko-plugin/src/browser-tools";
import { NekoPlugin, type NekoPluginEvent } from "../../../../packages/neko-plugin/src/index";

export function registerNekoPluginHost(userDataPath: string, interruptReply: () => void, getConfig: () => GreyfieldConfig | undefined): NekoPlugin {
  const tracePath = process.env.GREYFIELD_BROWSER_TRACE_PATH;
  let traceStep = 0;
  let modelTraceStep = 0;
  const broadcast = (event: NekoPluginEvent) => {
    for (const window of BrowserWindow.getAllWindows()) window.webContents.send("neko:event", event);
  };
  const plugin = new NekoPlugin({ root: join(userDataPath, "plugins", "neko"), sourcePath: process.env.GREYFIELD_NEKO_SOURCE_PATH,
    createBrowserTools: () => createNekoResearchTools(createBrowserResearchTools({ profilePath: join(userDataPath, "chrome-voice-research"),
      onPage: () => broadcast({ type: "research", name: "chrome", status: "running" }),
      ...(tracePath ? { onResult: async (event, page) => {
        await mkdir(tracePath, { recursive: true });
        const name = `voice-${++traceStep}-${event.name}`;
        await writeFile(join(tracePath, `${name}.json`), JSON.stringify({ name: event.name, elapsedMs: event.elapsedMs, ...JSON.parse(event.result.text) }, null, 2));
        await page.screenshot({ path: join(tracePath, `${name}.png`) });
      } } : {})
    }), () => {
      const config = getConfig();
      if (!config || config.provider.llm !== "openai-compatible" || !config.provider.apiKey || !config.provider.baseUrl) throw new Error("请先在设置中配置网页研究使用的模型服务。");
      return new OpenAICompatibleLLMProvider({ baseUrl: config.provider.baseUrl, apiKey: config.provider.apiKey, model: config.provider.taskModels.utility || config.provider.model, timeoutMs: 45_000,
        fetch: async (input, init) => {
          const response = await net.fetch(input instanceof URL ? input.href : input, init);
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
    }, (event) => { if (event.type === "assistant.tool.status") broadcast({ type: "message", data: { ...event, type: "browser_tool_status" } }); }), emit: broadcast });
  ipcMain.on("neko:command", (_event, payload: { action: string; message?: string }) => {
    if (payload.action === "status") broadcast({ type: "state", state: plugin.getState() });
    if (payload.action === "install") void plugin.install();
    if (payload.action === "start") { interruptReply(); void plugin.start(); }
    if (payload.action === "stop") void (payload.message ? plugin.reportError(payload.message) : plugin.stop());
    if (payload.action === "user-activity") plugin.interruptResearch();
  });
  ipcMain.on("neko:audio", (_event, payload: { data: Uint8Array; sampleRate: number }) => plugin.sendPcm(payload.data, payload.sampleRate));
  return plugin;
}
