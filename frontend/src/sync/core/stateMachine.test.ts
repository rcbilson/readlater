import { describe, it, expect } from 'vitest';
import {
  createInitialState,
  transition,
  isSyncing,
  hasPendingSync,
  isOffline,
  hasError,
  getStatusMessage,
} from './stateMachine';
import { SyncMachineState, SyncEvent } from '../types';

describe('stateMachine', () => {
  describe('createInitialState', () => {
    it('creates idle state with no pending sync', () => {
      const state = createInitialState();

      expect(state.status).toBe('idle');
      expect(state.pendingSync).toBe(false);
      expect(state.retryScheduled).toBe(false);
      expect(state.lastError).toBeUndefined();
    });
  });

  describe('transition from idle', () => {
    const idleState = createInitialState();

    it('sets pendingSync on SYNC_REQUESTED (stays idle)', () => {
      const event: SyncEvent = { type: 'SYNC_REQUESTED' };
      const newState = transition(idleState, event);

      // SYNC_REQUESTED just marks a sync as pending, doesn't start syncing
      expect(newState.status).toBe('idle');
      expect(newState.pendingSync).toBe(true);
    });

    it('transitions to syncing on SYNC_STARTED', () => {
      const event: SyncEvent = { type: 'SYNC_STARTED' };
      const newState = transition(idleState, event);

      expect(newState.status).toBe('syncing');
    });

    it('transitions to offline on OFFLINE', () => {
      const event: SyncEvent = { type: 'OFFLINE' };
      const newState = transition(idleState, event);

      expect(newState.status).toBe('offline');
    });

    it('stays idle on unhandled events', () => {
      const event: SyncEvent = { type: 'SYNC_COMPLETED' };
      const newState = transition(idleState, event);

      expect(newState.status).toBe('idle');
    });
  });

  describe('transition from syncing', () => {
    const syncingState: SyncMachineState = {
      status: 'syncing',
      pendingSync: false,
      retryScheduled: false,
    };

    it('sets pendingSync on SYNC_REQUESTED', () => {
      const event: SyncEvent = { type: 'SYNC_REQUESTED' };
      const newState = transition(syncingState, event);

      expect(newState.status).toBe('syncing');
      expect(newState.pendingSync).toBe(true);
    });

    it('transitions to idle on SYNC_COMPLETED when no pending', () => {
      const event: SyncEvent = { type: 'SYNC_COMPLETED' };
      const newState = transition(syncingState, event);

      expect(newState.status).toBe('idle');
      expect(newState.pendingSync).toBe(false);
    });

    it('goes to idle on SYNC_COMPLETED even when pending', () => {
      const state: SyncMachineState = { ...syncingState, pendingSync: true };
      const event: SyncEvent = { type: 'SYNC_COMPLETED' };
      const newState = transition(state, event);

      // Always go back to idle - coordinator will call tryStartSync
      expect(newState.status).toBe('idle');
      // pendingSync is preserved for tryStartSync to check
      expect(newState.pendingSync).toBe(true);
    });

    it('transitions to error on SYNC_FAILED', () => {
      const event: SyncEvent = { type: 'SYNC_FAILED', error: 'Network error' };
      const newState = transition(syncingState, event);

      expect(newState.status).toBe('error');
      expect(newState.lastError).toBe('Network error');
    });

    it('transitions to offline on OFFLINE', () => {
      const event: SyncEvent = { type: 'OFFLINE' };
      const newState = transition(syncingState, event);

      expect(newState.status).toBe('offline');
      expect(newState.pendingSync).toBe(true); // Resume when back online
    });
  });

  describe('transition from error', () => {
    const errorState: SyncMachineState = {
      status: 'error',
      pendingSync: false,
      retryScheduled: false,
      lastError: 'Previous error',
    };

    it('transitions to idle with pendingSync on SYNC_REQUESTED', () => {
      const event: SyncEvent = { type: 'SYNC_REQUESTED' };
      const newState = transition(errorState, event);

      expect(newState.status).toBe('idle');
      expect(newState.pendingSync).toBe(true);
      expect(newState.retryScheduled).toBe(false);
      expect(newState.lastError).toBeUndefined();
    });

    it('sets retryScheduled on RETRY_SCHEDULED', () => {
      const event: SyncEvent = { type: 'RETRY_SCHEDULED', delay: 5000 };
      const newState = transition(errorState, event);

      expect(newState.status).toBe('error');
      expect(newState.retryScheduled).toBe(true);
    });

    it('transitions to idle on ONLINE', () => {
      const event: SyncEvent = { type: 'ONLINE' };
      const newState = transition(errorState, event);

      expect(newState.status).toBe('idle');
      expect(newState.pendingSync).toBe(true);
    });

    it('transitions to offline on OFFLINE', () => {
      const event: SyncEvent = { type: 'OFFLINE' };
      const newState = transition(errorState, event);

      expect(newState.status).toBe('offline');
      expect(newState.pendingSync).toBe(true);
    });
  });

  describe('transition from offline', () => {
    const offlineState: SyncMachineState = {
      status: 'offline',
      pendingSync: false,
      retryScheduled: false,
    };

    it('queues sync on SYNC_REQUESTED', () => {
      const event: SyncEvent = { type: 'SYNC_REQUESTED' };
      const newState = transition(offlineState, event);

      expect(newState.status).toBe('offline');
      expect(newState.pendingSync).toBe(true);
    });

    it('transitions to idle on ONLINE when no pending', () => {
      const event: SyncEvent = { type: 'ONLINE' };
      const newState = transition(offlineState, event);

      expect(newState.status).toBe('idle');
    });

    it('transitions to idle on ONLINE (keeps pending for tryStartSync)', () => {
      const state: SyncMachineState = { ...offlineState, pendingSync: true };
      const event: SyncEvent = { type: 'ONLINE' };
      const newState = transition(state, event);

      // Go to idle - tryStartSync will be called to start pending syncs
      expect(newState.status).toBe('idle');
      expect(newState.pendingSync).toBe(true);
    });
  });

  describe('helper functions', () => {
    it('isSyncing returns true only when syncing', () => {
      expect(isSyncing({ status: 'syncing', pendingSync: false, retryScheduled: false })).toBe(true);
      expect(isSyncing({ status: 'idle', pendingSync: false, retryScheduled: false })).toBe(false);
      expect(isSyncing({ status: 'error', pendingSync: false, retryScheduled: false })).toBe(false);
      expect(isSyncing({ status: 'offline', pendingSync: false, retryScheduled: false })).toBe(false);
    });

    it('hasPendingSync returns pendingSync value', () => {
      expect(hasPendingSync({ status: 'idle', pendingSync: true, retryScheduled: false })).toBe(true);
      expect(hasPendingSync({ status: 'idle', pendingSync: false, retryScheduled: false })).toBe(false);
    });

    it('isOffline returns true only when offline', () => {
      expect(isOffline({ status: 'offline', pendingSync: false, retryScheduled: false })).toBe(true);
      expect(isOffline({ status: 'idle', pendingSync: false, retryScheduled: false })).toBe(false);
    });

    it('hasError returns true only when error', () => {
      expect(hasError({ status: 'error', pendingSync: false, retryScheduled: false })).toBe(true);
      expect(hasError({ status: 'idle', pendingSync: false, retryScheduled: false })).toBe(false);
    });
  });

  describe('getStatusMessage', () => {
    it('returns correct messages for each state', () => {
      expect(getStatusMessage({ status: 'idle', pendingSync: false, retryScheduled: false })).toBe('Ready');
      expect(getStatusMessage({ status: 'syncing', pendingSync: false, retryScheduled: false })).toBe('Syncing...');
      expect(getStatusMessage({ status: 'syncing', pendingSync: true, retryScheduled: false })).toBe('Syncing (more pending)');
      expect(getStatusMessage({ status: 'error', pendingSync: false, retryScheduled: false, lastError: 'Oops' })).toBe('Error: Oops');
      expect(getStatusMessage({ status: 'error', pendingSync: false, retryScheduled: true, lastError: 'Oops' })).toBe('Error: Oops (retry scheduled)');
      expect(getStatusMessage({ status: 'offline', pendingSync: false, retryScheduled: false })).toBe('Offline');
      expect(getStatusMessage({ status: 'offline', pendingSync: true, retryScheduled: false })).toBe('Offline (sync pending)');
    });
  });
});
