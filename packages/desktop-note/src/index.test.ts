import { mkdtemp, readFile, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, expect, it, vi } from "vitest";
import { createDesktopNoteWriter } from "./index";

vi.mock("node:fs/promises", async (original) => {
  const fs = await original<typeof import("node:fs/promises")>();
  return { ...fs, readFile: vi.fn(fs.readFile) };
});
const roots: string[] = [];
afterEach(async () => { vi.restoreAllMocks(); for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true }); });
async function setup(openInNotepad = vi.fn(async (_path: string, _signal: AbortSignal) => {})) {
  const root = await mkdtemp(join(tmpdir(), "greyfield-note-")); roots.push(root);
  return { root, openInNotepad, write: createDesktopNoteWriter({ documentsPath: root, openInNotepad }) };
}
const input = { title: "贾维斯验收", content: "明天上午十点检查语音延迟，然后整理桌面助手的待办事项。" };

it("writes verified Chinese UTF-8 notes without overwriting an earlier title", async () => {
  const { root, write, openInNotepad } = await setup();
  const first = await write(input, new AbortController().signal);
  const second = await write({ ...input, content: "第二份笔记。" }, new AbortController().signal);
  expect(first.status).toBe("saved_launch_requested");
  expect(dirname(first.path)).toBe(join(root, "Greyfield Notes"));
  expect(first.path).toMatch(/\.txt$/);
  expect(first.path).not.toBe(second.path);
  expect(await readFile(first.path, "utf8")).toContain(input.content);
  expect(openInNotepad.mock.calls.map(([path]) => path)).toEqual([first.path, second.path]);
});

it("reports a saved file separately from failure to launch Notepad", async () => {
  const { write } = await setup(vi.fn(async () => { throw new Error("Notepad unavailable"); }));
  const result = await write(input, new AbortController().signal);
  expect(result.status).toBe("saved_open_failed");
  expect(result.message).toContain("已保存，但未能启动记事本");
  expect(await readFile(result.path, "utf8")).toContain(input.content);
});

it("does not create a file or launch when cancelled before starting", async () => {
  const { root, write, openInNotepad } = await setup();
  const controller = new AbortController(); controller.abort();
  await expect(write(input, controller.signal)).rejects.toThrow();
  expect(await readdir(root)).toEqual([]);
  expect(openInNotepad).not.toHaveBeenCalled();
});

it("keeps an already-saved note but does not launch after Stop during verification", async () => {
  const { root, write, openInNotepad } = await setup();
  const controller = new AbortController();
  const original = await vi.importActual<typeof import("node:fs/promises")>("node:fs/promises");
  vi.mocked(readFile).mockImplementationOnce(async (path, options) => {
    const text = await original.readFile(path, options); controller.abort(); return text;
  });
  await expect(write(input, controller.signal)).rejects.toThrow();
  expect(await readdir(join(root, "Greyfield Notes"))).toHaveLength(1);
  expect(openInNotepad).not.toHaveBeenCalled();
});
