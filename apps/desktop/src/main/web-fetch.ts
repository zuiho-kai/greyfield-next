import { net } from "electron";

/** Read-only web tools need redirect headers; Electron net.fetch rejects manual redirects. */
export const fetchWebPage: typeof fetch = async (input, init) => {
  const url = input instanceof Request ? input.url : String(input);
  const signal = init?.signal;
  signal?.throwIfAborted();
  return new Promise<Response>((resolve, reject) => {
    const request = net.request({ url, method: "GET", redirect: "manual", credentials: "omit" });
    new Headers(init?.headers).forEach((value, name) => request.setHeader(name, value));
    let controller: ReadableStreamDefaultController<Uint8Array> | undefined;
    let bodyFinished = false;
    const fail = (error: unknown) => {
      reject(error);
      if (controller && !bodyFinished) { bodyFinished = true; controller.error(error); }
    };
    const abort = () => { fail(signal?.reason ?? new DOMException("Aborted", "AbortError")); request.abort(); };
    signal?.addEventListener("abort", abort, { once: true });
    request.on("close", () => signal?.removeEventListener("abort", abort));
    request.on("error", fail);
    request.on("redirect", (status, _method, location, rawHeaders) => {
      const headers = responseHeaders(rawHeaders);
      headers.set("location", location);
      // Do not follow here: core validates the next destination before fetching it.
      resolve(new Response(null, { status, headers }));
    });
    request.on("response", (response) => {
      const body = new ReadableStream<Uint8Array>({
        start(streamController) {
          controller = streamController;
          response.on("data", (chunk) => { if (!bodyFinished) controller!.enqueue(new Uint8Array(chunk)); });
          response.on("end", () => { if (!bodyFinished) { bodyFinished = true; controller!.close(); } });
          response.on("error", fail);
          response.on("aborted", () => fail(new DOMException("Aborted", "AbortError")));
        },
        cancel() { bodyFinished = true; request.abort(); }
      });
      resolve(new Response([204, 205, 304].includes(response.statusCode) ? null : body, { status: response.statusCode, headers: responseHeaders(response.headers) }));
    });
    request.end();
  });
};

function responseHeaders(raw: Record<string, string | string[]>): Headers {
  const headers = new Headers();
  for (const [name, values] of Object.entries(raw)) for (const value of Array.isArray(values) ? values : [values]) headers.append(name, value);
  return headers;
}
