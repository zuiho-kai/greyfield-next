import { describe, expect, it, vi } from "vitest";
import { GreyfieldRuntime } from "../runtime-loop";
import { InMemorySessionStore } from "../session-store";
import { OpenAICompatibleLLMProvider } from "../openai-compatible-provider";
import type { ChatMessage, LLMProvider } from "../providers";
import type { RuntimeOutputEvent } from "../events";
import type { WebTools } from "../web-tools";

function sse(deltas: unknown[]): Response {
  const data = deltas.map((delta) => `data: ${JSON.stringify({ choices: [{ delta }] })}\n\n`).join("") + "data: [DONE]";
  // Deliberately split byte frames inside JSON and UTF-8, not just SSE lines.
  const bytes = new TextEncoder().encode(data);
  return new Response(new ReadableStream({ start(controller) {
    for (let i = 0; i < bytes.length; i += 7) controller.enqueue(bytes.slice(i, i + 7));
    controller.close();
  } }));
}

function toolResponse() {
  return sse([
    { content: "我查一下。", tool_calls: [{ index: 0, id: "call-1", function: { name: "web_", arguments: '{"que' } }] },
    { tool_calls: [{ index: 0, function: { name: "search", arguments: 'ry":"ERR_MODULE_NOT_FOUND"}' } }] }
  ]);
}

function setup(fetchImpl: typeof fetch, execute: WebTools["execute"], visionLlm?: LLMProvider, speak?: (text: string) => Promise<Uint8Array>) {
  const sessionStore = new InMemorySessionStore("research-test");
  const events: RuntimeOutputEvent[] = [];
  const llm = new OpenAICompatibleLLMProvider({ baseUrl: "https://example.test/v1", apiKey: "test", model: "test", fetch: fetchImpl });
  const runtime = new GreyfieldRuntime({ llm, visionLlm, webTools: { definitions: [{ name: "web_search", parameters: { type: "object" } }], execute },
    sessionStore, memoryStore: { load: async () => "", save: async () => {}, consolidate: async () => "" }, memoryEnabled: false,
    tts: { synthesize: speak ?? (async () => new Uint8Array()) }, ttsEnabled: Boolean(speak), persona: { name: "Greyfield", tone: "helpful", boundaries: [], expressionMap: {} }, voice: "default" });
  return { runtime, sessionStore, events, emit: (event: RuntimeOutputEvent) => { events.push(event); } };
}

describe("research conversation", () => {
  it("uses a vision model without tools, researches with Chat, and never forwards or saves raw screenshots", async () => {
    let visionMessages: ChatMessage[] = [];
    const chatRequests: Array<{ messages: ChatMessage[] }> = [];
    const context = setup(async (_url, init) => {
      chatRequests.push(JSON.parse(String(init?.body)));
      return chatRequests.length === 1 ? toolResponse() : sse([{ content: "检查 lodash 依赖后重试。" }]);
    }, async () => ({ text: "Search result", sources: [] }), {
      supportsVision: true,
      async *stream(messages, tools) { visionMessages = messages; expect(tools).toBeUndefined(); yield "CURRENT_SCREEN_ONLY: ERR_MODULE_NOT_FOUND, lodash"; }
    });
    await context.runtime.handle({ type: "text.input", text: "这个报错帮我查一下", attachments: [{ id: "screen", mimeType: "image/png", dataUrl: "data:image/png;base64,AAAA", createdAt: new Date().toISOString(), source: "screenshot" }] }, context.emit);
    expect(JSON.stringify(visionMessages)).toContain("data:image/png");
    expect(JSON.stringify(chatRequests[0])).toContain("CURRENT_SCREEN_ONLY");
    expect(JSON.stringify(chatRequests)).not.toContain("data:image/png");
    expect(JSON.stringify(await context.sessionStore.getRecent(10))).not.toContain("CURRENT_SCREEN_ONLY");
    await context.runtime.handle({ type: "text.input", text: "关闭屏幕后直接回复" }, context.emit);
    expect(JSON.stringify(chatRequests.at(-1))).not.toContain("CURRENT_SCREEN_ONLY");
  });

  it("assembles fragmented calls, returns correlated results, answers, retains sources and follows up without raw tool persistence", async () => {
    const requests: Array<{ messages: ChatMessage[]; tools?: unknown[] }> = [];
    const fetchImpl = vi.fn<typeof fetch>(async (_url, init) => {
      requests.push(JSON.parse(String(init?.body)));
      if (requests.length === 1) return toolResponse();
      if (requests.length === 2) return sse([{ content: "我再读一下来源。", tool_calls: [{ index: 0, id: "read-2", function: { name: "read_webpage", arguments: '{"url":"https://nodejs.org/api/errors.html"}' } }] }]);
      return sse([{ content: "安装缺少的依赖，然后重新运行。" }]);
    });
    const execute = vi.fn<WebTools["execute"]>(async () => ({ text: "RAW_PAGE_CONTENT_ONLY_FOR_THIS_TURN", sources: [{ title: "Node docs", url: "https://nodejs.org/api/errors.html" }] }));
    const spoken: string[] = [];
    const context = setup(fetchImpl, execute, undefined, async (text) => { spoken.push(text); return new Uint8Array(); });
    await context.runtime.handle({ type: "text.input", text: "帮我查这个错误" }, context.emit);
    expect(requests[0]?.tools).toEqual([{ type: "function", function: { name: "web_search", parameters: { type: "object" } } }]);
    expect(execute).toHaveBeenCalledWith("web_search", { query: "ERR_MODULE_NOT_FOUND" }, expect.any(AbortSignal));
    expect(requests[1]?.messages).toContainEqual({ role: "tool", tool_call_id: "call-1", content: "RAW_PAGE_CONTENT_ONLY_FOR_THIS_TURN" });
    const turns = await context.sessionStore.getRecent(10);
    expect(turns[1]?.content).toContain("[Node docs](https://nodejs.org/api/errors.html)");
    expect(turns[1]?.content).not.toContain("我查一下");
    expect(turns[1]?.content).not.toContain("我再读一下");
    expect(spoken).toEqual(["安装缺少的依赖，然后重新运行。"]);
    expect(JSON.stringify(turns)).not.toContain("RAW_PAGE_CONTENT");
    await context.runtime.handle({ type: "text.input", text: "第二步为什么" }, context.emit);
    expect(JSON.stringify(requests[3]?.messages)).toContain("安装缺少的依赖");
    expect(JSON.stringify(requests[3]?.messages)).not.toContain("RAW_PAGE_CONTENT");
  });

  it("reports a real tool failure to both the user status and the next model request", async () => {
    const requests: ChatMessage[][] = [];
    const context = setup(async (_url, init) => {
      requests.push(JSON.parse(String(init?.body)).messages);
      return requests.length === 1 ? toolResponse() : sse([{ content: "搜索服务未能连接，我还没有查到资料。" }]);
    }, async () => { throw new Error("HTTP 503"); });
    await context.runtime.handle({ type: "text.input", text: "查一下" }, context.emit);
    expect(context.events).toContainEqual({ type: "assistant.tool.status", name: "web_search", status: "failed", message: "HTTP 503" });
    expect(requests[1]).toContainEqual({ role: "tool", tool_call_id: "call-1", content: '{"error":"HTTP 503"}' });
  });

  it("Stop aborts a pending tool, ignores late results and persists no partial turn", async () => {
    let started!: () => void;
    const ready = new Promise<void>((resolve) => { started = resolve; });
    let toolSignal: AbortSignal | undefined;
    const fetchImpl = vi.fn<typeof fetch>(async () => toolResponse());
    const context = setup(fetchImpl, async (_name, _args, signal) => {
      toolSignal = signal;
      started();
      await new Promise<void>((resolve) => signal.addEventListener("abort", () => resolve(), { once: true }));
      return { text: "LATE_RESULT", sources: [] };
    });
    const pending = context.runtime.handle({ type: "text.input", text: "查一下" }, context.emit);
    await ready;
    context.runtime.requestInterrupt();
    await pending;
    expect(toolSignal?.aborted).toBe(true);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(context.events.some((event) => event.type === "assistant.text.final")).toBe(false);
    expect(await context.sessionStore.getRecent(10)).toEqual([]);
  });
});
