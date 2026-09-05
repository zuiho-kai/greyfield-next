import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, it, vi } from "vitest";
import { withDesktopNoteTool } from "../desktop-tools";
import { createNekoResearchToolsFactory } from "../research-runtime";

it("registers and executes the note without a research model, leaving research tools unchanged", async () => {
  const root = await mkdtemp(join(tmpdir(), "greyfield-native-note-"));
  try {
    const fetch = vi.fn<typeof globalThis.fetch>();
    const research = createNekoResearchToolsFactory({ profilePath: join(root, "chrome"), getConfig: () => undefined, fetch, emit: () => {} })();
    const tools = withDesktopNoteTool(research, { documentsPath: root, openInNotepad: async () => {} });
    expect(research.definitions.map((tool) => tool.name)).toEqual(["research_web"]);
    expect(tools.definitions.map((tool) => tool.name)).toEqual(["research_web", "create_desktop_note"]);
    const result = await tools.execute("create_desktop_note", { title: "本地笔记", content: "无需模型服务。" }, new AbortController().signal);
    expect(JSON.parse(result.text)).toMatchObject({ status: "saved_launch_requested", content: "无需模型服务。" });
    expect(result.sources).toEqual([]);
    expect(fetch).not.toHaveBeenCalled();
    await expect(tools.execute("research_web", { question: "Research" }, new AbortController().signal)).rejects.toThrow("请先在设置中配置");
  } finally { await rm(root, { recursive: true, force: true }); }
});
