// Scheduler port interface - abstraction over setTimeout/setInterval

export interface SchedulerPort {
  /**
   * Schedule a function to run after a delay
   * Returns a cancel function
   */
  setTimeout(fn: () => void, delayMs: number): () => void;

  /**
   * Schedule a function to run repeatedly at an interval
   * Returns a cancel function
   */
  setInterval(fn: () => void, intervalMs: number): () => void;

  /**
   * Get the current timestamp in milliseconds
   */
  now(): number;

  /**
   * Schedule a function to run on the next tick
   * Returns a cancel function
   */
  nextTick(fn: () => void): () => void;

  /**
   * Subscribe to visibility changes (for pausing sync when tab is hidden)
   */
  onVisibilityChange(callback: (visible: boolean) => void): () => void;

  /**
   * Check if the page is currently visible
   */
  isVisible(): boolean;
}

// Timing constants
export const SYNC_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes
export const MIN_SYNC_INTERVAL_MS = 30 * 1000; // 30 seconds minimum between syncs
export const VISIBILITY_SYNC_DELAY_MS = 1000; // 1 second delay after becoming visible
