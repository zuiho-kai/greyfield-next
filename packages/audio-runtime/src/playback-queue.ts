export interface PlaybackItem {
  text: string;
  audio: Uint8Array;
}

export class SpeechPlaybackQueue {
  private readonly items: PlaybackItem[] = [];

  enqueue(item: PlaybackItem): void {
    this.items.push(item);
  }

  dequeue(): PlaybackItem | undefined {
    return this.items.shift();
  }

  clear(): void {
    this.items.length = 0;
  }

  get size(): number {
    return this.items.length;
  }
}
