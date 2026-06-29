import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { MemoryAtom } from "@greyfield/core-runtime";
import { describe, expect, it } from "vitest";
import { JsonlMemoryAtomStore } from "../jsonl-memory-atom-store";
import { JsonlDeletedMemoryEvidenceStore } from "../jsonl-deleted-memory-evidence-store";

describe("JsonlMemoryAtomStore", () => {
  it("persists, upserts, updates, dedupes, deletes, and preserves source turn ids", async () => {
    const dir = await mkdtemp(join(tmpdir(), "greyfield-memory-atoms-"));
    const atomPath = join(dir, "atoms.jsonl");
    try {
      const store = new JsonlMemoryAtomStore(atomPath);

      const first = await store.append(
        makeAtom({
          sourceTurnIds: ["turn-1"],
          createdAt: "2026-06-26T01:00:00.000Z"
        })
      );

      expect(first.sourceTurnIds).toEqual(["turn-1"]);
      expect(first.triggerKeys).toEqual(["hiyori", "model", "live2d"]);

      const upserted = await store.upsert(
        makeAtom({
          id: first.id,
          text: "User prefers Hiyori and Natori models.",
          sourceTurnIds: ["turn-1", "turn-2", "turn-2"],
          createdAt: "2026-06-26T01:00:10.000Z",
          updatedAt: "2026-06-26T01:00:11.000Z",
          triggers: {
            exact: ["Hiyori", "Natori"],
            aliases: ["model"],
            secondary: ["Live2D"]
          }
        })
      );

      expect(upserted).toMatchObject({
        id: first.id,
        text: "User prefers Hiyori and Natori models.",
        sourceTurnIds: ["turn-1", "turn-2"],
        createdAt: "2026-06-26T01:00:00.000Z",
        updatedAt: "2026-06-26T01:00:11.000Z"
      });
      expect(upserted.triggerKeys).toEqual(["hiyori", "natori", "model", "live2d"]);
      expect(await store.list("thread-a")).toEqual([upserted]);

      const rawLines = (await readFile(atomPath, "utf8")).trim().split(/\r?\n/);
      expect(rawLines).toHaveLength(1);

      const reloaded = new JsonlMemoryAtomStore(atomPath);
      expect(await reloaded.list("thread-a")).toEqual([upserted]);

      const patched = await reloaded.update(first.id, {
        disabled: true,
        importance: 0.9,
        sourceTurnIds: ["turn-1", "turn-2", "turn-3", "turn-3"],
        object: "natori",
        triggers: {
          aliases: ["Natori", "natori"]
        },
        metadata: {
          preferenceType: "live2d_model",
          corrected: true
        },
        updatedAt: "2026-06-26T01:00:20.000Z"
      });

      expect(patched).toMatchObject({
        id: first.id,
        disabled: true,
        importance: 0.9,
        sourceTurnIds: ["turn-1", "turn-2", "turn-3"],
        object: "natori",
        updatedAt: "2026-06-26T01:00:20.000Z",
        triggers: {
          exact: ["hiyori", "natori"],
          aliases: ["natori"],
          secondary: ["live2d"]
        },
        metadata: {
          preferenceType: "live2d_model",
          corrected: true
        }
      });
      expect(patched?.triggerKeys).toEqual(["hiyori", "natori", "live2d"]);
      expect(await reloaded.update("missing-atom", { disabled: false })).toBeNull();

      await reloaded.append(
        makeAtom({
          id: "atom-thread-b",
          threadId: "thread-b",
          sourceTurnIds: ["turn-b"],
          createdAt: "2026-06-26T01:01:00.000Z"
        })
      );
      expect(await reloaded.delete(first.id)).toBe(true);
      expect(await reloaded.delete(first.id)).toBe(false);
      expect(await reloaded.list("thread-a")).toEqual([]);
      expect(await reloaded.clear("thread-b")).toBe(1);
      expect(await reloaded.list("thread-b")).toEqual([]);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("clears all persisted atoms when no thread id is provided", async () => {
    const dir = await mkdtemp(join(tmpdir(), "greyfield-memory-atoms-clear-"));
    const atomPath = join(dir, "atoms.jsonl");
    try {
      const store = new JsonlMemoryAtomStore(atomPath);
      await store.append(makeAtom({ id: "atom-a", threadId: "thread-a", sourceTurnIds: ["turn-a"] }));
      await store.append(makeAtom({ id: "atom-b", threadId: "thread-b", sourceTurnIds: ["turn-b"] }));

      expect(await store.clear()).toBe(2);
      expect(await store.list("thread-a")).toEqual([]);
      expect(await store.list("thread-b")).toEqual([]);
      expect(await readFile(atomPath, "utf8")).toBe("");
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});

describe("JsonlDeletedMemoryEvidenceStore", () => {
  it("persists deleted evidence tombstones without raw source text", async () => {
    const dir = await mkdtemp(join(tmpdir(), "greyfield-deleted-evidence-"));
    try {
      const path = join(dir, "deleted-evidence.jsonl");
      const store = new JsonlDeletedMemoryEvidenceStore(path);

      const stored = await store.append({
        threadId: "thread-a",
        kind: "memory-atom",
        memoryId: "atom-hiyori",
        sourceSessionId: "session-a",
        sourceTurnIds: [" turn-a ", "turn-a", "turn-b"],
        deletedAt: "2026-06-29T00:00:00.000Z"
      });

      expect(stored).toMatchObject({
        threadId: "thread-a",
        kind: "memory-atom",
        memoryId: "atom-hiyori",
        sourceSessionId: "session-a",
        sourceTurnIds: ["turn-a", "turn-b"],
        deletedAt: "2026-06-29T00:00:00.000Z"
      });
      await expect(new JsonlDeletedMemoryEvidenceStore(path).list("thread-a")).resolves.toEqual([stored]);
      expect(await readFile(path, "utf8")).not.toContain("Hiyori source raw text");
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});

function makeAtom(overrides: Partial<MemoryAtom> = {}): MemoryAtom {
  return {
    id: "atom-preference-hiyori",
    threadId: "thread-a",
    type: "preference",
    text: "User prefers the Hiyori model.",
    sourceTurnIds: ["turn-1"],
    createdAt: "2026-06-26T01:00:00.000Z",
    importance: 0.8,
    triggerKeys: ["hiyori", "model", "live2d"],
    triggers: {
      exact: ["Hiyori"],
      aliases: ["model"],
      secondary: ["Live2D"]
    },
    metadata: {
      preferenceType: "live2d_model"
    },
    ...overrides
  };
}
