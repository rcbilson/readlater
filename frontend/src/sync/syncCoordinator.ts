// SyncCoordinator - Manages sync request queuing and coalescing
// Solves the race condition where multiple sync requests are made
// and some get skipped because syncInProgress is true

import { SchedulerPort, MIN_SYNC_INTERVAL_MS } from './ports/schedulerPort';
import { NetworkPort } from './ports/networkPort';
import {
  SyncMachineState,
  SyncEvent,
  SyncStatus,
  SyncStatusCallback,
} from './types';
import {
  createInitialState,
  transition,
  isSyncing,
  hasPendingSync,
} from './core/stateMachine';

export interface SyncCoordinatorConfig {
  minSyncInterval: number;
  onSyncStart: () => Promise<void>;
  onSyncComplete: () => void;
  onSyncError: (error: Error) => void;
}

interface PendingRequest {
  resolve: () => void;
  reject: (error: Error) => void;
}

/**
 * SyncCoordinator manages sync requests and ensures:
 * 1. Requests are queued when a sync is in progress
 * 2. Multiple pending requests are coalesced into one sync
 * 3. Callers get a promise that resolves when their sync completes
 * 4. Minimum interval between syncs is respected
 */
export class SyncCoordinator {
  private state: SyncMachineState;
  private pendingRequests: PendingRequest[] = [];
  private lastSyncTime: number = 0;
  private scheduler: SchedulerPort;
  private network: NetworkPort;
  private config: SyncCoordinatorConfig;
  private statusCallbacks: Set<SyncStatusCallback> = new Set();
  private pendingSyncCount: number = 0;
  private cancelScheduledSync?: () => void;
  private unsubscribeOnline?: () => void;

  constructor(
    scheduler: SchedulerPort,
    network: NetworkPort,
    config: SyncCoordinatorConfig
  ) {
    this.scheduler = scheduler;
    this.network = network;
    this.config = config;
    this.state = createInitialState();

    // Update state based on initial online status
    if (!network.isOnline()) {
      this.dispatch({ type: 'OFFLINE' });
    }

    // Subscribe to online/offline changes
    this.unsubscribeOnline = network.onOnlineChange((online) => {
      this.dispatch(online ? { type: 'ONLINE' } : { type: 'OFFLINE' });
      // When coming online, try to start any pending syncs
      if (online) {
        this.tryStartSync();
      }
    });
  }

  /**
   * Request a sync. Returns a promise that resolves when the sync completes.
   * If a sync is already in progress, the request is queued.
   * Multiple queued requests are coalesced into a single sync.
   */
  requestSync(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.pendingRequests.push({ resolve, reject });
      this.pendingSyncCount = this.pendingRequests.length;
      this.dispatch({ type: 'SYNC_REQUESTED' });
      this.notifyStatusChange();
      this.tryStartSync();
    });
  }

  /**
   * Force a sync immediately, bypassing the minimum interval.
   * Used for critical operations like after adding an article.
   */
  forceSyncNow(): Promise<void> {
    this.lastSyncTime = 0; // Reset throttle
    return this.requestSync();
  }

  /**
   * Subscribe to status changes
   */
  onStatusChange(callback: SyncStatusCallback): () => void {
    this.statusCallbacks.add(callback);
    // Send current status immediately
    callback(this.getStatus());
    return () => {
      this.statusCallbacks.delete(callback);
    };
  }

  /**
   * Get current sync status
   */
  getStatus(): SyncStatus {
    return {
      state: this.state.status,
      isOnline: this.network.isOnline(),
      pendingOperations: this.pendingSyncCount,
      error: this.state.lastError,
    };
  }

  /**
   * Cleanup resources
   */
  destroy(): void {
    if (this.cancelScheduledSync) {
      this.cancelScheduledSync();
    }
    if (this.unsubscribeOnline) {
      this.unsubscribeOnline();
    }
    this.statusCallbacks.clear();

    // Reject any pending requests
    const error = new Error('SyncCoordinator destroyed');
    for (const request of this.pendingRequests) {
      request.reject(error);
    }
    this.pendingRequests = [];
  }

  private dispatch(event: SyncEvent): void {
    const oldState = this.state;
    this.state = transition(this.state, event);

    // Log state transitions for debugging
    if (oldState.status !== this.state.status) {
      console.log(
        `SyncCoordinator: ${oldState.status} -> ${this.state.status}`,
        event.type
      );
    }
  }

  private notifyStatusChange(): void {
    const status = this.getStatus();
    this.statusCallbacks.forEach((cb) => cb(status));
  }

  private tryStartSync(): void {
    // Don't start if already syncing
    if (isSyncing(this.state)) {
      return;
    }

    // Don't start if offline
    if (!this.network.isOnline()) {
      return;
    }

    // Check minimum interval
    const now = this.scheduler.now();
    const timeSinceLastSync = now - this.lastSyncTime;
    const minInterval = this.config.minSyncInterval ?? MIN_SYNC_INTERVAL_MS;

    if (timeSinceLastSync < minInterval && this.pendingRequests.length > 0) {
      // Schedule sync for later
      if (!this.cancelScheduledSync) {
        const delay = minInterval - timeSinceLastSync;
        this.cancelScheduledSync = this.scheduler.setTimeout(() => {
          this.cancelScheduledSync = undefined;
          this.tryStartSync();
        }, delay);
      }
      return;
    }

    // Start the sync
    if (this.pendingRequests.length > 0 || hasPendingSync(this.state)) {
      this.executeSync();
    }
  }

  private async executeSync(): Promise<void> {
    this.dispatch({ type: 'SYNC_STARTED' });
    this.notifyStatusChange();

    // Capture pending requests
    const requests = this.pendingRequests;
    this.pendingRequests = [];
    this.pendingSyncCount = 0;

    try {
      // Execute the actual sync
      await this.config.onSyncStart();

      // Update last sync time
      this.lastSyncTime = this.scheduler.now();

      // Mark sync complete
      this.dispatch({ type: 'SYNC_COMPLETED' });
      this.config.onSyncComplete();

      // Resolve all pending requests
      for (const request of requests) {
        request.resolve();
      }

      // Check if more syncs are pending
      if (hasPendingSync(this.state) || this.pendingRequests.length > 0) {
        this.tryStartSync();
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Sync failed';
      this.dispatch({ type: 'SYNC_FAILED', error: errorMessage });
      this.config.onSyncError(error instanceof Error ? error : new Error(errorMessage));

      // Reject all pending requests
      const syncError = new Error(errorMessage);
      for (const request of requests) {
        request.reject(syncError);
      }
    } finally {
      this.notifyStatusChange();
    }
  }
}
