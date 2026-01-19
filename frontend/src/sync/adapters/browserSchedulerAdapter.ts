// Browser scheduler adapter - implements SchedulerPort using browser APIs

import { SchedulerPort } from '../ports/schedulerPort';

export class BrowserSchedulerAdapter implements SchedulerPort {
  private visibilityCallbacks: Set<(visible: boolean) => void> = new Set();

  constructor() {
    this.setupVisibilityListener();
  }

  private setupVisibilityListener(): void {
    if (typeof document === 'undefined') return;

    document.addEventListener('visibilitychange', () => {
      const visible = this.isVisible();
      this.visibilityCallbacks.forEach((cb) => cb(visible));
    });
  }

  setTimeout(fn: () => void, delayMs: number): () => void {
    const id = window.setTimeout(fn, delayMs);
    return () => window.clearTimeout(id);
  }

  setInterval(fn: () => void, intervalMs: number): () => void {
    const id = window.setInterval(fn, intervalMs);
    return () => window.clearInterval(id);
  }

  now(): number {
    return Date.now();
  }

  nextTick(fn: () => void): () => void {
    // Use queueMicrotask for immediate next-tick execution
    let cancelled = false;
    queueMicrotask(() => {
      if (!cancelled) fn();
    });
    return () => {
      cancelled = true;
    };
  }

  onVisibilityChange(callback: (visible: boolean) => void): () => void {
    this.visibilityCallbacks.add(callback);
    return () => {
      this.visibilityCallbacks.delete(callback);
    };
  }

  isVisible(): boolean {
    if (typeof document === 'undefined') return true;
    return document.visibilityState === 'visible';
  }
}

// Default singleton instance
let defaultAdapter: BrowserSchedulerAdapter | null = null;

export function getSchedulerAdapter(): BrowserSchedulerAdapter {
  if (!defaultAdapter) {
    defaultAdapter = new BrowserSchedulerAdapter();
  }
  return defaultAdapter;
}
