import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import type { ChatMessage, ChatMessageContent, MemoryStore } from "@greyfield/core-runtime";

export class MarkdownMemoryStore implements MemoryStore {
  constructor(private readonly path: string) {}

  async load(): Promise<string> {
    try {
      return await readFile(this.path, "utf8");
    } catch (error) {
      if (isNotFoundError(error)) {
        return "";
      }
      throw error;
    }
  }

  async save(memory: string): Promise<void> {
    await mkdir(dirname(this.path), { recursive: true });
    await writeFile(this.path, memory.endsWith("\n") ? memory : `${memory}\n`, "utf8");
  }

  async consolidate(messages: ChatMessage[]): Promise<string> {
    const current = await this.load();
    const recent = messages
      .filter((message) => message.role === "user" || message.role === "assistant")
      .slice(-6)
      .map((message) => `- ${message.role}: ${chatContentToText(message.content)}`)
      .join("\n");
    return [current.trim(), recent].filter(Boolean).join("\n");
  }
}

function chatContentToText(content: ChatMessageContent): string {
  if (typeof content === "string") {
    return content;
  }
  return content
    .flatMap((part) => (part.type === "text" ? [part.text] : []))
    .join(" ")
    .trim();
}

function isNotFoundError(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && error.code === "ENOENT";
}
