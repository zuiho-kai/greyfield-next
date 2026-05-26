import { describe, expect, it, vi } from "vitest";
import { createGreyfieldDesktopApi } from "../desktop-api";

describe("createGreyfieldDesktopApi", () => {
  it("sends typed payloads through ipcRenderer", () => {
    const send = vi.fn();
    const api = createGreyfieldDesktopApi({ send, on: vi.fn() });

    api.send("window:set-click-through", { enabled: true });
    api.send("provider:test-llm", {});

    expect(send).toHaveBeenCalledWith("window:set-click-through", { enabled: true });
    expect(send).toHaveBeenCalledWith("provider:test-llm", {});
  });

  it("returns an unsubscribe function for event handlers", () => {
    const off = vi.fn();
    const on = vi.fn(() => off);
    const api = createGreyfieldDesktopApi({ send: vi.fn(), on });
    const handler = vi.fn();

    const unsubscribe = api.on("window:state", handler);
    unsubscribe();

    expect(on).toHaveBeenCalledWith("window:state", expect.any(Function));
    expect(off).toHaveBeenCalledTimes(1);
  });
});
