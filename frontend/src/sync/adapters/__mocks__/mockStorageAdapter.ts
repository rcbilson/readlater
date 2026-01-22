// Mock storage adapter for testing

import { StoragePort } from '../../ports/storagePort';
import { LocalArticle, SyncQueueItem } from '../../types';
import { canonicalizeUrl } from '../../core/urlCanonicalizer';

export interface MockStorageState {
  articles: Map<string, LocalArticle>;
  syncQueue: SyncQueueItem[];
  lastSyncTimestamp: string;
  nextId: number;
}

export class MockStorageAdapter implements StoragePort {
  private state: MockStorageState;

  constructor(initialState: Partial<MockStorageState> = {}) {
    this.state = {
      articles: new Map(),
      syncQueue: [],
      lastSyncTimestamp: '1970-01-01T00:00:00Z',
      nextId: 1,
      ...initialState,
    };
  }

  // Test helpers
  getState(): MockStorageState {
    return { ...this.state };
  }

  reset(): void {
    this.state = {
      articles: new Map(),
      syncQueue: [],
      lastSyncTimestamp: '1970-01-01T00:00:00Z',
      nextId: 1,
    };
  }

  setArticle(article: LocalArticle): void {
    this.state.articles.set(article.url, { ...article });
  }

  // StoragePort implementation
  async getArticle(url: string): Promise<LocalArticle | undefined> {
    return this.state.articles.get(url);
  }

  async getArticleByCanonicalUrl(canonicalUrl: string): Promise<LocalArticle | undefined> {
    // First try exact match
    const exact = this.state.articles.get(canonicalUrl);
    if (exact) return exact;

    // Search for articles where the canonical form matches
    for (const article of this.state.articles.values()) {
      if (canonicalizeUrl(article.url) === canonicalUrl) {
        return article;
      }
    }
    return undefined;
  }

  async storeArticle(article: LocalArticle): Promise<void> {
    this.state.articles.set(article.url, { ...article });
  }

  async hasArticle(url: string): Promise<boolean> {
    return this.state.articles.has(url);
  }

  async getRecentArticles(count: number): Promise<LocalArticle[]> {
    return Array.from(this.state.articles.values())
      .filter((a) => !a.archived)
      .sort((a, b) => {
        const aTime = a.lastAccess || a.downloadedAt;
        const bTime = b.lastAccess || b.downloadedAt;
        return bTime - aTime;
      })
      .slice(0, count);
  }

  async getArchivedArticles(count: number): Promise<LocalArticle[]> {
    return Array.from(this.state.articles.values())
      .filter((a) => a.archived)
      .sort((a, b) => b.downloadedAt - a.downloadedAt)
      .slice(0, count);
  }

  async getAllArticles(): Promise<LocalArticle[]> {
    return Array.from(this.state.articles.values()).sort(
      (a, b) => b.downloadedAt - a.downloadedAt
    );
  }

  async storeArticles(articles: LocalArticle[]): Promise<void> {
    for (const article of articles) {
      this.state.articles.set(article.url, { ...article });
    }
  }

  async markArticleRead(url: string, unread: boolean): Promise<void> {
    const article = this.state.articles.get(url);
    if (article) {
      article.unread = unread;
    }
  }

  async setArticleArchive(url: string, archived: boolean): Promise<void> {
    const article = this.state.articles.get(url);
    if (article) {
      article.archived = archived;
    }
  }

  async addToSyncQueue(
    item: Omit<SyncQueueItem, 'id' | 'timestamp' | 'retryCount'>
  ): Promise<number> {
    const id = this.state.nextId++;
    this.state.syncQueue.push({
      ...item,
      id,
      timestamp: Date.now(),
      retryCount: 0,
    });
    return id;
  }

  async getPendingSyncItems(): Promise<SyncQueueItem[]> {
    return [...this.state.syncQueue].sort((a, b) => a.timestamp - b.timestamp);
  }

  async removeSyncItem(id: number): Promise<void> {
    this.state.syncQueue = this.state.syncQueue.filter((item) => item.id !== id);
  }

  async incrementSyncRetry(id: number): Promise<void> {
    const item = this.state.syncQueue.find((i) => i.id === id);
    if (item) {
      item.retryCount++;
    }
  }

  async clearSyncQueue(): Promise<void> {
    this.state.syncQueue = [];
  }

  async getLastSyncTimestamp(): Promise<string> {
    return this.state.lastSyncTimestamp;
  }

  async updateLastSyncTimestamp(timestamp?: string): Promise<void> {
    this.state.lastSyncTimestamp = timestamp || new Date().toISOString();
  }

  async searchArticles(query: string, limit: number = 50): Promise<LocalArticle[]> {
    const lowerQuery = query.toLowerCase();
    return Array.from(this.state.articles.values())
      .filter(
        (article) =>
          article.title.toLowerCase().includes(lowerQuery) ||
          article.url.toLowerCase().includes(lowerQuery) ||
          article.contents?.toLowerCase().includes(lowerQuery)
      )
      .slice(0, limit);
  }

  async transaction<T>(_mode: 'r' | 'rw', fn: () => Promise<T>): Promise<T> {
    // Mock implementation - just run the function
    return fn();
  }

  async clearAllData(): Promise<void> {
    this.reset();
  }
}

// Factory function for tests
export function createMockStorageAdapter(
  initialState: Partial<MockStorageState> = {}
): MockStorageAdapter {
  return new MockStorageAdapter(initialState);
}
