import { describe, expect, it } from "vitest";
import { InMemorySessionStore } from "../session-store";

describe("InMemorySessionStore", () => {
  it("keeps recent turns capped to the requested count", async () => {
    const store = new InMemorySessionStore("session-a");

    for (let index = 0; index < 25; index += 1) {
      await store.append({
        role: index % 2 === 0 ? "user" : "assistant",
        content: `turn ${index}`
      });
    }

    expect(await store.getRecent(4)).toMatchObject([
      { content: "turn 21" },
      { content: "turn 22" },
      { content: "turn 23" },
      { content: "turn 24" }
    ]);
  });

  it("creates a compact handoff from recent context", async () => {
    const store = new InMemorySessionStore("session-a");

    await store.append({ role: "user", content: "先加载 Live2D。" });
    await store.append({ role: "assistant", content: "然后接上 fake provider。" });

    const handoff = await store.createHandoff(2);

    expect(handoff.sessionId).toBe("session-a");
    expect(handoff.summary).toContain("先加载 Live2D");
    expect(handoff.summary).toContain("fake provider");
  });

  it("looks up raw turns by source turn id in request order", async () => {
    const store = new InMemorySessionStore("session-a");

    await store.append({ role: "user", content: "第一轮" });
    await store.append({ role: "assistant", content: "第二轮" });

    expect(await store.getByIds(["session-a-2", "missing-turn", "session-a-1", "session-a-2"])).toMatchObject([
      { id: "session-a-2", content: "第二轮" },
      { id: "session-a-1", content: "第一轮" }
    ]);
  });
});
