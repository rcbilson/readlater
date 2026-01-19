// Core types for the sync system

export interface Article {
  url: string;
  title: string;
  contents?: string;
  rendered?: string;
}

export interface LocalArticle {
  url: string;
  title: string;
  contents?: string;
  hasBody: boolean;
  unread: boolean;
  archived: boolean;
  downloadedAt: number;
  lastAccess?: number;
  lastModified?: string;
  // Stores the last known server state (converted to LocalArticle format) for three-way merge
  lastKnownServerState?: LocalArticle;
}

export interface ServerArticle {
  url: string;
  title: string;
  hasBody: boolean;
  unread: boolean;
  archived: boolean;
  lastAccess: string;
}

export interface SyncQueueItem {
  id?: number;
  url: string;
  operation: SyncOperation;
  data: Record<string, unknown>;
  timestamp: number;
  retryCount: number;
}

export type SyncOperation = 'markRead' | 'setArchive' | 'download';

export interface SyncStatus {
  state: SyncState;
  isOnline: boolean;
  lastSyncTime?: Date;
  pendingOperations: number;
  error?: string;
}

export type SyncState = 'idle' | 'syncing' | 'error' | 'offline';

export type SyncStatusCallback = (status: SyncStatus) => void;

// Conflict resolution types
export interface ConflictResult {
  resolved: LocalArticle;
  operations: SyncQueueItem[];
}

export interface MergeResult {
  article: LocalArticle;
  needsPush: boolean;
  changes: FieldChange[];
}

export interface FieldChange {
  field: keyof LocalArticle;
  from: unknown;
  to: unknown;
  source: 'local' | 'server';
}

// Retry strategy types
export interface RetryConfig {
  maxRetries: number;
  baseDelayMs: number;
  maxDelayMs: number;
  jitterFactor: number;
}

export interface RetryState {
  attempt: number;
  nextRetryTime?: number;
  lastError?: string;
}

// State machine types
export type SyncEvent =
  | { type: 'SYNC_REQUESTED' }
  | { type: 'SYNC_STARTED' }
  | { type: 'SYNC_COMPLETED' }
  | { type: 'SYNC_FAILED'; error: string }
  | { type: 'ONLINE' }
  | { type: 'OFFLINE' }
  | { type: 'RETRY_SCHEDULED'; delay: number };

export interface SyncMachineState {
  status: SyncState;
  pendingSync: boolean;
  retryScheduled: boolean;
  lastError?: string;
}
