// SyncService - High-level API for sync operations
// This is the main entry point for the sync system

import { NetworkPort } from './ports/networkPort';
import { StoragePort } from './ports/storagePort';
import { SchedulerPort, SYNC_INTERVAL_MS, VISIBILITY_SYNC_DELAY_MS } from './ports/schedulerPort';
import { SyncCoordinator } from './syncCoordinator';
import { SyncExecutor } from './syncExecutor';
import { Article, LocalArticle, SyncStatus, SyncStatusCallback } from './types';
import { getNetworkAdapter } from './adapters/browserNetworkAdapter';
import { getStorageAdapter } from './adapters/dexieStorageAdapter';
import { getSchedulerAdapter } from './adapters/browserSchedulerAdapter';

export interface SyncServiceConfig {
  syncInterval: number;
  minSyncInterval: number;
  apiTimeout: number;
}

const DEFAULT_CONFIG: SyncServiceConfig = {
  syncInterval: SYNC_INTERVAL_MS,
  minSyncInterval: 30000, // 30 seconds
  apiTimeout: 10000, // 10 seconds
};

/**
 * SyncService is the main entry point for sync operations.
 * It coordinates between the SyncCoordinator (request queuing)
 * and SyncExecutor (actual sync logic).
 */
export class SyncService {
  private coordinator: SyncCoordinator;
  private executor: SyncExecutor;
  private scheduler: SchedulerPort;
  private storage: StoragePort;
  private config: SyncServiceConfig;
  private cancelPeriodicSync?: () => void;
  private cancelVisibilityHandler?: () => void;
  private cancelPendingVisibilitySync?: () => void;
  private initialized: boolean = false;

  constructor(
    network: NetworkPort = getNetworkAdapter(),
    storage: StoragePort = getStorageAdapter(),
    scheduler: SchedulerPort = getSchedulerAdapter(),
    config: Partial<SyncServiceConfig> = {}
  ) {
    this.storage = storage;
    this.scheduler = scheduler;
    this.config = { ...DEFAULT_CONFIG, ...config };

    this.executor = new SyncExecutor(network, storage, {
      maxRetries: 5,
      apiTimeout: this.config.apiTimeout,
    });

    this.coordinator = new SyncCoordinator(scheduler, network, {
      minSyncInterval: this.config.minSyncInterval,
      onSyncStart: () => this.executor.performFullSync(),
      onSyncComplete: () => {
        console.log('SyncService: Sync completed');
      },
      onSyncError: (error) => {
        console.error('SyncService: Sync failed:', error);
      },
    });

    this.setupPeriodicSync();
    this.setupVisibilityHandler();
  }

  /**
   * Initialize the sync service and load initial data
   */
  async initialize(): Promise<void> {
    if (this.initialized) return;

    console.log('SyncService: Initializing');
    await this.executor.loadInitialData();
    this.initialized = true;
    console.log('SyncService: Initialized');
  }

  /**
   * Request a sync. Returns a promise that resolves when complete.
   * Multiple requests are coalesced into one sync operation.
   */
  requestSync(): Promise<void> {
    return this.coordinator.requestSync();
  }

  /**
   * Force an immediate sync, bypassing rate limiting.
   * Use sparingly - mainly for after adding new articles.
   */
  forceSyncNow(): Promise<void> {
    return this.coordinator.forceSyncNow();
  }

  /**
   * Perform a full sync (equivalent to requestSync but clearer intent)
   */
  performFullSync(): Promise<void> {
    return this.requestSync();
  }

  /**
   * Download an article and store it locally
   */
  async downloadArticle(url: string, titleHint?: string): Promise<Article> {
    const article = await this.executor.downloadArticle(url, titleHint);
    // Trigger sync to update server state
    this.requestSync().catch(console.error);
    return article;
  }

  /**
   * Mark an article as read
   */
  async markRead(url: string): Promise<void> {
    await this.executor.markRead(url);
  }

  /**
   * Set the archive status of an article
   */
  async setArchive(url: string, archived: boolean): Promise<void> {
    await this.executor.setArchive(url, archived);
  }

  /**
   * Get current sync status
   */
  getStatus(): SyncStatus {
    return this.coordinator.getStatus();
  }

  /**
   * Subscribe to sync status changes
   */
  onStatusChange(callback: SyncStatusCallback): () => void {
    return this.coordinator.onStatusChange(callback);
  }

  // Storage access methods (delegated to storage adapter)

  async getRecentArticles(count: number = 50): Promise<LocalArticle[]> {
    return this.storage.getRecentArticles(count);
  }

  async getArchivedArticles(count: number = 50): Promise<LocalArticle[]> {
    return this.storage.getArchivedArticles(count);
  }

  async getArticle(url: string): Promise<LocalArticle | undefined> {
    // Try exact match first
    const article = await this.storage.getArticle(url);
    if (article) return article;

    // Try canonical URL
    const { canonicalizeUrl } = await import('./core/urlCanonicalizer');
    const canonicalUrl = canonicalizeUrl(url);
    if (canonicalUrl !== url) {
      return this.storage.getArticleByCanonicalUrl(canonicalUrl);
    }
    return undefined;
  }

  async searchArticles(query: string): Promise<LocalArticle[]> {
    return this.storage.searchArticles(query);
  }

  async getLastSyncTimestamp(): Promise<string> {
    return this.storage.getLastSyncTimestamp();
  }

  /**
   * Cleanup resources
   */
  destroy(): void {
    if (this.cancelPeriodicSync) {
      this.cancelPeriodicSync();
    }
    if (this.cancelVisibilityHandler) {
      this.cancelVisibilityHandler();
    }
    if (this.cancelPendingVisibilitySync) {
      this.cancelPendingVisibilitySync();
    }
    this.coordinator.destroy();
  }

  private setupPeriodicSync(): void {
    // Sync periodically when online and visible
    this.cancelPeriodicSync = this.scheduler.setInterval(() => {
      if (this.scheduler.isVisible()) {
        this.requestSync().catch(console.error);
      }
    }, this.config.syncInterval);
  }

  private setupVisibilityHandler(): void {
    // Sync when page becomes visible
    this.cancelVisibilityHandler = this.scheduler.onVisibilityChange((visible) => {
      if (visible) {
        // Clean up any existing pending sync handlers first
        if (this.cancelPendingVisibilitySync) {
          this.cancelPendingVisibilitySync();
          this.cancelPendingVisibilitySync = undefined;
        }

        // Small delay to avoid sync spam when switching tabs quickly
        const cancelTimeout = this.scheduler.setTimeout(() => {
          // Timeout fired - clean up the nested handler
          if (unsubscribeNested) {
            unsubscribeNested();
          }
          this.cancelPendingVisibilitySync = undefined;
          this.requestSync().catch(console.error);
        }, VISIBILITY_SYNC_DELAY_MS);

        // Cancel if we become hidden again
        const unsubscribeNested = this.scheduler.onVisibilityChange((stillVisible) => {
          if (!stillVisible) {
            cancelTimeout();
            unsubscribeNested();
            this.cancelPendingVisibilitySync = undefined;
          }
        });

        // Store cleanup function for destroy()
        this.cancelPendingVisibilitySync = () => {
          cancelTimeout();
          unsubscribeNested();
        };
      }
    });
  }
}

// Global singleton instance
let syncServiceInstance: SyncService | null = null;

/**
 * Get the global SyncService instance
 */
export function getSyncService(): SyncService {
  if (!syncServiceInstance) {
    syncServiceInstance = new SyncService();
  }
  return syncServiceInstance;
}

/**
 * Initialize the global SyncService
 */
export async function initializeSyncService(): Promise<SyncService> {
  const service = getSyncService();
  await service.initialize();
  return service;
}

/**
 * Reset the global SyncService (for testing)
 */
export function resetSyncService(): void {
  if (syncServiceInstance) {
    syncServiceInstance.destroy();
    syncServiceInstance = null;
  }
}
