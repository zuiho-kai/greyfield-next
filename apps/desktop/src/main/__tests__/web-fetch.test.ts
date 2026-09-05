import { createServer, type RequestListener } from "node:http";
import type { AddressInfo } from "node:net";
import { afterEach, expect, it } from "vitest";
import { fetchWebPage } from "../web-fetch";

const cleanup: Array<() => Promise<void>> = [];
afterEach(async () => { for (const close of cleanup.splice(0)) await close(); });
async function fixture(handler: RequestListener) {
  const server = createServer(handler);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  cleanup.push(async () => { server.closeAllConnections(); await new Promise<void>((resolve) => server.close(() => resolve())); });
  return (server.address() as AddressInfo).port;
}

it("uses the supplied DNS binding and preserves Host without resolving the hostname again", async () => {
  let host: string | undefined;
  const port = await fixture((request, response) => { host = request.headers.host; response.end("Bound response"); });
  // This name has no usable DNS answer. Only the already-selected fixture address can connect.
  const response = await fetchWebPage(new URL(`http://rebind.invalid:${port}/`), {}, [{ address: "127.0.0.1", family: 4 }]);
  expect(await response.text()).toBe("Bound response");
  expect(host).toBe(`rebind.invalid:${port}`);
});

it("returns redirect headers without requesting the next destination", async () => {
  let requests = 0;
  const port = await fixture((_request, response) => { requests++; response.writeHead(302, { location: "http://127.0.0.1/private" }); response.end(); });
  const response = await fetchWebPage(new URL(`http://rebind.invalid:${port}/`), {}, [{ address: "127.0.0.1", family: 4 }]);
  expect(response.status).toBe(302);
  expect(response.headers.get("location")).toBe("http://127.0.0.1/private");
  expect(requests).toBe(1);
});

it("falls back only within the supplied address list when the first connection fails", async () => {
  const port = await fixture((_request, response) => response.end("Second binding reached"));
  const response = await fetchWebPage(new URL(`http://rebind.invalid:${port}/`), {}, [
    { address: "127.0.0.2", family: 4 }, { address: "127.0.0.1", family: 4 }
  ]);
  expect(await response.text()).toBe("Second binding reached");
});

it("aborts a streaming body when stopped", async () => {
  const port = await fixture((_request, response) => { response.writeHead(200, { "content-type": "text/plain" }); response.write("page"); });
  const stop = new AbortController();
  const response = await fetchWebPage(new URL(`http://rebind.invalid:${port}/`), { signal: stop.signal }, [{ address: "127.0.0.1", family: 4 }]);
  const reader = response.body!.getReader();
  expect(new TextDecoder().decode((await reader.read()).value)).toBe("page");
  const next = reader.read();
  stop.abort();
  await expect(next).rejects.toThrow();
});
