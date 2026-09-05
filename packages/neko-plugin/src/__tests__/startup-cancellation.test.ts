import { spawn } from "node:child_process";
import { mkdir } from "node:fs/promises";
import { afterEach, describe, expect, it, vi } from "vitest";
import { NEKO_REVISION, NekoPlugin } from "../index";

vi.mock("node:child_process", () => ({ spawn: vi.fn() }));
vi.mock("node:fs", () => ({ existsSync: () => true }));
vi.mock("node:fs/promises", () => ({ mkdir: vi.fn(), appendFile: vi.fn(), writeFile: vi.fn() }));

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => { resolve = done; });
  return { promise, resolve };
}

describe("N.E.K.O startup cancellation", () => {
  afterEach(() => { vi.restoreAllMocks(); vi.clearAllMocks(); vi.unstubAllGlobals(); });

  it.each(["cleanup", "data directory"])("Stop during %s prevents all later launches and connections", async (phase) => {
    const paused = deferred();
    const entered = deferred();
    const plugin = new NekoPlugin({ root: "unused-cancelled-runtime", emit: () => undefined });
    const internals = plugin as unknown as { cleanup(): Promise<void>; command(): Promise<string> };
    const commands = vi.spyOn(internals, "command").mockResolvedValue(NEKO_REVISION);
    const socket = Object.assign(vi.fn(), { OPEN: 1 });
    vi.stubGlobal("WebSocket", socket);
    const pause = () => { entered.resolve(); return paused.promise; };
    if (phase === "cleanup") vi.spyOn(internals, "cleanup").mockImplementationOnce(pause);
    else vi.mocked(mkdir).mockImplementationOnce(async () => { await pause(); return undefined; });

    const starting = plugin.start();
    await entered.promise;
    await plugin.stop();
    expect(plugin.getState().status).toBe("stopped");
    paused.resolve();
    await starting;

    expect(commands).toHaveBeenCalledTimes(phase === "cleanup" ? 0 : 2);
    expect(spawn).not.toHaveBeenCalled();
    expect(socket).not.toHaveBeenCalled();
    expect(plugin.getState().status).toBe("stopped");
  });
});
