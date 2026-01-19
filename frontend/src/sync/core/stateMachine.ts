// Sync state machine - manages sync state transitions

import { SyncEvent, SyncMachineState } from '../types';

/**
 * Initial state for the sync machine
 */
export function createInitialState(): SyncMachineState {
  return {
    status: 'idle',
    pendingSync: false,
    retryScheduled: false,
  };
}

/**
 * State machine transition function.
 * Given a current state and an event, returns the next state.
 *
 * State transitions:
 *
 * idle:
 *   SYNC_REQUESTED -> syncing (if online) or pending (if offline)
 *   OFFLINE -> offline
 *
 * syncing:
 *   SYNC_REQUESTED -> syncing (with pending=true, will sync again after)
 *   SYNC_COMPLETED -> idle (or syncing if pending)
 *   SYNC_FAILED -> error (or offline if network error)
 *   OFFLINE -> offline (abort current sync)
 *
 * error:
 *   SYNC_REQUESTED -> syncing
 *   RETRY_SCHEDULED -> error (with retryScheduled=true)
 *   ONLINE -> idle (try again)
 *   OFFLINE -> offline
 *
 * offline:
 *   ONLINE -> idle (and sync if pending)
 *   SYNC_REQUESTED -> offline (with pending=true)
 */
export function transition(
  state: SyncMachineState,
  event: SyncEvent
): SyncMachineState {
  switch (state.status) {
    case 'idle':
      return transitionFromIdle(state, event);
    case 'syncing':
      return transitionFromSyncing(state, event);
    case 'error':
      return transitionFromError(state, event);
    case 'offline':
      return transitionFromOffline(state, event);
    default:
      return state;
  }
}

function transitionFromIdle(
  state: SyncMachineState,
  event: SyncEvent
): SyncMachineState {
  switch (event.type) {
    case 'SYNC_REQUESTED':
      // SYNC_REQUESTED just marks that a sync is pending
      // The actual transition to syncing happens on SYNC_STARTED
      return {
        ...state,
        pendingSync: true,
        lastError: undefined,
      };
    case 'SYNC_STARTED':
      return {
        ...state,
        status: 'syncing',
        pendingSync: false,
      };
    case 'OFFLINE':
      return {
        ...state,
        status: 'offline',
      };
    default:
      return state;
  }
}

function transitionFromSyncing(
  state: SyncMachineState,
  event: SyncEvent
): SyncMachineState {
  switch (event.type) {
    case 'SYNC_REQUESTED':
      // Another sync requested while syncing - mark as pending
      return {
        ...state,
        pendingSync: true,
      };
    case 'SYNC_COMPLETED':
      // Always go back to idle after sync completes
      // If there are pending syncs, tryStartSync will be called to start them
      return {
        ...state,
        status: 'idle',
        retryScheduled: false,
        lastError: undefined,
        // Keep pendingSync - it will be used by tryStartSync
      };
    case 'SYNC_FAILED':
      return {
        ...state,
        status: 'error',
        pendingSync: state.pendingSync,
        lastError: event.error,
      };
    case 'OFFLINE':
      return {
        ...state,
        status: 'offline',
        pendingSync: true, // Resume when back online
      };
    default:
      return state;
  }
}

function transitionFromError(
  state: SyncMachineState,
  event: SyncEvent
): SyncMachineState {
  switch (event.type) {
    case 'SYNC_REQUESTED':
      return {
        ...state,
        status: 'syncing',
        pendingSync: false,
        retryScheduled: false,
      };
    case 'RETRY_SCHEDULED':
      return {
        ...state,
        retryScheduled: true,
      };
    case 'ONLINE':
      // Try again when coming back online
      return {
        ...state,
        status: 'idle',
        pendingSync: true,
      };
    case 'OFFLINE':
      return {
        ...state,
        status: 'offline',
        pendingSync: true,
      };
    default:
      return state;
  }
}

function transitionFromOffline(
  state: SyncMachineState,
  event: SyncEvent
): SyncMachineState {
  switch (event.type) {
    case 'SYNC_REQUESTED':
      // Queue sync for when we come back online
      return {
        ...state,
        pendingSync: true,
      };
    case 'ONLINE':
      // Always go to idle - tryStartSync will be called to start pending syncs
      return {
        ...state,
        status: 'idle',
        lastError: undefined,
        // Keep pendingSync - tryStartSync will use it
      };
    default:
      return state;
  }
}

/**
 * Check if sync is currently in progress
 */
export function isSyncing(state: SyncMachineState): boolean {
  return state.status === 'syncing';
}

/**
 * Check if a sync is pending (waiting to start)
 */
export function hasPendingSync(state: SyncMachineState): boolean {
  return state.pendingSync;
}

/**
 * Check if we're currently offline
 */
export function isOffline(state: SyncMachineState): boolean {
  return state.status === 'offline';
}

/**
 * Check if there was an error
 */
export function hasError(state: SyncMachineState): boolean {
  return state.status === 'error';
}

/**
 * Get a human-readable status message
 */
export function getStatusMessage(state: SyncMachineState): string {
  switch (state.status) {
    case 'idle':
      return 'Ready';
    case 'syncing':
      return state.pendingSync ? 'Syncing (more pending)' : 'Syncing...';
    case 'error':
      if (state.retryScheduled) {
        return `Error: ${state.lastError} (retry scheduled)`;
      }
      return `Error: ${state.lastError}`;
    case 'offline':
      return state.pendingSync ? 'Offline (sync pending)' : 'Offline';
    default:
      return 'Unknown';
  }
}
