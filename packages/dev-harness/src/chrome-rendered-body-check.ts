import assert from "node:assert/strict";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Page } from "playwright";
import { createBrowserResearchTools } from "../../browser-runtime/src/index";

process.env.PW_TEST_SCREENSHOT_NO_FONTS_READY = "1";
const artifacts = join(process.cwd(), ".cache", "chrome-rendered-body", new Date().toISOString().replace(/[:.]/g, "-"));
await mkdir(artifacts, { recursive: true });
let page: Page;
const tools = createBrowserResearchTools({ profilePath: await mkdtemp(join(tmpdir(), "greyfield-rendered-body-")), onPage: (value) => { page = value; } });
const controller = new AbortController();
const summary: Record<string, unknown> = { ok: false, artifacts };
try {
  const started = Date.now();
  const first = JSON.parse((await tools.execute("read_webpage", { url: "https://www.weather.gov.hk/sc/wxinfo/currwx/flw.htm" }, controller.signal)).text);
  summary.hko = { elapsedMs: Date.now() - started, ...first };
  await writeFile(join(artifacts, "hko-first-read.json"), JSON.stringify(summary.hko, null, 2));
  await page!.getByText("本港地区天气预报", { exact: true }).last().scrollIntoViewIfNeeded();
  await page!.screenshot({ path: join(artifacts, "hko-first-read.png") });
  assert.match(first.content, /天气稿更新于\d{4}年/);
  assert.match(first.content, /本港地区[^\n]*天气预测/);
  assert.equal(first.renderingPending, undefined, "HKO first read did not reach readiness within the bound");

  // Public test hostname is intercepted only by this harness; production URL policy stays intact.
  await page!.route("https://rendered-body.example/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path === "/background-data") return; // Deliberately never completes.
    if (path === "/data") {
      await new Promise((resolve) => setTimeout(resolve, 750));
      await route.fulfill({ contentType: "text/plain", body: "Delayed JavaScript article: the requested body is now available in the first read." }).catch(() => {});
      return;
    }
    const body = path === "/static" ? "Static article: this complete paragraph is available immediately without any asynchronous data request." : "Navigation menu only; article still loading.";
    const script = path === "/delayed" ? `fetch('/data').then(response=>response.text()).then(text=>document.querySelector('p').textContent=text)`
      : path === "/busy" ? `document.querySelector('main').setAttribute('aria-busy','true');setTimeout(()=>{document.querySelector('p').textContent='Timer-rendered article: the busy content has finished rendering and is ready to read.';document.querySelector('main').removeAttribute('aria-busy')},750)`
      : path === "/background" ? `fetch('/background-data')` : "";
    await route.fulfill({ contentType: "text/html", body: `<title>Rendered body fixture</title><main><h1>Reference article</h1><p>${body}</p></main><script>${script}</script>` });
  });
  for (const path of ["static", "delayed", "busy", "background"]) {
    const start = Date.now();
    const result = JSON.parse((await tools.execute("read_webpage", { url: `https://rendered-body.example/${path}` }, controller.signal)).text);
    const elapsedMs = Date.now() - start;
    summary[path] = { elapsedMs, ...result };
    if (path === "static") { assert.match(result.content, /Static article:/); assert.ok(elapsedMs < 1_500, `Static read took ${elapsedMs}ms`); }
    if (path === "delayed") assert.match(result.content, /Delayed JavaScript article:/);
    if (path === "busy") assert.match(result.content, /Timer-rendered article:/);
    if (path === "background") { assert.equal(result.renderingPending, true); assert.ok(elapsedMs < 7_500); }
    else assert.equal(result.renderingPending, undefined);
  }
  const pending = tools.execute("read_webpage", { url: "https://rendered-body.example/background" }, controller.signal);
  // Synchronize with the pending data request, then exercise the actual turn abort.
  await page!.waitForRequest("https://rendered-body.example/background-data");
  const stopStarted = Date.now();
  controller.abort();
  await assert.rejects(pending);
  const stopMs = Date.now() - stopStarted;
  assert.ok(stopMs < 1_000, `Stop took ${stopMs}ms`);
  summary.stopMs = stopMs;
  summary.ok = true;
} catch (error) {
  summary.error = String(error);
  process.exitCode = 1;
} finally {
  await tools.dispose?.();
  await writeFile(join(artifacts, "summary.json"), JSON.stringify(summary, null, 2));
  console.log(JSON.stringify({ ok: summary.ok, artifacts, error: summary.error, stopMs: summary.stopMs }));
}
