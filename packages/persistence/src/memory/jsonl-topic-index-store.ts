import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import type { TopicIndex } from "@greyfield/core-runtime";

export type AppendTopicIndex = TopicIndex | Omit<TopicIndex, 'id'>;

export class JsonlTopicIndexStore {
  private sequence = 0;
  private mutation = Promise.resolve();

  constructor(private readonly path: string) {}

  async append(topic: AppendTopicIndex): Promise<TopicIndex> {
    return this.serializeMutation(async () => {
      const current = await this.readTopics();
      this.sequence = Math.max(this.sequence, ...current.map(t => this.parseSequence(t.id)));
      this.sequence += 1;

      const stored: TopicIndex = {
        ...topic,
        id: "id" in topic ? topic.id : `topic-${this.sequence}`
      };

      await this.writeTopics([...current, stored]);
      return stored;
    });
  }

  async getBySession(sessionId: string): Promise<TopicIndex[]> {
    const topics = await this.readConsistentTopics();
    return topics.filter(t => t.sessionId === sessionId);
  }

  async search(keywords: string[]): Promise<TopicIndex[]> {
    const topics = await this.readConsistentTopics();
    const keywordsLower = keywords.map(kw => kw.toLowerCase());

    return topics
      .filter(t =>
        keywordsLower.some(kw =>
          t.keywords.some(tk => tk.toLowerCase().includes(kw))
        )
      )
      .sort((a, b) => b.mentionCount - a.mentionCount);
  }

  async update(id: string, updates: Partial<TopicIndex>): Promise<TopicIndex | null> {
    return this.serializeMutation(async () => {
      const current = await this.readTopics();
      let updated: TopicIndex | null = null;

      const next = current.map(topic => {
        if (topic.id !== id) {
          return topic;
        }
        updated = { ...topic, ...updates };
        return updated;
      });

      if (!updated) {
        return null;
      }

      await this.writeTopics(next);
      return updated;
    });
  }

  async delete(id: string): Promise<boolean> {
    return this.serializeMutation(async () => {
      const current = await this.readTopics();
      const next = current.filter(t => t.id !== id);

      if (next.length === current.length) {
        return false;
      }

      await this.writeTopics(next);
      return true;
    });
  }

  private async readTopics(): Promise<TopicIndex[]> {
    try {
      const raw = await readFile(this.path, 'utf8');
      return raw
        .split(/\r?\n/)
        .filter(Boolean)
        .map(line => this.parseTopicLine(line));
    } catch (error: any) {
      if (error?.code === 'ENOENT') {
        return [];
      }
      throw error;
    }
  }

  private parseTopicLine(line: string): TopicIndex {
    const parsed = JSON.parse(line);
    return {
      ...parsed,
      timeRange: [new Date(parsed.timeRange[0]), new Date(parsed.timeRange[1])],
      lastMentioned: new Date(parsed.lastMentioned)
    };
  }

  private async writeTopics(topics: TopicIndex[]): Promise<void> {
    await mkdir(dirname(this.path), { recursive: true });
    const body = topics.map(t => JSON.stringify({
      ...t,
      timeRange: [t.timeRange[0].toISOString(), t.timeRange[1].toISOString()],
      lastMentioned: t.lastMentioned.toISOString()
    })).join('\n');
    const tempPath = `${this.path}.${process.pid}.${Date.now()}.tmp`;
    await writeFile(tempPath, body.length > 0 ? `${body}\n` : '', 'utf8');
    await rename(tempPath, this.path);
  }

  private async readConsistentTopics(): Promise<TopicIndex[]> {
    await this.mutation;
    return this.readTopics();
  }

  private parseSequence(id: string): number {
    const match = /^topic-(\d+)$/.exec(id);
    return match ? Number(match[1]) : 0;
  }

  private async serializeMutation<T>(work: () => Promise<T>): Promise<T> {
    const previous = this.mutation;
    let release!: () => void;
    this.mutation = new Promise<void>((resolve) => {
      release = resolve;
    });
    await previous;
    try {
      return await work();
    } finally {
      release();
    }
  }
}
