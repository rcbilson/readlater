// SyncExecutor - Handles the actual sync logic
// Bidirectional sync: push local changes to server, pull server changes to local

import { NetworkPort, FetchOptions, DEFAULT_API_TIMEOUT } from './ports/networkPort';
import { StoragePort } from './ports/storagePort';
import { ServerArticle, LocalArticle, Article } from './types';
import { mergeServerArticle, serverToLocal } from './core/conflictResolver';
import { canonicalizeUrl } from './core/urlCanonicalizer';
import { shouldRetry, DEFAULT_RETRY_CONFIG } from './core/retryStrategy';

export interface SyncExecutorConfig {
  maxRetries: number;
  apiTimeout: number;
}

const DEFAULT_CONFIG: SyncExecutorConfig = {
  maxRetries: DEFAULT_RETRY_CONFIG.maxRetries,
  apiTimeout: DEFAULT_API_TIMEOUT,
};

export class SyncExecutor {
  private network: NetworkPort;
  private storage: StoragePort;
  private config: SyncExecutorConfig;

  constructor(
    network: NetworkPort,
    storage: StoragePort,
    config: Partial<SyncExecutorConfig> = {}
  ) {
    this.network = network;
    this.storage = storage;
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Perform a full bidirectional sync:
   * 1. Push local changes to server
   * 2. Pull server changes to local
   */
  async performFullSync(): Promise<void> {
    if (!this.network.isOnline()) {
      console.log('SyncExecutor: Offline, skipping sync');
      return;
    }

    console.log('SyncExecutor: Starting full sync');

    // 1. Push local changes to server
    await this.syncToServer();

    // 2. Pull server changes to local
    await this.syncFromServer();

    // 3. Update sync timestamp
    await this.storage.updateLastSyncTimestamp();

    console.log('SyncExecutor: Sync completed');
  }

  /**
   * Load initial data from server (for first load or refresh)
   */
  async loadInitialData(): Promise<void> {
    if (!this.network.isOnline()) {
      console.log('SyncExecutor: Offline, skipping initial data load');
      return;
    }

    console.log('SyncExecutor: Loading initial data');

    const options: FetchOptions = { timeoutMs: this.config.apiTimeout };

    // Fetch recent articles from server
    const recents = await this.network.getRecents(50, options);
    console.log(`SyncExecutor: Received ${recents.length} articles from server`);

    // Store articles locally
    for (const serverArticle of recents) {
      const localArticle = await this.storage.getArticle(serverArticle.url);

      if (!localArticle) {
        // New article - store it
        const article = serverToLocal(serverArticle);
        article.lastKnownServerState = serverToLocal(serverArticle);
        await this.storage.storeArticle(article);
      } else {
        // Existing article - merge
        const result = mergeServerArticle(serverArticle, localArticle);
        await this.storage.storeArticle(result.article);
      }
    }

    await this.storage.updateLastSyncTimestamp();
    console.log('SyncExecutor: Initial data load completed');
  }

  /**
   * Download an article and store it locally
   */
  async downloadArticle(url: string, titleHint?: string): Promise<Article> {
    // First check if we have it locally with content
    const localArticle = await this.storage.getArticle(url);
    if (localArticle?.contents) {
      return {
        url: localArticle.url,
        title: localArticle.title,
        contents: localArticle.contents,
      };
    }

    // Also try canonical URL
    const canonicalUrl = canonicalizeUrl(url);
    if (canonicalUrl !== url) {
      const canonicalArticle = await this.storage.getArticleByCanonicalUrl(canonicalUrl);
      if (canonicalArticle?.contents) {
        return {
          url: canonicalArticle.url,
          title: canonicalArticle.title,
          contents: canonicalArticle.contents,
        };
      }
    }

    // Fetch from server
    const article = await this.network.summarize(url, titleHint);

    // Store locally - hasBody should reflect whether we actually got content
    const hasBody = !!article.contents;
    const toStore: LocalArticle = {
      url: article.url,
      title: article.title,
      contents: hasBody ? article.contents : undefined,
      hasBody,
      unread: true,
      archived: false,
      downloadedAt: Date.now(),
    };
    await this.storage.storeArticle(toStore);

    return article;
  }

  /**
   * Mark an article as read
   */
  async markRead(url: string): Promise<void> {
    // Optimistic update
    await this.storage.markArticleRead(url, false);

    // Queue for server sync
    await this.storage.addToSyncQueue({
      url,
      operation: 'markRead',
      data: { unread: false },
    });

    // Try to sync immediately if online
    if (this.network.isOnline()) {
      try {
        await this.network.markRead(url, { timeoutMs: this.config.apiTimeout });
        // Remove from queue on success
        const pending = await this.storage.getPendingSyncItems();
        const item = pending.find(
          (i) => i.url === url && i.operation === 'markRead'
        );
        if (item?.id) {
          await this.storage.removeSyncItem(item.id);
        }
      } catch (error) {
        console.error('SyncExecutor: Failed to mark read on server:', error);
        // Item remains in queue for retry
      }
    }
  }

  /**
   * Remove downloaded content from an article (local-only operation)
   * This frees up IndexedDB storage without affecting server state
   */
  async removeContent(url: string): Promise<void> {
    const article = await this.storage.getArticle(url);
    if (!article) {
      console.log(`SyncExecutor: Article not found for content removal: ${url}`);
      return;
    }

    // Update article to remove content
    const updated: LocalArticle = {
      ...article,
      contents: undefined,
      hasBody: false,
    };
    await this.storage.storeArticle(updated);
    console.log(`SyncExecutor: Removed content for ${url}`);
  }

  /**
   * Set archive status for an article
   */
  async setArchive(url: string, archived: boolean): Promise<void> {
    // Optimistic update
    await this.storage.setArticleArchive(url, archived);

    // Queue for server sync
    await this.storage.addToSyncQueue({
      url,
      operation: 'setArchive',
      data: { archived },
    });

    // Try to sync immediately if online
    if (this.network.isOnline()) {
      try {
        await this.network.setArchive(url, archived, {
          timeoutMs: this.config.apiTimeout,
        });
        // Remove from queue on success
        const pending = await this.storage.getPendingSyncItems();
        const item = pending.find(
          (i) => i.url === url && i.operation === 'setArchive'
        );
        if (item?.id) {
          await this.storage.removeSyncItem(item.id);
        }
      } catch (error) {
        console.error('SyncExecutor: Failed to set archive on server:', error);
        // Item remains in queue for retry
      }
    }
  }

  /**
   * Push pending local changes to server
   */
  private async syncToServer(): Promise<void> {
    const pendingItems = await this.storage.getPendingSyncItems();
    console.log(`SyncExecutor: ${pendingItems.length} pending items to sync`);

    const options: FetchOptions = { timeoutMs: this.config.apiTimeout };

    for (const item of pendingItems) {
      try {
        switch (item.operation) {
          case 'markRead':
            await this.network.markRead(item.url, options);
            break;
          case 'setArchive':
            await this.network.setArchive(
              item.url,
              item.data.archived as boolean,
              options
            );
            break;
        }

        // Remove successful item
        if (item.id) {
          await this.storage.removeSyncItem(item.id);
        }
      } catch (error) {
        console.error(
          `SyncExecutor: Failed to sync ${item.operation} for ${item.url}:`,
          error
        );

        if (item.id) {
          await this.storage.incrementSyncRetry(item.id);

          // Remove after too many retries
          if (!shouldRetry(item.retryCount, { ...DEFAULT_RETRY_CONFIG, maxRetries: this.config.maxRetries })) {
            console.log(
              `SyncExecutor: Giving up on ${item.url} after ${item.retryCount} retries`
            );
            await this.storage.removeSyncItem(item.id);
          }
        }
      }
    }
  }

  /**
   * Pull server changes to local storage
   */
  private async syncFromServer(): Promise<void> {
    const lastSync = await this.storage.getLastSyncTimestamp();
    const options: FetchOptions = { timeoutMs: this.config.apiTimeout };

    const serverChanges = await this.network.fetchChanges(lastSync, options);
    console.log(`SyncExecutor: ${serverChanges.length} changes from server`);

    for (const serverArticle of serverChanges) {
      await this.mergeServerArticle(serverArticle);
    }
  }

  /**
   * Merge a server article with local state using three-way merge
   */
  private async mergeServerArticle(serverArticle: ServerArticle): Promise<void> {
    // Try exact URL match first
    let localArticle = await this.storage.getArticle(serverArticle.url);

    // Try canonical URL if no match
    if (!localArticle) {
      const canonicalUrl = canonicalizeUrl(serverArticle.url);
      if (canonicalUrl !== serverArticle.url) {
        localArticle = await this.storage.getArticleByCanonicalUrl(canonicalUrl);
      }
    }

    const result = mergeServerArticle(serverArticle, localArticle);

    // Preserve local content if server doesn't have it
    if (localArticle?.contents && !result.article.contents) {
      result.article.contents = localArticle.contents;
      result.article.hasBody = true;
    }

    await this.storage.storeArticle(result.article);

    // If we need to push changes back, add to queue
    if (result.needsPush) {
      if (result.article.unread !== serverArticle.unread) {
        await this.storage.addToSyncQueue({
          url: result.article.url,
          operation: 'markRead',
          data: { unread: result.article.unread },
        });
      }
      if (result.article.archived !== serverArticle.archived) {
        await this.storage.addToSyncQueue({
          url: result.article.url,
          operation: 'setArchive',
          data: { archived: result.article.archived },
        });
      }
    }
  }
}
