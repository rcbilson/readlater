// Browser network adapter - implements NetworkPort using fetch API

import {
  NetworkPort,
  FetchOptions,
  DEFAULT_API_TIMEOUT,
  DEFAULT_DOWNLOAD_TIMEOUT,
  createTimeoutController,
  combineSignals,
} from '../ports/networkPort';
import { Article, ServerArticle } from '../types';

export class BrowserNetworkAdapter implements NetworkPort {
  private baseUrl: string;
  private onlineCallbacks: Set<(online: boolean) => void> = new Set();

  constructor(baseUrl: string = '') {
    this.baseUrl = baseUrl;
    this.setupOnlineListeners();
  }

  private setupOnlineListeners(): void {
    const notifyCallbacks = () => {
      const online = this.isOnline();
      this.onlineCallbacks.forEach((cb) => cb(online));
    };

    if (typeof window !== 'undefined') {
      window.addEventListener('online', notifyCallbacks);
      window.addEventListener('offline', notifyCallbacks);
    }
  }

  private async fetchWithTimeout<T>(
    url: string,
    options: RequestInit = {},
    fetchOptions: FetchOptions = {}
  ): Promise<T> {
    const timeoutMs = fetchOptions.timeoutMs ?? DEFAULT_API_TIMEOUT;
    const timeoutController = createTimeoutController(timeoutMs);
    const signal = combineSignals([timeoutController.signal, fetchOptions.signal]);

    const response = await fetch(url, {
      ...options,
      signal,
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    return response.json();
  }

  async fetchChanges(since: string, options?: FetchOptions): Promise<ServerArticle[]> {
    const url = `${this.baseUrl}/api/changes?since=${encodeURIComponent(since)}`;
    const data = await this.fetchWithTimeout<ServerArticle[] | null>(url, {}, options);

    if (!data || !Array.isArray(data)) {
      return [];
    }

    return data;
  }

  async markRead(url: string, options?: FetchOptions): Promise<void> {
    await this.fetchWithTimeout(
      `${this.baseUrl}/api/markRead`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url }),
      },
      options
    );
  }

  async setArchive(url: string, archived: boolean, options?: FetchOptions): Promise<void> {
    const apiUrl = `${this.baseUrl}/api/setArchive?url=${encodeURIComponent(url)}&setArchive=${archived}`;
    await this.fetchWithTimeout(apiUrl, { method: 'PUT' }, options);
  }

  async getRecents(count: number, options?: FetchOptions): Promise<ServerArticle[]> {
    const url = `${this.baseUrl}/api/recents?count=${count}`;
    const data = await this.fetchWithTimeout<ServerArticle[] | null>(url, {}, options);

    if (!data || !Array.isArray(data)) {
      return [];
    }

    return data;
  }

  async getArchive(count: number, options?: FetchOptions): Promise<ServerArticle[]> {
    const url = `${this.baseUrl}/api/archive?count=${count}`;
    const data = await this.fetchWithTimeout<ServerArticle[] | null>(url, {}, options);

    if (!data || !Array.isArray(data)) {
      return [];
    }

    return data;
  }

  async summarize(url: string, titleHint?: string, options?: FetchOptions): Promise<Article> {
    // Use longer timeout for article download
    const fetchOpts = {
      ...options,
      timeoutMs: options?.timeoutMs ?? DEFAULT_DOWNLOAD_TIMEOUT,
    };

    return this.fetchWithTimeout<Article>(
      `${this.baseUrl}/api/summarize`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url, titleHint }),
      },
      fetchOpts
    );
  }

  isOnline(): boolean {
    if (typeof navigator === 'undefined') return true;
    return navigator.onLine;
  }

  onOnlineChange(callback: (online: boolean) => void): () => void {
    this.onlineCallbacks.add(callback);
    return () => {
      this.onlineCallbacks.delete(callback);
    };
  }
}

// Default singleton instance
let defaultAdapter: BrowserNetworkAdapter | null = null;

export function getNetworkAdapter(): BrowserNetworkAdapter {
  if (!defaultAdapter) {
    defaultAdapter = new BrowserNetworkAdapter();
  }
  return defaultAdapter;
}
