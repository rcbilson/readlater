// Network port interface - abstraction over fetch/network operations

import { Article, ServerArticle } from '../types';

export interface NetworkPort {
  /**
   * Fetch changes from the server since the given timestamp
   */
  fetchChanges(since: string, options?: FetchOptions): Promise<ServerArticle[]>;

  /**
   * Mark an article as read on the server
   */
  markRead(url: string, options?: FetchOptions): Promise<void>;

  /**
   * Set the archive status of an article on the server
   */
  setArchive(url: string, archived: boolean, options?: FetchOptions): Promise<void>;

  /**
   * Get recent articles from the server
   */
  getRecents(count: number, options?: FetchOptions): Promise<ServerArticle[]>;

  /**
   * Get archived articles from the server
   */
  getArchive(count: number, options?: FetchOptions): Promise<ServerArticle[]>;

  /**
   * Download and summarize an article
   */
  summarize(url: string, titleHint?: string, options?: FetchOptions): Promise<Article>;

  /**
   * Check if the network is currently online
   */
  isOnline(): boolean;

  /**
   * Subscribe to online/offline status changes
   */
  onOnlineChange(callback: (online: boolean) => void): () => void;
}

export interface FetchOptions {
  timeoutMs?: number;
  signal?: AbortSignal;
}

export const DEFAULT_API_TIMEOUT = 10000; // 10 seconds
export const DEFAULT_DOWNLOAD_TIMEOUT = 30000; // 30 seconds

/**
 * Create an AbortController with a timeout
 */
export function createTimeoutController(timeoutMs: number): AbortController {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => {
    controller.abort(new Error(`Request timed out after ${timeoutMs}ms`));
  }, timeoutMs);

  // Clean up the timeout when the signal is aborted
  controller.signal.addEventListener('abort', () => {
    clearTimeout(timeoutId);
  });

  return controller;
}

/**
 * Combine multiple AbortSignals into one
 */
export function combineSignals(signals: (AbortSignal | undefined)[]): AbortSignal | undefined {
  const validSignals = signals.filter((s): s is AbortSignal => s !== undefined);
  if (validSignals.length === 0) return undefined;
  if (validSignals.length === 1) return validSignals[0];

  const controller = new AbortController();
  for (const signal of validSignals) {
    if (signal.aborted) {
      controller.abort(signal.reason);
      return controller.signal;
    }
    signal.addEventListener('abort', () => {
      controller.abort(signal.reason);
    });
  }
  return controller.signal;
}
