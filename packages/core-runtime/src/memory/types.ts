// Memory System Types - Three Layer Architecture

// Layer 1: Raw Conversation (reuse existing SessionTurn)
export interface ConversationTurn {
  id: string;
  sessionId: string;
  characterId: string;
  role: 'user' | 'assistant';
  text: string;
  content?: string;
  timestamp: Date | number;
}

// Layer 2: Topic Index
export interface TopicIndex {
  id: string;
  sessionId: string;
  characterId: string;
  topic: string;
  keywords: string[];
  timeRange: [Date, Date];
  turnIds: string[];
  mentionCount: number;
  lastMentioned: Date;
  /**
   * Set after the topic is successfully promoted to a core memory. Written
   * only on success, so failed promotions stay retryable and successful
   * ones stay idempotent.
   */
  coreMemoryId?: string;
}

// Layer 3: Core Memory
export interface CoreMemory {
  id: string;
  sessionId: string;
  characterId: string;
  text: string;
  embedding: number[];
  strength: number;
  createdAt: Date;
  lastRecalledAt?: Date;
  triggers?: {
    keywords?: string[];
    dates?: string[];
    contexts?: string[];
  };
  sources: {
    turnIds: string[];
    topicIds?: string[];
  };
  disabled: boolean;
  similarity?: number;
}

// Store interfaces
export interface TopicIndexStore {
  append(topic: Omit<TopicIndex, "id">): Promise<TopicIndex>;
  getBySession(sessionId: string): Promise<TopicIndex[]>;
  search(keywords: string[]): Promise<TopicIndex[]>;
  update(id: string, updates: Partial<TopicIndex>): Promise<TopicIndex | null>;
}

export interface CoreMemoryStore {
  insert(memory: Omit<CoreMemory, "id" | "createdAt" | "sources" | "disabled"> & Partial<CoreMemory>): Promise<void>;
  update(id: string, updates: Partial<CoreMemory>): Promise<void>;
  get(id: string): Promise<CoreMemory | null>;
  getBySession(sessionId: string): Promise<CoreMemory[]>;
  vectorSearch(query: number[] | string, topK: number): Promise<CoreMemory[]>;
  close(): void;
}
