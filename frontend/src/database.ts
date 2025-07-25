import Dexie, { type EntityTable } from 'dexie';
import { Article } from './Article';

// Local article entry with sync metadata
export interface LocalArticle {
  url: string;
  title: string;
  contents?: string;
  hasBody: boolean;
  unread: boolean;
  archived: boolean;
  downloadedAt: number;
  lastAccess?: number; // When the article was last accessed/read
  lastModified?: string;
  lastKnownServerState?: LocalArticle; // For conflict resolution
}

// Sync queue entry for pending operations
export interface SyncQueueItem {
  id?: number;
  url: string;
  operation: 'markRead' | 'setArchive' | 'download';
  data: Record<string, unknown>;
  timestamp: number;
  retryCount: number;
}

// Sync metadata for tracking last sync times
export interface SyncMetadata {
  key: string;
  value: string | number;
}

// Define the database schema with Dexie
class ReadLaterDatabase extends Dexie {
  // Tables
  articles!: EntityTable<LocalArticle, 'url'>;
  syncQueue!: EntityTable<SyncQueueItem, 'id'>;
  metadata!: EntityTable<SyncMetadata, 'key'>;

  constructor() {
    super('ReadLaterDB');
    
    this.version(1).stores({
      articles: 'url, title, unread, archived, downloadedAt, lastAccess, lastModified',
      syncQueue: '++id, url, operation, timestamp',
      metadata: 'key'
    });
  }
}

// Create database instance
export const db = new ReadLaterDatabase();

// Helper functions for common operations

// Get the last sync timestamp
export const getLastSyncTimestamp = async (): Promise<string> => {
  const metadata = await db.metadata.get('lastSyncTimestamp');
  return metadata?.value as string || '1970-01-01T00:00:00Z';
};

// Update the last sync timestamp
export const updateLastSyncTimestamp = async (): Promise<void> => {
  await db.metadata.put({
    key: 'lastSyncTimestamp',
    value: new Date().toISOString()
  });
};

// Get all articles for display
export const getAllArticles = async (): Promise<LocalArticle[]> => {
  return await db.articles.orderBy('downloadedAt').reverse().toArray();
};

// Get recent unarchived articles
export const getRecentArticles = async (count: number = 50): Promise<LocalArticle[]> => {
  const allArticles = await db.articles.toArray();
  
  return allArticles
    .filter(article => !article.archived)
    .sort((a, b) => {
      // Sort by lastAccess descending, fallback to downloadedAt if lastAccess is missing
      const aTime = a.lastAccess || a.downloadedAt;
      const bTime = b.lastAccess || b.downloadedAt;
      return bTime - aTime;
    })
    .slice(0, count);
};

// Get archived articles
export const getArchivedArticles = async (count: number = 50): Promise<LocalArticle[]> => {
  const allArticles = await db.articles
    .orderBy('downloadedAt')
    .reverse()
    .toArray();
  
  return allArticles
    .filter(article => article.archived)
    .slice(0, count);
};

// Store or update an article
export const storeArticle = async (article: LocalArticle): Promise<void> => {
  await db.articles.put(article);
};

// Get a specific article
export const getArticle = async (url: string): Promise<LocalArticle | undefined> => {
  return await db.articles.get(url);
};

// Check if article exists locally
export const hasArticle = async (url: string): Promise<boolean> => {
  const count = await db.articles.where('url').equals(url).count();
  return count > 0;
};

// Update article read status (lastAccess is handled by server sync)
export const markArticleRead = async (url: string, unread: boolean = false): Promise<void> => {
  await db.articles.where('url').equals(url).modify({ unread });
};

// Update article archive status
export const setArticleArchive = async (url: string, archived: boolean): Promise<void> => {
  await db.articles.where('url').equals(url).modify({ archived });
};

// Add item to sync queue
export const addToSyncQueue = async (item: Omit<SyncQueueItem, 'id' | 'timestamp' | 'retryCount'>): Promise<void> => {
  await db.syncQueue.add({
    ...item,
    timestamp: Date.now(),
    retryCount: 0
  });
};

// Get pending sync items
export const getPendingSyncItems = async (): Promise<SyncQueueItem[]> => {
  return await db.syncQueue.orderBy('timestamp').toArray();
};

// Remove sync item after successful sync
export const removeSyncItem = async (id: number): Promise<void> => {
  await db.syncQueue.delete(id);
};

// Increment retry count for failed sync item
export const incrementSyncRetry = async (id: number): Promise<void> => {
  await db.syncQueue.where('id').equals(id).modify(item => {
    item.retryCount++;
  });
};

// Search articles locally
export const searchArticles = async (query: string): Promise<LocalArticle[]> => {
  return await db.articles
    .where('title')
    .startsWithIgnoreCase(query)
    .toArray();
};

// Clear all local data (for testing/reset)
export const clearAllData = async (): Promise<void> => {
  await db.transaction('rw', [db.articles, db.syncQueue, db.metadata], async () => {
    await db.articles.clear();
    await db.syncQueue.clear();
    await db.metadata.clear();
  });
};

// Convert Article to LocalArticle
export const articleToLocal = (article: Article, unread: boolean = true, archived: boolean = false): LocalArticle => {
  return {
    url: article.url,
    title: article.title,
    contents: article.contents,
    hasBody: !!article.contents,
    unread,
    archived,
    downloadedAt: Date.now()
    // lastAccess will come from server sync, don't set it here
  };
};

// Convert LocalArticle to Article
export const localToArticle = (localArticle: LocalArticle): Article => {
  return {
    url: localArticle.url,
    title: localArticle.title,
    contents: localArticle.contents || '',
    rendered: localArticle.contents // Assuming rendered is same as contents for now
  };
};

export default db;