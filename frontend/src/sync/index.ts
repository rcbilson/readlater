// Public exports for the sync module

// Types
export type {
  Article,
  LocalArticle,
  ServerArticle,
  SyncQueueItem,
  SyncOperation,
  SyncStatus,
  SyncState,
  SyncStatusCallback,
  ConflictResult,
  MergeResult,
  FieldChange,
  RetryConfig,
  RetryState,
  SyncEvent,
  SyncMachineState,
} from './types';

// Core utilities
export {
  canonicalizeUrl,
  urlsMatch,
  getHostname,
  displayUrl,
  isValidUrl,
  getUrlVariants,
} from './core/urlCanonicalizer';

export {
  calculateRetryDelay,
  shouldRetry,
  createRetryState,
  recordFailure,
  recordSuccess,
  isTimeToRetry,
  getRetryStatus,
  isRetryableError,
  DEFAULT_RETRY_CONFIG,
} from './core/retryStrategy';

export {
  threeWayMerge,
  createPushOperations,
  mergeServerArticle,
  serverToLocal,
} from './core/conflictResolver';

export {
  createInitialState,
  transition,
  isSyncing,
  hasPendingSync,
  isOffline,
  hasError,
  getStatusMessage,
} from './core/stateMachine';

// Port interfaces
export type { NetworkPort, FetchOptions } from './ports/networkPort';
export type { StoragePort } from './ports/storagePort';
export type { SchedulerPort } from './ports/schedulerPort';

// Port utilities
export {
  DEFAULT_API_TIMEOUT,
  DEFAULT_DOWNLOAD_TIMEOUT,
  createTimeoutController,
  combineSignals,
} from './ports/networkPort';

export { createSyncQueueItem } from './ports/storagePort';

export {
  SYNC_INTERVAL_MS,
  MIN_SYNC_INTERVAL_MS,
  VISIBILITY_SYNC_DELAY_MS,
} from './ports/schedulerPort';

// Adapters
export { BrowserNetworkAdapter, getNetworkAdapter } from './adapters/browserNetworkAdapter';
export { DexieStorageAdapter, getStorageAdapter } from './adapters/dexieStorageAdapter';
export { BrowserSchedulerAdapter, getSchedulerAdapter } from './adapters/browserSchedulerAdapter';

// Mock adapters (for testing)
export {
  MockNetworkAdapter,
  createMockNetworkAdapter,
} from './adapters/__mocks__/mockNetworkAdapter';
export {
  MockStorageAdapter,
  createMockStorageAdapter,
} from './adapters/__mocks__/mockStorageAdapter';
export {
  MockSchedulerAdapter,
  createMockSchedulerAdapter,
} from './adapters/__mocks__/mockSchedulerAdapter';

// High-level components
export { SyncCoordinator } from './syncCoordinator';
export { SyncExecutor } from './syncExecutor';
export {
  SyncService,
  getSyncService,
  initializeSyncService,
  resetSyncService,
} from './syncService';
