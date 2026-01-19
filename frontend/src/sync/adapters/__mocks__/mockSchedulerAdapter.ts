// Mock scheduler adapter for testing

import { SchedulerPort } from '../../ports/schedulerPort';

interface ScheduledCallback {
  id: number;
  fn: () => void;
  time: number;
  interval?: number;
}

export class MockSchedulerAdapter implements SchedulerPort {
  private currentTime: number = 0;
  private nextId: number = 1;
  private scheduledCallbacks: Map<number, ScheduledCallback> = new Map();
  private visibilityCallbacks: Set<(visible: boolean) => void> = new Set();
  private visible: boolean = true;

  // Test helpers

  /**
   * Advance time and execute any callbacks that are due
   */
  advanceTime(ms: number): void {
    const targetTime = this.currentTime + ms;

    while (this.currentTime < targetTime) {
      // Find the next callback that should fire
      let nextCallback: ScheduledCallback | undefined;
      for (const callback of this.scheduledCallbacks.values()) {
        if (callback.time <= targetTime) {
          if (!nextCallback || callback.time < nextCallback.time) {
            nextCallback = callback;
          }
        }
      }

      if (nextCallback && nextCallback.time <= targetTime) {
        this.currentTime = nextCallback.time;

        // Execute the callback
        nextCallback.fn();

        // Handle interval callbacks
        if (nextCallback.interval) {
          nextCallback.time += nextCallback.interval;
        } else {
          this.scheduledCallbacks.delete(nextCallback.id);
        }
      } else {
        // No more callbacks to execute
        this.currentTime = targetTime;
      }
    }
  }

  /**
   * Run all pending microtasks (nextTick callbacks)
   */
  flush(): void {
    const toRun = Array.from(this.scheduledCallbacks.values())
      .filter((cb) => cb.time === this.currentTime);

    for (const callback of toRun) {
      callback.fn();
      if (!callback.interval) {
        this.scheduledCallbacks.delete(callback.id);
      }
    }
  }

  /**
   * Get the number of pending scheduled callbacks
   */
  getPendingCount(): number {
    return this.scheduledCallbacks.size;
  }

  /**
   * Set visibility state for testing
   */
  setVisible(visible: boolean): void {
    if (this.visible !== visible) {
      this.visible = visible;
      this.visibilityCallbacks.forEach((cb) => cb(visible));
    }
  }

  /**
   * Reset the scheduler state
   */
  reset(): void {
    this.currentTime = 0;
    this.scheduledCallbacks.clear();
    this.visibilityCallbacks.clear();
    this.visible = true;
  }

  // SchedulerPort implementation

  setTimeout(fn: () => void, delayMs: number): () => void {
    const id = this.nextId++;
    this.scheduledCallbacks.set(id, {
      id,
      fn,
      time: this.currentTime + delayMs,
    });

    return () => {
      this.scheduledCallbacks.delete(id);
    };
  }

  setInterval(fn: () => void, intervalMs: number): () => void {
    const id = this.nextId++;
    this.scheduledCallbacks.set(id, {
      id,
      fn,
      time: this.currentTime + intervalMs,
      interval: intervalMs,
    });

    return () => {
      this.scheduledCallbacks.delete(id);
    };
  }

  now(): number {
    return this.currentTime;
  }

  nextTick(fn: () => void): () => void {
    const id = this.nextId++;
    this.scheduledCallbacks.set(id, {
      id,
      fn,
      time: this.currentTime, // Execute immediately on next flush
    });

    return () => {
      this.scheduledCallbacks.delete(id);
    };
  }

  onVisibilityChange(callback: (visible: boolean) => void): () => void {
    this.visibilityCallbacks.add(callback);
    return () => {
      this.visibilityCallbacks.delete(callback);
    };
  }

  isVisible(): boolean {
    return this.visible;
  }
}

// Factory function for tests
export function createMockSchedulerAdapter(): MockSchedulerAdapter {
  return new MockSchedulerAdapter();
}
