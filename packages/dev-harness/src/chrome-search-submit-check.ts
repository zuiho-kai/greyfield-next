import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Page } from "playwright";
import { createBrowserResearchTools } from "../../browser-runtime/src/index";

const artifacts = join(process.cwd(), ".cache", "chrome-search-submit", new Date().toISOString().replace(/[:.]/g, "-"));
await mkdir(artifacts, { recursive: true });
const server = createServer((request, response) => {
  const url = new URL(request.url!, "http://fixture.test");
  response.setHeader("content-type", "text/html; charset=utf-8");
  response.end(`<title>Greyfield local search fixture</title><main><h1>Documentation search</h1><form role="search" action="/results"><input type="search" name="q" aria-label="Search documentation"><button>Search</button></form><p id="result">${url.pathname === "/results" ? "Navigation result: exact dependency installation from the requested documentation." : "Previous search result: this stale paragraph must not be returned after a query."}</p></main>${url.pathname === "/dynamic" ? `<script>document.querySelector('form').addEventListener('submit', event => { event.preventDefault(); document.querySelector('main').setAttribute('aria-busy','true'); document.querySelector('#result').textContent='Loading the requested documentation...'; setTimeout(() => { document.querySelector('#result').textContent='Dynamic result: '+document.querySelector('input').value+' — install only the missing dependency.'; document.querySelector('main').removeAttribute('aria-busy'); }, 350); });</script>` : ""}`);
});
await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
const localOrigin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
const origin = "https://search.greyfield.example";
let activePage: Page | undefined;
const tools = createBrowserResearchTools({ profilePath: await mkdtemp(join(tmpdir(), "greyfield-search-submit-")), onPage: (page) => { activePage = page; } });
const signal = new AbortController().signal;
const summary: Record<string, unknown> = { ok: false, artifacts };
try {
  // Serve the local fixture behind a public test URL; production policy has no local exception.
  await tools.execute("browser_read", {}, signal).catch(() => {});
  await activePage!.route(`${origin}/**`, async (route) => {
    const url = new URL(route.request().url());
    await route.fulfill({ response: await activePage!.request.get(localOrigin + url.pathname + url.search) });
  });
  for (const path of ["/dynamic", "/navigation"]) {
    await activePage!.goto(origin + path);
    const snapshot = JSON.parse((await tools.execute("browser_read", {}, signal)).text);
    const field = snapshot.elements.find((element: { kind: string }) => element.kind === "search");
    const start = Date.now();
    const result = JSON.parse((await tools.execute("browser_type", { ref: field.ref, text: "lodash" }, signal)).text);
    const expected = path === "/dynamic" ? "Dynamic result: lodash" : "Navigation result:";
    if (!result.content.includes(expected) || result.content.includes("Previous search result") || result.content.includes("Loading the requested")) throw new Error(`Search returned stale content for ${path}`);
    if (path === "/dynamic" && result.url !== origin + path) throw new Error("The dynamic fixture unexpectedly navigated");
    await activePage!.screenshot({ path: join(artifacts, `${path.slice(1)}.png`) });
    summary[path.slice(1)] = { ms: Date.now() - start, url: result.url, content: result.content };
  }
  summary.ok = true;
} catch (error) {
  summary.error = String(error);
  process.exitCode = 1;
} finally {
  await tools.dispose?.();
  server.closeAllConnections();
  await new Promise<void>((resolve) => server.close(() => resolve()));
  await writeFile(join(artifacts, "summary.json"), JSON.stringify(summary, null, 2));
  console.log(JSON.stringify(summary, null, 2));
}
