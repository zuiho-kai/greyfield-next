import { randomUUID } from "node:crypto";
import { mkdir, open, readFile, unlink } from "node:fs/promises";
import { join } from "node:path";

export interface DesktopNoteResult {
  status: "saved_launch_requested" | "saved_open_failed";
  path: string;
  title: string;
  content: string;
  message: string;
}

/** The host supplies Documents and one explicit application launcher, never a shell command. */
export function createDesktopNoteWriter(options: {
  documentsPath: string;
  openInNotepad(path: string, signal: AbortSignal): Promise<void>;
}) {
  return async (input: unknown, signal: AbortSignal): Promise<DesktopNoteResult> => {
    signal.throwIfAborted();
    const { title, content } = (input ?? {}) as { title?: unknown; content?: unknown };
    if (typeof title !== "string" || !title.trim() || typeof content !== "string" || !content.trim()) throw new Error("请提供笔记标题和正文。");
    const directory = join(options.documentsPath, "Greyfield Notes");
    const stem = title.trim().replace(/[<>:"/\\|?*\x00-\x1f]/g, "_").replace(/[. ]+$/g, "").slice(0, 64) || "笔记";
    const path = join(directory, `${stem}-${randomUUID()}.txt`);
    // BOM makes UTF-8 Chinese deterministic in classic Windows Notepad too.
    const text = `\uFEFF${title.trim()}\r\n\r\n${content.replace(/\r?\n/g, "\r\n")}\r\n`;
    await mkdir(directory, { recursive: true });
    signal.throwIfAborted();
    const file = await open(path, "wx");
    try {
      signal.throwIfAborted();
      await file.writeFile(text, "utf8");
    } catch (error) {
      await file.close();
      await unlink(path).catch(() => {});
      throw error;
    }
    await file.close();
    // Stop does not undo an already-written note, but must prevent its launch.
    signal.throwIfAborted();
    if (await readFile(path, "utf8") !== text) throw new Error(`笔记读回校验失败，未打开记事本：${path}`);
    signal.throwIfAborted();
    const saved = { path, title: title.trim(), content };
    try {
      await options.openInNotepad(path, signal);
      signal.throwIfAborted();
      return { ...saved, status: "saved_launch_requested", message: `笔记已保存，已请求记事本打开：${path}` };
    } catch (error) {
      signal.throwIfAborted();
      return { ...saved, status: "saved_open_failed", message: `笔记已保存，但未能启动记事本：${path}。${error instanceof Error ? error.message : String(error)}` };
    }
  };
}
