import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createBrowserResearchTools } from "../../browser-runtime/src/index";
import { OpenAICompatibleLLMProvider, type WebSource } from "@greyfield/core-runtime";
import { streamToolConversation } from "../../core-runtime/src/tool-conversation";
import type { Page } from "playwright";

// Capture the pixels currently visible even if a remote font request remains pending.
process.env.PW_TEST_SCREENSHOT_NO_FONTS_READY = "1";

const artifacts = join(process.cwd(), ".cache", "chrome-research", new Date().toISOString().replace(/[:.]/g, "-"));
await mkdir(artifacts, { recursive: true });
const operations: unknown[] = [];
let step = 0;
let activePage: Page | undefined;
const tools = createBrowserResearchTools({
  profilePath: await mkdtemp(join(tmpdir(), "greyfield-chrome-check-")),
  onPage: (page) => { activePage = page; },
  onResult: async (event, page) => {
    const output = JSON.parse(event.result.text);
    operations.push({ name: event.name, ms: event.elapsedMs, ...output });
    await page.screenshot({ path: join(artifacts, `${++step}-${event.name}.png`) });
    console.log(JSON.stringify({ name: event.name, ms: event.elapsedMs, url: output.url, length: output.content?.length, results: output.results?.length }));
  }
});
const summary: Record<string, unknown> = { ok: false, artifacts };
try {
  const signal = new AbortController().signal;
  const search = JSON.parse((await tools.execute("web_search", { query: '"ERR_MODULE_NOT_FOUND" "lodash"' }, signal)).text);
  const result = search.results.find((item: { url: string }) => item.url.includes("github.com/lodash"));
  if (!result) throw new Error("Search did not return the upstream lodash issue");
  const clicked = JSON.parse((await tools.execute("browser_click", { ref: result.ref, focus: "lodash" }, signal)).text);
  if (!clicked.url.includes("github.com/lodash") || !clicked.content.includes("lodash")) throw new Error("Search result was not navigated/read");
  const source = JSON.parse((await tools.execute("read_webpage", { url: "https://nodejs.org/api/errors.html#err_module_not_found" }, signal)).text);
  if (!source.content.includes("ECMAScript modules loader")) throw new Error("Node error definition was not read from the navigated page");
  await tools.execute("read_webpage", { url: "https://lodash.com/docs/4.17.15#map", focus: "_.map(collection" }, signal);
  const js = JSON.parse((await tools.execute("read_webpage", { url: "https://quotes.toscrape.com/js/" }, signal)).text);
  if (!js.content.includes("Albert Einstein")) throw new Error("JavaScript rendered quotes missing");
  const next = js.elements.find((item: { text: string }) => /Next/.test(item.text));
  if (!next) throw new Error("JS page's Next link missing");
  const secondPage = JSON.parse((await tools.execute("browser_click", { ref: next.ref }, signal)).text);
  if (!secondPage.url.includes("page/2") || !secondPage.content.includes("Marilyn Monroe")) throw new Error("JS pagination was not navigated/read");
  summary.javascriptPagination = { url: secondPage.url, content: secondPage.content };
  await tools.finish?.(signal, true);

  const configPath = process.env.GREYFIELD_ACCEPTANCE_CONFIG;
  if (configPath) {
    const config = JSON.parse((await readFile(configPath, "utf8")).replace(/^\uFEFF/, ""));
    const llm = new OpenAICompatibleLLMProvider({ baseUrl: config.provider.baseUrl, apiKey: config.provider.apiKey, model: config.provider.taskModels.chat, timeoutMs: 90000 });
    const start = Date.now();
    const events: unknown[] = [];
    const sources: WebSource[] = [];
    let answer = "";
    for await (const text of streamToolConversation(llm, [{ role: "user", content: "这个报错帮我用 Chrome 查一下，读官方资料，给简短可执行的修复和来源。Windows 终端：Error [ERR_MODULE_NOT_FOUND]: Cannot find package 'lodash' imported from C:/project/index.mjs。代码 import { map } from 'lodash'; 运行 node index.mjs。" }], tools, new AbortController().signal, (event) => {
      events.push({ atMs: Date.now() - start, ...event });
      if (event.type === "assistant.text.reset") answer = "";
    }, sources)) answer += text;
    summary.realModel = { answerMs: Date.now() - start, answer, sources, events };
    if (!sources.length || !answer.includes("lodash")) throw new Error("Real model did not produce a sourced answer");
  }

  const controller = new AbortController();
  const previousPage = activePage;
  const pending = tools.execute("read_webpage", { url: "https://httpbin.org/delay/20" }, controller.signal);
  const rejected = pending.then(() => false, () => true);
  while (activePage === previousPage) await new Promise((resolve) => setTimeout(resolve, 20));
  const stopAt = Date.now();
  controller.abort();
  if (!await rejected) throw new Error("Cancelled browser navigation unexpectedly completed");
  summary.stopMs = Date.now() - stopAt;
  await tools.finish?.(controller.signal, false);
  if (!activePage?.isClosed()) throw new Error("Stop left the research page open");
  const recovered = JSON.parse((await tools.execute("read_webpage", { url: "https://nodejs.org/api/errors.html#err_module_not_found" }, new AbortController().signal)).text);
  summary.recoveredAfterStop = recovered.content.includes("ECMAScript modules loader");
  if (!summary.recoveredAfterStop) throw new Error("Browser did not recover after Stop");
  summary.ok = true;
} catch (error) {
  summary.error = String(error);
  process.exitCode = 1;
} finally {
  await tools.dispose?.();
  summary.operations = operations;
  await writeFile(join(artifacts, "summary.json"), JSON.stringify(summary, null, 2));
  console.log(JSON.stringify({ ...summary, operations: `${operations.length} detailed records in summary.json` }, null, 2));
}
