import { describe, expect, it, vi } from "vitest";
import { createWebTools } from "../web-tools";

vi.mock("node:dns/promises", () => ({ lookup: vi.fn(async () => [{ address: "93.184.216.34", family: 4 }]) }));

describe("read-only web tools", () => {
  it("reads the matching section of long documentation instead of only its opening", async () => {
    const html = `<title>Node errors</title><nav>ERR_MODULE_NOT_FOUND table of contents</nav><p>${"Unrelated introductory material. ".repeat(1000)}</p><h4 id="err_module_not_found">ERR_MODULE_NOT_FOUND</h4><p>The module loader could not resolve the requested package. Check the exact import name and install the missing dependency in the project directory.</p>`;
    const tools = createWebTools(async () => new Response(html, { headers: { "content-type": "text/html" } }));
    for (const args of [{ url: "https://nodejs.org/api/errors.html", focus: "ERR_MODULE_NOT_FOUND" }, { url: "https://nodejs.org/api/errors.html#err_module_not_found" }]) {
      const result = await tools.execute("read_webpage", args, new AbortController().signal);
      expect(result.text).toContain("install the missing dependency");
      expect(result.text).not.toContain("Unrelated introductory");
    }
  });

  it("extracts real search destinations and readable source content", async () => {
    const tools = createWebTools(async () => new Response('<html><title>Node errors</title><a class="result__a" href="//duckduckgo.com/l/?uddg=https%3A%2F%2Fnodejs.org%2Fapi%2Ferrors.html">Node &amp; errors</a><script>DO_NOT_READ_SCRIPT</script><p>ERR_MODULE_NOT_FOUND means a module could not be resolved. Verify the package name and path.</p></html>', { headers: { "content-type": "text/html" } }));
    const search = await tools.execute("web_search", { query: "Node errors" }, new AbortController().signal);
    expect(search.sources).toEqual([{ title: "Node & errors", url: "https://nodejs.org/api/errors.html" }]);
    const page = await tools.execute("read_webpage", { url: search.sources[0]!.url }, new AbortController().signal);
    expect(page.text).toContain("ERR_MODULE_NOT_FOUND");
    expect(page.text).not.toContain("DO_NOT_READ_SCRIPT");
  });

  it("does not turn verification challenges or HTTP errors into success", async () => {
    const challenge = createWebTools(async () => new Response('<form id="challenge-form">Unfortunately, bots use DuckDuckGo</form>', { headers: { "content-type": "text/html" } }));
    await expect(challenge.execute("web_search", { query: "error" }, new AbortController().signal)).rejects.toThrow("verification challenge");
    const failed = createWebTools(async () => new Response("denied", { status: 403 }));
    await expect(failed.execute("read_webpage", { url: "https://nodejs.org" }, new AbortController().signal)).rejects.toThrow("HTTP 403");
  });

  it("links Stop to the network request", async () => {
    const controller = new AbortController();
    const tools = createWebTools(async (_input, init) => {
      controller.abort();
      expect(init?.signal?.aborted).toBe(true);
      throw new DOMException("Aborted", "AbortError");
    });
    await expect(tools.execute("web_search", { query: "error" }, controller.signal)).rejects.toThrow("Aborted");
  });
});
