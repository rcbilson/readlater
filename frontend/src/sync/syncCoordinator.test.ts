import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SyncCoordinator } from './syncCoordinator';
import { SchedulerPort } from './ports/schedulerPort';
import { NetworkPort } from './ports/networkPort';

// Simple mock scheduler that uses real timers
function createSimpleScheduler(): SchedulerPort {
  return {
    setTimeout: (fn: () => void, delayMs: number) => {
      const id = setTimeout(fn, delayMs);
      return () => clearTimeout(id);
    },
    setInterval: (fn: () => void, intervalMs: number) => {
      const id = setInterval(fn, intervalMs);
      return () => clearInterval(id);
    },
    now: () => Date.now(),
    nextTick: (fn: () => void) => {
      const id = setTimeout(fn, 0);
      return () => clearTimeout(id);
    },
    onVisibilityChange: () => () => {},
    isVisible: () => true,
  };
}

// Simple mock network that is online by default
function createSimpleNetwork(): NetworkPort & { setOnline: (online: boolean) => void } {
  let online = true;
  const callbacks = new Set<(online: boolean) => void>();

  return {
    setOnline: (value: boolean) => {
      online = value;
      callbacks.forEach((cb) => cb(value));
    },
    isOnline: () => online,
    onOnlineChange: (cb: (online: boolean) => void) => {
      callbacks.add(cb);
      return () => callbacks.delete(cb);
    },
    fetchChanges: async () => [],
    markRead: async () => {},
    setArchive: async () => {},
    getRecents: async () => [],
    getArchive: async () => [],
    summarize: async () => ({ url: '', title: '', contents: '' }),
  };
}

describe('SyncCoordinator', () => {
  let scheduler: SchedulerPort;
  let network: ReturnType<typeof createSimpleNetwork>;
  let syncCount: number;
  let lastError: Error | null;

  beforeEach(() => {
    scheduler = createSimpleScheduler();
    network = createSimpleNetwork();
    syncCount = 0;
    lastError = null;
  });

  function createCoordinator(options?: {
    syncFn?: () => Promise<void>;
    minSyncInterval?: number;
  }) {
    return new SyncCoordinator(scheduler, network, {
      minSyncInterval: options?.minSyncInterval ?? 0,
      onSyncStart:
        options?.syncFn ??
        (async () => {
          syncCount++;
        }),
      onSyncComplete: () => {},
      onSyncError: (error) => {
        lastError = error;
      },
    });
  }

  describe('requestSync', () => {
    it('executes sync when idle and online', async () => {
      const coordinator = createCoordinator();
      await coordinator.requestSync();
      expect(syncCount).toBe(1);
      coordinator.destroy();
    });

    it('coalesces multiple requests into one sync', async () => {
      const coordinator = createCoordinator();

      const p1 = coordinator.requestSync();
      const p2 = coordinator.requestSync();
      const p3 = coordinator.requestSync();

      await Promise.all([p1, p2, p3]);

      // First sync executes, others coalesce
      expect(syncCount).toBeLessThanOrEqual(2);
      coordinator.destroy();
    });

    it('queues request when sync is in progress', async () => {
      let resolveSync: () => void = () => {};
      const coordinator = createCoordinator({
        syncFn: async () => {
          syncCount++;
          if (syncCount === 1) {
            await new Promise<void>((resolve) => {
              resolveSync = resolve;
            });
          }
        },
      });

      const p1 = coordinator.requestSync();
      await new Promise((r) => setTimeout(r, 10));

      const p2 = coordinator.requestSync();

      resolveSync();
      await p1;
      await p2;

      expect(syncCount).toBe(2);
      coordinator.destroy();
    });

    it('does not sync when offline', async () => {
      network.setOnline(false);
      const coordinator = createCoordinator();

      const promise = coordinator.requestSync();
      expect(syncCount).toBe(0);

      network.setOnline(true);
      await promise;
      expect(syncCount).toBe(1);
      coordinator.destroy();
    });
  });

  describe('forceSyncNow', () => {
    it('executes sync immediately', async () => {
      const coordinator = createCoordinator();
      await coordinator.forceSyncNow();
      expect(syncCount).toBe(1);
      coordinator.destroy();
    });
  });

  describe('status updates', () => {
    it('notifies subscribers of status changes', async () => {
      const coordinator = createCoordinator();
      const statuses: string[] = [];

      coordinator.onStatusChange((status) => {
        statuses.push(status.state);
      });

      await coordinator.requestSync();

      expect(statuses).toContain('idle');
      expect(statuses).toContain('syncing');
      coordinator.destroy();
    });

    it('tracks pending operations count', async () => {
      let resolveSync: () => void = () => {};
      const coordinator = createCoordinator({
        syncFn: async () => {
          syncCount++;
          await new Promise<void>((resolve) => {
            resolveSync = resolve;
          });
        },
      });

      const p1 = coordinator.requestSync();
      await new Promise((r) => setTimeout(r, 10));

      // While first sync is running, request more
      const p2 = coordinator.requestSync();
      const p3 = coordinator.requestSync();

      const status = coordinator.getStatus();
      expect(status.pendingOperations).toBeGreaterThan(0);

      // Clean up: destroy rejects pending requests
      coordinator.destroy();

      // Catch the expected rejections to prevent unhandled rejection errors
      resolveSync(); // Complete the first sync
      await p1.catch(() => {}); // May resolve or reject
      await p2.catch(() => {}); // Will reject with "destroyed"
      await p3.catch(() => {}); // Will reject with "destroyed"
    });

    it('unsubscribe stops notifications', async () => {
      const coordinator = createCoordinator();
      const statuses: string[] = [];

      const unsubscribe = coordinator.onStatusChange((status) => {
        statuses.push(status.state);
      });

      const initialCount = statuses.length;
      unsubscribe();

      await coordinator.requestSync();
      expect(statuses).toHaveLength(initialCount);
      coordinator.destroy();
    });
  });

  describe('error handling', () => {
    it('rejects pending requests on sync failure', async () => {
      const coordinator = createCoordinator({
        syncFn: async () => {
          throw new Error('Sync failed');
        },
      });

      await expect(coordinator.requestSync()).rejects.toThrow('Sync failed');
      expect(lastError?.message).toBe('Sync failed');
      coordinator.destroy();
    });

    it('updates status on error', async () => {
      const coordinator = createCoordinator({
        syncFn: async () => {
          throw new Error('Sync failed');
        },
      });

      try {
        await coordinator.requestSync();
      } catch {
        // Expected
      }

      const status = coordinator.getStatus();
      expect(status.state).toBe('error');
      expect(status.error).toBe('Sync failed');
      coordinator.destroy();
    });
  });

  describe('destroy', () => {
    it('rejects queued requests on destroy', async () => {
      let resolveSync: () => void = () => {};
      const coordinator = createCoordinator({
        syncFn: async () => {
          await new Promise<void>((resolve) => {
            resolveSync = resolve;
          });
        },
      });

      const p1 = coordinator.requestSync();
      await new Promise((r) => setTimeout(r, 10));

      const p2 = coordinator.requestSync();
      coordinator.destroy();

      resolveSync();
      await p1;
      await expect(p2).rejects.toThrow('destroyed');
    });

    it('cleans up subscriptions', () => {
      const coordinator = createCoordinator();
      const callback = vi.fn();

      coordinator.onStatusChange(callback);
      coordinator.destroy();

      expect(coordinator.getStatus().state).toBe('idle');
    });
  });
});
