import { 
  LocalArticle, 
  getLastSyncTimestamp, 
  updateLastSyncTimestamp,
  addToSyncQueue,
  getPendingSyncItems,
  removeSyncItem,
  incrementSyncRetry,
  storeArticle,
  getArticle,
  markArticleRead,
  setArticleArchive,
  articleToLocal
} from './database';
import { Article } from './Article';

// API client for server communication
class ApiClient {
  private baseUrl: string;

  constructor(baseUrl: string = '') {
    this.baseUrl = baseUrl;
  }

  async fetchChanges(since: string): Promise<LocalArticle[]> {
    const response = await fetch(`${this.baseUrl}/api/changes?since=${encodeURIComponent(since)}`);
    if (!response.ok) {
      throw new Error(`Failed to fetch changes: ${response.statusText}`);
    }
    const data = await response.json();
    
    // Convert server response to LocalArticle format
    return data.map((item: {
      url: string;
      title: string;
      hasBody: boolean;
      unread: boolean;
      archived: boolean;
    }) => ({
      url: item.url,
      title: item.title,
      hasBody: item.hasBody,
      unread: item.unread,
      archived: item.archived,
      downloadedAt: Date.now(),
      contents: undefined // Server doesn't send full content in changes
    }));
  }

  async markRead(url: string): Promise<void> {
    const response = await fetch('/api/markRead', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url })
    });
    if (!response.ok) {
      throw new Error(`Failed to mark article as read: ${response.statusText}`);
    }
  }

  async setArchive(url: string, archived: boolean): Promise<void> {
    const response = await fetch(`/api/setArchive?url=${encodeURIComponent(url)}&setArchive=${archived}`, {
      method: 'PUT'
    });
    if (!response.ok) {
      throw new Error(`Failed to set archive status: ${response.statusText}`);
    }
  }

  async getRecents(count: number = 50): Promise<LocalArticle[]> {
    const response = await fetch(`/api/recents?count=${count}`);
    if (!response.ok) {
      throw new Error(`Failed to fetch recents: ${response.statusText}`);
    }
    const data = await response.json();
    
    return data.map((item: {
      url: string;
      title: string;
      hasBody: boolean;
      unread: boolean;
      archived: boolean;
    }) => ({
      url: item.url,
      title: item.title,
      hasBody: item.hasBody,
      unread: item.unread,
      archived: item.archived,
      downloadedAt: Date.now(),
      contents: undefined
    }));
  }

  async getArchive(count: number = 50): Promise<LocalArticle[]> {
    const response = await fetch(`/api/archive?count=${count}`);
    if (!response.ok) {
      throw new Error(`Failed to fetch archive: ${response.statusText}`);
    }
    const data = await response.json();
    
    return data.map((item: {
      url: string;
      title: string;
      hasBody: boolean;
      unread: boolean;
      archived: boolean;
    }) => ({
      url: item.url,
      title: item.title,
      hasBody: item.hasBody,
      unread: item.unread,
      archived: item.archived,
      downloadedAt: Date.now(),
      contents: undefined
    }));
  }

  async summarize(url: string, titleHint?: string): Promise<Article> {
    const response = await fetch('/api/summarize', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url, titleHint })
    });
    if (!response.ok) {
      throw new Error(`Failed to summarize article: ${response.statusText}`);
    }
    return await response.json();
  }
}

export interface SyncStatus {
  isOnline: boolean;
  isSyncing: boolean;
  lastSyncTime?: Date;
  pendingOperations: number;
  error?: string;
}

export type SyncStatusCallback = (status: SyncStatus) => void;

export class SyncManager {
  private apiClient: ApiClient;
  private syncInProgress = false;
  private statusCallbacks: Set<SyncStatusCallback> = new Set();
  private syncInterval?: number;

  constructor() {
    this.apiClient = new ApiClient();
    this.setupPeriodicSync();
  }

  // Subscribe to sync status updates
  onStatusChange(callback: SyncStatusCallback): () => void {
    this.statusCallbacks.add(callback);
    // Send initial status
    this.notifyStatusChange();
    // Return unsubscribe function
    return () => this.statusCallbacks.delete(callback);
  }

  private async notifyStatusChange() {
    const pendingItems = await getPendingSyncItems();
    const status: SyncStatus = {
      isOnline: navigator.onLine,
      isSyncing: this.syncInProgress,
      pendingOperations: pendingItems.length,
      lastSyncTime: await this.getLastSyncDate()
    };
    
    this.statusCallbacks.forEach(callback => callback(status));
  }

  private async getLastSyncDate(): Promise<Date | undefined> {
    try {
      const timestamp = await getLastSyncTimestamp();
      return timestamp !== '1970-01-01T00:00:00Z' ? new Date(timestamp) : undefined;
    } catch {
      return undefined;
    }
  }

  // Setup periodic background sync
  private setupPeriodicSync() {
    // Sync every 5 minutes when online and active
    this.syncInterval = window.setInterval(() => {
      if (navigator.onLine && !document.hidden) {
        this.performFullSync().catch(console.error);
      }
    }, 5 * 60 * 1000);

    // Sync when coming back online
    window.addEventListener('online', () => {
      this.performFullSync().catch(console.error);
    });

    // Sync when page becomes visible
    document.addEventListener('visibilitychange', () => {
      if (!document.hidden && navigator.onLine) {
        this.performFullSync().catch(console.error);
      }
    });
  }

  // Perform full bidirectional sync
  async performFullSync(): Promise<void> {
    if (this.syncInProgress || !navigator.onLine) {
      return;
    }

    this.syncInProgress = true;
    await this.notifyStatusChange();

    try {
      // 1. Sync pending local changes to server
      await this.syncToServer();
      
      // 2. Sync server changes to local
      await this.syncFromServer();
      
      // 3. Update last sync timestamp
      await updateLastSyncTimestamp();
      
    } catch (error) {
      console.error('Sync failed:', error);
      // Notify about sync error
      this.statusCallbacks.forEach(callback => 
        callback({
          isOnline: navigator.onLine,
          isSyncing: false,
          pendingOperations: 0,
          error: error instanceof Error ? error.message : 'Sync failed'
        })
      );
    } finally {
      this.syncInProgress = false;
      await this.notifyStatusChange();
    }
  }

  // Sync local changes to server
  private async syncToServer(): Promise<void> {
    const pendingItems = await getPendingSyncItems();
    
    for (const item of pendingItems) {
      try {
        switch (item.operation) {
          case 'markRead':
            await this.apiClient.markRead(item.url);
            break;
          case 'setArchive':
            await this.apiClient.setArchive(item.url, item.data.archived as boolean);
            break;
          // Note: 'download' operation is handled differently as it's server->client
        }
        
        // Remove successful item from queue
        if (item.id) {
          await removeSyncItem(item.id);
        }
      } catch (error) {
        console.error(`Failed to sync ${item.operation} for ${item.url}:`, error);
        
        // Increment retry count
        if (item.id) {
          await incrementSyncRetry(item.id);
          
          // Remove after too many failures (5 retries)
          if (item.retryCount >= 5) {
            await removeSyncItem(item.id);
          }
        }
      }
    }
  }

  // Sync server changes to local
  private async syncFromServer(): Promise<void> {
    const lastSync = await getLastSyncTimestamp();
    const serverChanges = await this.apiClient.fetchChanges(lastSync);
    
    for (const serverArticle of serverChanges) {
      await this.resolveAndMerge(serverArticle);
    }
  }

  // Three-way merge for conflict resolution
  private async resolveAndMerge(serverArticle: LocalArticle): Promise<void> {
    const localArticle = await getArticle(serverArticle.url);
    
    if (!localArticle) {
      // New server article - add it locally
      await storeArticle({
        ...serverArticle,
        downloadedAt: Date.now(),
        lastKnownServerState: serverArticle
      });
    } else {
      // Article exists locally - resolve conflicts
      // const lastKnownServer = localArticle.lastKnownServerState;
      
      // Simple last-write-wins for now
      // In a more sophisticated version, we could do field-by-field merging
      const resolvedArticle: LocalArticle = {
        ...localArticle,
        // Server wins for read/archive status if it's newer
        unread: serverArticle.unread,
        archived: serverArticle.archived,
        lastKnownServerState: serverArticle
      };
      
      await storeArticle(resolvedArticle);
    }
  }

  // Public methods for triggering operations

  async markRead(url: string): Promise<void> {
    // Optimistic update
    await markArticleRead(url, false);
    
    // Queue for server sync
    await addToSyncQueue({
      url,
      operation: 'markRead',
      data: { unread: false }
    });
    
    await this.notifyStatusChange();
    
    // Try immediate sync if online
    if (navigator.onLine) {
      this.performFullSync().catch(console.error);
    }
  }

  async setArchive(url: string, archived: boolean): Promise<void> {
    // Optimistic update
    await setArticleArchive(url, archived);
    
    // Queue for server sync
    await addToSyncQueue({
      url,
      operation: 'setArchive',
      data: { archived }
    });
    
    await this.notifyStatusChange();
    
    // Try immediate sync if online
    if (navigator.onLine) {
      this.performFullSync().catch(console.error);
    }
  }

  async downloadArticle(url: string, titleHint?: string): Promise<Article> {
    // First check if we have it locally
    const localArticle = await getArticle(url);
    if (localArticle?.contents) {
      return {
        url: localArticle.url,
        title: localArticle.title,
        contents: localArticle.contents
      };
    }
    
    // Fetch from server
    const article = await this.apiClient.summarize(url, titleHint);
    
    // Store locally
    const localVersion = articleToLocal(article, true, false);
    await storeArticle(localVersion);
    
    return article;
  }

  // Initial data load - fetches recent articles from server
  async loadInitialData(): Promise<void> {
    console.log('SyncManager: loadInitialData called, online:', navigator.onLine);
    
    if (!navigator.onLine) {
      console.log('SyncManager: Offline, skipping initial data load');
      return; // Use local data only when offline
    }
    
    try {
      console.log('SyncManager: Fetching recent articles from server...');
      const recents = await this.apiClient.getRecents(50);
      console.log('SyncManager: Received', recents.length, 'articles from server');
      
      // Store recent articles locally
      let storedCount = 0;
      for (const article of recents) {
        console.log('SyncManager: Processing article:', article.title, 'archived:', article.archived);
        const existing = await getArticle(article.url);
        if (!existing) {
          const localArticle = {
            ...article,
            downloadedAt: Date.now(),
            lastKnownServerState: article
          };
          console.log('SyncManager: Storing new article:', localArticle.title, 'archived:', localArticle.archived);
          await storeArticle(localArticle);
          storedCount++;
        }
      }
      
      console.log('SyncManager: Stored', storedCount, 'new articles locally');
      await updateLastSyncTimestamp();
      console.log('SyncManager: Initial data load completed successfully');
    } catch (error) {
      console.error('SyncManager: Failed to load initial data:', error);
    }
  }

  // Cleanup
  destroy(): void {
    if (this.syncInterval) {
      clearInterval(this.syncInterval);
    }
    this.statusCallbacks.clear();
  }
}

// Global sync manager instance
export const syncManager = new SyncManager();