import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { NekoPlugin, type NekoPluginEvent } from "../index";

describe("N.E.K.O plugin lifecycle", () => {
  it("reports a missing install as an error and can be disabled without late error state", async () => {
    const root = await mkdtemp(join(tmpdir(), "greyfield-neko-lifecycle-"));
    try {
      const events: NekoPluginEvent[] = [];
      const plugin = new NekoPlugin({ root, emit: (event) => events.push(event) });
      expect(plugin.getState().status).toBe("not-installed");
      await plugin.start();
      expect(plugin.getState().status).toBe("error");
      expect(plugin.getState().message).toContain("先安装");
      await plugin.stop();
      expect(plugin.getState().status).toBe("not-installed");
      expect(events.at(-1)).toMatchObject({ type: "state", state: { status: "not-installed" } });
    } finally { await rm(root, { recursive: true, force: true }); }
  });
});
