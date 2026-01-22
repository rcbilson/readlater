// Storage port interface - abstraction over IndexedDB/Dexie

import { LocalArticle, SyncQueueItem, SyncOperation } from '../types';

export interface StoragePort {
  // Article operations
  getArticle(url: string): Promise<LocalArticle | undefined>;
  getArticleByCanonicalUrl(canonicalUrl: string): Promise<LocalArticle | undefined>;
  storeArticle(article: LocalArticle): Promise<void>;
  hasArticle(url: string): Promise<boolean>;
  getRecentArticles(count: number): Promise<LocalArticle[]>;
  getArchivedArticles(count: number): Promise<LocalArticle[]>;
  getAllArticles(): Promise<LocalArticle[]>;

  // Bulk operations
  storeArticles(articles: LocalArticle[]): Promise<void>;

  // Article mutations
  markArticleRead(url: string, unread: boolean): Promise<void>;
  setArticleArchive(url: string, archived: boolean): Promise<void>;

  // Sync queue operations
  addToSyncQueue(item: Omit<SyncQueueItem, 'id' | 'timestamp' | 'retryCount'>): Promise<number>;
  getPendingSyncItems(): Promise<SyncQueueItem[]>;
  removeSyncItem(id: number): Promise<void>;
  incrementSyncRetry(id: number): Promise<void>;
  clearSyncQueue(): Promise<void>;

  // Metadata operations
  getLastSyncTimestamp(): Promise<string>;
  updateLastSyncTimestamp(timestamp?: string): Promise<void>;

  // Search
  searchArticles(query: string, limit?: number): Promise<LocalArticle[]>;

  // Transaction support
  transaction<T>(mode: 'r' | 'rw', fn: () => Promise<T>): Promise<T>;

  // Cleanup
  clearAllData(): Promise<void>;
}

/**
 * Helper to create a sync queue item
 */
export function createSyncQueueItem(
  url: string,
  operation: SyncOperation,
  data: Record<string, unknown> = {}
): Omit<SyncQueueItem, 'id' | 'timestamp' | 'retryCount'> {
  return { url, operation, data };
}
