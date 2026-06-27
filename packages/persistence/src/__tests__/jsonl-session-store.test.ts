import { mkdtemp, readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { describe, expect, it } from "vitest";
import { JsonlSessionStore } from "../jsonl-session-store";

describe("JsonlSessionStore", () => {
  it("persists turns and reloads recent context across store instances", async () => {
    const dir = await mkdtemp(join(tmpdir(), "greyfield-session-"));
    const path = join(dir, "session.jsonl");
    try {
      const first = new JsonlSessionStore("session-a", path);
      await first.append({ role: "user", content: "第一轮" });
      await first.append({ role: "assistant", content: "我记得第一轮" });

      const second = new JsonlSessionStore("session-a", path);
      await second.append({ role: "user", content: "第二轮" });

      expect(await second.getRecent(2)).toMatchObject([
        { id: "session-a-2", role: "assistant", content: "我记得第一轮" },
        { id: "session-a-3", role: "user", content: "第二轮" }
      ]);
      expect(await second.getByIds(["session-a-3", "missing-turn", "session-a-1", "session-a-3"])).toMatchObject([
        { id: "session-a-3", role: "user", content: "第二轮" },
        { id: "session-a-1", role: "user", content: "第一轮" }
      ]);
      expect((await readFile(path, "utf8")).trim().split(/\r?\n/)).toHaveLength(3);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});
