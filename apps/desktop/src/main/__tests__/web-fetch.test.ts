import { EventEmitter } from "node:events";
import { beforeEach, expect, it, vi } from "vitest";
const mocked = vi.hoisted(() => ({ request: vi.fn() }));
vi.mock("electron", () => ({ net: { request: mocked.request } }));
import { fetchWebPage } from "../web-fetch";

let request: EventEmitter & { setHeader: ReturnType<typeof vi.fn>; end: ReturnType<typeof vi.fn>; abort: ReturnType<typeof vi.fn> };
beforeEach(() => {
  request = Object.assign(new EventEmitter(), { setHeader: vi.fn(), end: vi.fn(), abort: vi.fn() });
  mocked.request.mockReturnValue(request);
});

it("returns a redirect for core to validate without following it", async () => {
  const pending = fetchWebPage("https://example.com");
  request.emit("redirect", 302, "GET", "https://example.org/docs", {});
  request.emit("error", new Error("Redirect was cancelled"));
  const response = await pending;
  expect(response.status).toBe(302);
  expect(response.headers.get("location")).toBe("https://example.org/docs");
  expect(mocked.request).toHaveBeenCalledWith(expect.objectContaining({ redirect: "manual" }));
});

it("streams page bytes and aborts the native request when the read is stopped", async () => {
  const stop = new AbortController();
  const pending = fetchWebPage("https://example.com", { signal: stop.signal });
  const incoming = Object.assign(new EventEmitter(), { statusCode: 200, headers: { "content-type": "text/plain" } });
  request.emit("response", incoming);
  const response = await pending;
  const reader = response.body!.getReader();
  incoming.emit("data", Buffer.from("page"));
  expect(new TextDecoder().decode((await reader.read()).value)).toBe("page");
  const next = reader.read();
  stop.abort();
  await expect(next).rejects.toThrow();
  expect(request.abort).toHaveBeenCalledOnce();
});
