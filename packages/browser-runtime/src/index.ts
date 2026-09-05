import { chromium, errors, type BrowserContext, type Page } from "playwright-core";
import type { WebTools, WebToolResult, ToolDefinition } from "@greyfield/core-runtime";

const definitions: ToolDefinition[] = [
  { name: "web_search", description: "Search the web in visible Chrome. Returns real search result cards with link refs, not the search engine's AI answer. Use exact quoted errors and prefer official sources. Click a result ref or open its URL to verify it.", parameters: { type: "object", properties: { query: { type: "string" } }, required: ["query"] } },
  { name: "read_webpage", description: "Open a public source in Chrome and read its rendered text, including JavaScript content. Supply a short focus or URL fragment for a long documentation page. Returns visible links/search fields with refs for further browsing.", parameters: { type: "object", properties: { url: { type: "string" }, focus: { type: "string" } }, required: ["url"] } },
  { name: "browser_read", description: "Read the current rendered page. Use focus to find a phrase or heading, or offset to continue a long page. Wait briefly for dynamic content using waitForText when needed.", parameters: { type: "object", properties: { focus: { type: "string" }, offset: { type: "number" }, waitForText: { type: "string" } } } },
  { name: "browser_click", description: "Follow a visible link using its ref from the latest page result; the resulting rendered page is returned. This is research navigation only.", parameters: { type: "object", properties: { ref: { type: "string" }, focus: { type: "string" } }, required: ["ref"] } },
  { name: "browser_type", description: "Enter a query in a visible page search field using its ref and submit with Enter. Only search fields are supported, not messages, login or other forms.", parameters: { type: "object", properties: { ref: { type: "string" }, text: { type: "string" } }, required: ["ref", "text"] } }
];

export interface BrowserResearchOptions {
  profilePath: string;
  onPage?: (page: Page) => void;
  onResult?: (event: { name: string; result: WebToolResult; elapsedMs: number }, page: Page) => Promise<void>;
}

/** One private Chrome profile; each research turn owns only its newly-created page. */
export function createBrowserResearchTools(options: BrowserResearchOptions): WebTools {
  let contextPromise: Promise<BrowserContext> | undefined;
  let current: { signal: AbortSignal; page?: Page; abort: () => void } | undefined;
  let generation = 0;
  const getContext = () => contextPromise ??= chromium.launchPersistentContext(options.profilePath, {
    channel: "chrome", headless: false, viewport: { width: 1120, height: 780 },
    acceptDownloads: false, timeout: 20_000
  }).then(async (context) => {
    context.setDefaultTimeout(10_000);
    context.on("close", () => { contextPromise = undefined; });
    // Keep Chrome's initial blank tab alive. Closing its final tab exits Chrome,
    // which otherwise races the next turn's newPage after Stop.
    return context;
  }).catch((error) => { contextPromise = undefined; throw new Error(`Chrome could not start. Install Google Chrome and retry. ${String(error).split("\n")[0]}`); });

  async function pageFor(signal: AbortSignal): Promise<Page> {
    signal.throwIfAborted();
    if (current?.signal !== signal) {
      current?.signal.removeEventListener("abort", current.abort);
      await current?.page?.close().catch(() => {});
      const turn = { signal, page: undefined as Page | undefined, abort: () => { void turn.page?.close().catch(() => {}); } };
      current = turn;
      signal.addEventListener("abort", turn.abort, { once: true });
    }
    const turn = current!;
    if (!turn.page || turn.page.isClosed()) {
      const context = await getContext();
      signal.throwIfAborted();
      turn.page = await context.newPage();
      if (signal.aborted || current !== turn) { await turn.page.close(); signal.throwIfAborted(); throw new Error("Research turn superseded"); }
      turn.page.on("popup", (popup) => { void popup.close(); });
      await turn.page.route("**/*", (route) => {
        // Research never submits arbitrary forms or uploads data.
        const request = route.request();
        return request.isNavigationRequest() && request.method() !== "GET" ? route.abort() : route.continue();
      });
    }
    options.onPage?.(turn.page);
    return turn.page;
  }

  async function open(page: Page, url: string): Promise<void> {
    const target = publicUrl(url);
    const response = await page.goto(target, { waitUntil: "domcontentloaded", timeout: 25_000 });
    if (response && response.status() >= 400) throw new Error(`Source returned HTTP ${response.status()}: ${page.url()}`);
    await page.locator("body").waitFor();
  }

  return {
    definitions,
    async execute(name, args, signal) {
      const start = Date.now();
      if (!args || typeof args !== "object") throw new Error("Browser arguments must be an object");
      const input = args as Record<string, unknown>;
      const page = await pageFor(signal);
      let result: WebToolResult;
      if (name === "web_search") {
        const query = stringArg(input.query, "query").replace(/(?<![\w"])([A-Z][A-Z0-9]+(?:_[A-Z0-9]+)+)(?![\w"])/g, '"$1"');
        await open(page, `https://www.bing.com/search?q=${encodeURIComponent(query)}`);
        await page.locator("#b_results li.b_algo h2 a:visible").first().waitFor({ timeout: 12_000 });
        const prefix = `g${++generation}-`;
        const results = await page.locator("#b_results li.b_algo:visible").evaluateAll((cards, prefix) => cards.slice(0, 8).flatMap((card, index) => {
          const link = card.querySelector<HTMLAnchorElement>("h2 a");
          if (!link) return [];
          const ref = `${prefix}${index}`;
          link.setAttribute("data-greyfield-ref", ref);
          let url = link.href;
          const encoded = new URL(url).searchParams.get("u");
          if (encoded?.startsWith("a1")) { try { const decoded = atob(encoded.slice(2).replace(/-/g, "+").replace(/_/g, "/")); if (/^https?:\/\//.test(decoded)) url = decoded; } catch {} }
          link.setAttribute("data-greyfield-destination", url);
          return [{ ref, title: link.innerText, url, snippet: card.querySelector<HTMLElement>(".b_caption p")?.innerText?.slice(0, 650) ?? "" }];
        }), prefix);
        if (!results.length) throw new Error("Search returned no results; open a known official site or try a different query.");
        result = { text: JSON.stringify({ url: page.url(), query, results }), sources: [] };
      } else {
        if (name === "read_webpage") await open(page, stringArg(input.url, "url"));
        else if (name === "browser_click" || name === "browser_type") {
          const ref = stringArg(input.ref, "ref");
          if (!/^g\d+-\d+$/.test(ref)) throw new Error("Use a ref from the latest browser result");
          const element = page.locator(`[data-greyfield-ref="${ref}"]`);
          if (await element.count() !== 1) throw new Error("This page ref is stale; read the page again");
          if (name === "browser_click") {
            const href = await element.getAttribute("href");
            if (!href) throw new Error("Only visible research links can be followed");
            const destination = new URL(await element.getAttribute("data-greyfield-destination") ?? href, page.url());
            publicUrl(destination.href);
            await element.evaluate((node) => node.removeAttribute("target"));
            const before = page.url();
            if (destination.href !== before) await Promise.all([
              page.waitForURL((url) => url.href !== before && url.origin === destination.origin, { waitUntil: "domcontentloaded", timeout: 25_000 }),
              element.click()
            ]);
            else await element.click();
          } else {
            if (await element.getAttribute("data-greyfield-search") !== "true") throw new Error("Only a visible search field can be used");
            await element.fill(stringArg(input.text, "text"));
            const before = await page.evaluate(() => ({ documentStartedAt: performance.timeOrigin, text: (document.querySelector<HTMLElement>("main, [role=main], article, #apicontent") ?? document.body).innerText }));
            await Promise.all([
              page.waitForFunction((before) => {
                const root = document.querySelector<HTMLElement>("main, [role=main], article, #apicontent") ?? document.body;
                if (document.readyState === "loading" || root.matches('[aria-busy="true"]') || root.querySelector('[aria-busy="true"]')) return false;
                return performance.timeOrigin !== before.documentStartedAt || root.innerText !== before.text;
              }, before),
              element.press("Enter")
            ]);
            await page.waitForLoadState("domcontentloaded");
          }
        } else if (name !== "browser_read") throw new Error(`Unknown browser tool: ${name}`);
        if (typeof input.waitForText === "string" && input.waitForText.trim()) await page.getByText(input.waitForText, { exact: false }).first().waitFor();
        const renderingPending = await waitForRenderedBody(page);
        result = await readPage(page, input, `g${++generation}-`, renderingPending);
      }
      signal.throwIfAborted();
      await options.onResult?.({ name, result, elapsedMs: Date.now() - start }, page);
      return result;
    },
    async finish(signal, completed) {
      if (current?.signal !== signal) return;
      signal.removeEventListener("abort", current.abort);
      if (!completed || signal.aborted) await current.page?.close().catch(() => {});
    },
    async dispose() {
      current?.signal.removeEventListener("abort", current.abort);
      await (await contextPromise)?.close();
      current = undefined;
    }
  };
}

async function waitForRenderedBody(page: Page): Promise<boolean> {
  // DOMContentLoaded can precede the data requests that fill a page's empty body.
  // Bound both waits: a background connection must not hold research indefinitely.
  // Closing the turn's page on Stop interrupts the Playwright waits immediately.
  const outcomes = await Promise.all([
    page.waitForLoadState("networkidle", { timeout: 6_000 }),
    page.waitForFunction((state) => {
      const root = document.querySelector<HTMLElement>("main, [role=main], article, #apicontent") ?? document.body;
      if (!root || document.readyState === "loading") return false;
      const text = root.innerText;
      if (text !== state.text || root.matches('[aria-busy="true"]') || root.querySelector('[aria-busy="true"]')) {
        state.text = text;
        state.changedAt = Date.now();
        return false;
      }
      return Date.now() - state.changedAt >= 200;
    }, { text: "", changedAt: Date.now() }, { timeout: 6_000, polling: 100 }).then((handle) => handle.dispose())
  ].map((wait) => wait.then(() => false).catch((error: unknown) => {
    if (error instanceof errors.TimeoutError) return true;
    throw error;
  })));
  return outcomes.some(Boolean);
}

async function readPage(page: Page, input: Record<string, unknown>, prefix: string, renderingPending: boolean): Promise<WebToolResult> {
  const snapshot = await page.evaluate(({ focus, offset, prefix }) => {
    const root = document.querySelector<HTMLElement>("main, [role=main], article, #apicontent") ?? document.body;
    let text = root.innerText;
    const target = focus || decodeURIComponent(location.hash.slice(1));
    let matched = false;
    if (target) {
      const heading = Array.from(root.querySelectorAll<HTMLElement>("h1,h2,h3,h4,h5,h6")).find((node) => node.id.toLowerCase() === target.toLowerCase() || node.innerText.toLowerCase().includes(target.toLowerCase()) || node.querySelector(`[id]`)?.id.toLowerCase() === target.toLowerCase());
      const fragment = document.getElementById(target);
      const anchor = heading ?? fragment?.closest<HTMLElement>("h1,h2,h3,h4,h5,h6,section") ?? fragment;
      if (anchor) {
        anchor.scrollIntoView({ block: "start" });
        const start = text.lastIndexOf(anchor.innerText.trim());
        if (start >= 0) {
          text = text.slice(start); matched = true;
          if (heading) {
            const level = Number(heading.tagName.slice(1));
            const nextHeading = Array.from(root.querySelectorAll<HTMLElement>("h1,h2,h3,h4,h5,h6")).find((node) => Boolean(heading.compareDocumentPosition(node) & Node.DOCUMENT_POSITION_FOLLOWING) && Number(node.tagName.slice(1)) <= level);
            const end = nextHeading ? text.indexOf(nextHeading.innerText.trim(), heading.innerText.length) : -1;
            if (end > 0) text = text.slice(0, end);
          }
        }
      }
      if (!matched) {
        const at = text.toLowerCase().lastIndexOf(target.toLowerCase());
        if (at >= 0) { text = text.slice(Math.max(0, at - 350)); matched = true; }
      }
    }
    document.querySelectorAll("[data-greyfield-ref]").forEach((node) => node.removeAttribute("data-greyfield-ref"));
    const candidates = Array.from(document.querySelectorAll<HTMLElement>('a[href], input[type="search"], [role="searchbox"], form[role="search"] input, input[name="q"], input[name="query"]'));
    const visible = candidates.filter((node) => node.getClientRects().length > 0 && getComputedStyle(node).visibility !== "hidden");
    const sorted = [...visible.filter((node) => { const rect = node.getBoundingClientRect(); return rect.bottom >= 0 && rect.top <= innerHeight; }), ...visible.filter((node) => { const rect = node.getBoundingClientRect(); return rect.bottom < 0 || rect.top > innerHeight; })];
    const elements = sorted.slice(0, 45).map((node, index) => {
      const ref = `${prefix}${index}`;
      node.setAttribute("data-greyfield-ref", ref);
      const isSearch = node.tagName === "INPUT" || node.getAttribute("role") === "searchbox";
      if (isSearch) node.setAttribute("data-greyfield-search", "true");
      return { ref, kind: isSearch ? "search" : "link", text: (node.innerText || node.getAttribute("aria-label") || node.getAttribute("placeholder") || "").trim().slice(0, 160), ...(isSearch ? {} : { url: (node as HTMLAnchorElement).href }) };
    }).filter((item) => item.text);
    return { url: location.href, title: document.title, content: text.slice(offset, offset + 10000), totalCharacters: text.length, nextOffset: text.length > offset + 10000 ? offset + 10000 : null, focusFound: target ? matched : undefined, elements };
  }, { focus: typeof input.focus === "string" ? input.focus.trim() : "", offset: typeof input.offset === "number" ? Math.max(0, Math.floor(input.offset)) : 0, prefix });
  if (/captcha|verify you are human|just a moment|access denied/i.test(snapshot.title) || /\/sorry\//.test(snapshot.url)) throw new Error(`Source needs human verification: ${snapshot.url}. Use another source; do not bypass it.`);
  if (snapshot.content.trim().length < 40) throw new Error("Page has little rendered text yet; use browser_read with waitForText or follow a visible link.");
  return { text: JSON.stringify({ ...snapshot, ...(renderingPending ? { renderingPending: true } : {}) }), sources: [{ title: snapshot.title, url: snapshot.url }] };
}

function stringArg(value: unknown, name: string): string {
  if (typeof value !== "string" || !value.trim()) throw new Error(`Missing ${name}`);
  return value.trim().slice(0, 2000);
}

function publicUrl(value: string): string {
  const url = new URL(value);
  if (!/^https?:$/.test(url.protocol) || url.username || url.password || /^(localhost|127\.|0\.|10\.|192\.168\.|\[::1\])/.test(url.hostname)) throw new Error("Research supports public HTTP(S) URLs only");
  return url.href;
}
