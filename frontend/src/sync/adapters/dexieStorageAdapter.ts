// Dexie storage adapter - implements StoragePort using Dexie/IndexedDB

import Dexie, { type EntityTable } from 'dexie';
import { StoragePort } from '../ports/storagePort';
import { LocalArticle, SyncQueueItem } from '../types';
import { canonicalizeUrl } from '../core/urlCanonicalizer';

// Sync metadata interface
interface SyncMetadata {
  key: string;
  value: string | number;
}

// Define the database schema
class SyncDatabase extends Dexie {
  articles!: EntityTable<LocalArticle, 'url'>;
  syncQueue!: EntityTable<SyncQueueItem, 'id'>;
  metadata!: EntityTable<SyncMetadata, 'key'>;

  constructor() {
    super('ReadLaterDB');

    this.version(1).stores({
      articles: 'url, title, unread, archived, downloadedAt, lastAccess',
      syncQueue: '++id, url, operation, timestamp',
      metadata: 'key',
    });
  }
}

export class DexieStorageAdapter implements StoragePort {
  private db: SyncDatabase;

  constructor(db?: SyncDatabase) {
    this.db = db || new SyncDatabase();
  }

  async getArticle(url: string): Promise<LocalArticle | undefined> {
    return this.db.articles.get(url);
  }

  async getArticleByCanonicalUrl(canonicalUrl: string): Promise<LocalArticle | undefined> {
    // First try exact match
    const exact = await this.db.articles.get(canonicalUrl);
    if (exact) return exact;

    // Search for articles where the canonical form matches
    const allArticles = await this.db.articles.toArray();
    return allArticles.find(
      (article) => canonicalizeUrl(article.url) === canonicalUrl
    );
  }

  async storeArticle(article: LocalArticle): Promise<void> {
    await this.db.articles.put(article);
  }

  async hasArticle(url: string): Promise<boolean> {
    const count = await this.db.articles.where('url').equals(url).count();
    return count > 0;
  }

  async getRecentArticles(count: number): Promise<LocalArticle[]> {
    const allArticles = await this.db.articles.toArray();

    return allArticles
      .filter((article) => !article.archived)
      .sort((a, b) => {
        const aTime = a.lastAccess || a.downloadedAt;
        const bTime = b.lastAccess || b.downloadedAt;
        return bTime - aTime;
      })
      .slice(0, count);
  }

  async getArchivedArticles(count: number): Promise<LocalArticle[]> {
    const allArticles = await this.db.articles
      .orderBy('downloadedAt')
      .reverse()
      .toArray();

    return allArticles.filter((article) => article.archived).slice(0, count);
  }

  async getAllArticles(): Promise<LocalArticle[]> {
    return this.db.articles.orderBy('downloadedAt').reverse().toArray();
  }

  async storeArticles(articles: LocalArticle[]): Promise<void> {
    await this.db.articles.bulkPut(articles);
  }

  async markArticleRead(url: string, unread: boolean): Promise<void> {
    await this.db.articles.where('url').equals(url).modify({ unread });
  }

  async setArticleArchive(url: string, archived: boolean): Promise<void> {
    await this.db.articles.where('url').equals(url).modify({ archived });
  }

  async addToSyncQueue(
    item: Omit<SyncQueueItem, 'id' | 'timestamp' | 'retryCount'>
  ): Promise<number> {
    const id = await this.db.syncQueue.add({
      ...item,
      timestamp: Date.now(),
      retryCount: 0,
    });
    // Auto-increment always returns a number
    return id as number;
  }

  async getPendingSyncItems(): Promise<SyncQueueItem[]> {
    return this.db.syncQueue.orderBy('timestamp').toArray();
  }

  async removeSyncItem(id: number): Promise<void> {
    await this.db.syncQueue.delete(id);
  }

  async incrementSyncRetry(id: number): Promise<void> {
    await this.db.syncQueue.where('id').equals(id).modify((item) => {
      item.retryCount++;
    });
  }

  async clearSyncQueue(): Promise<void> {
    await this.db.syncQueue.clear();
  }

  async getLastSyncTimestamp(): Promise<string> {
    const metadata = await this.db.metadata.get('lastSyncTimestamp');
    return (metadata?.value as string) || '1970-01-01T00:00:00Z';
  }

  async updateLastSyncTimestamp(timestamp?: string): Promise<void> {
    await this.db.metadata.put({
      key: 'lastSyncTimestamp',
      value: timestamp || new Date().toISOString(),
    });
  }

  async searchArticles(query: string): Promise<LocalArticle[]> {
    const lowerQuery = query.toLowerCase();
    const allArticles = await this.db.articles.toArray();

    return allArticles.filter(
      (article) =>
        article.title.toLowerCase().includes(lowerQuery) ||
        article.url.toLowerCase().includes(lowerQuery) ||
        article.contents?.toLowerCase().includes(lowerQuery)
    );
  }

  async transaction<T>(mode: 'r' | 'rw', fn: () => Promise<T>): Promise<T> {
    const tables =
      mode === 'rw'
        ? [this.db.articles, this.db.syncQueue, this.db.metadata]
        : [this.db.articles];

    return this.db.transaction(mode, tables, fn);
  }

  async clearAllData(): Promise<void> {
    await this.db.transaction(
      'rw',
      [this.db.articles, this.db.syncQueue, this.db.metadata],
      async () => {
        await this.db.articles.clear();
        await this.db.syncQueue.clear();
        await this.db.metadata.clear();
      }
    );
  }
}

// Default singleton instance
let defaultAdapter: DexieStorageAdapter | null = null;

export function getStorageAdapter(): DexieStorageAdapter {
  if (!defaultAdapter) {
    defaultAdapter = new DexieStorageAdapter();
  }
  return defaultAdapter;
}
