// Mock network adapter for testing

import { NetworkPort, FetchOptions } from '../../ports/networkPort';
import { Article, ServerArticle } from '../../types';

export interface MockNetworkState {
  online: boolean;
  articles: Map<string, ServerArticle>;
  articleContents: Map<string, string>;
  changes: ServerArticle[];
  failNextRequest: boolean;
  requestDelay: number;
  requestLog: MockRequest[];
}

export interface MockRequest {
  method: string;
  url: string;
  body?: unknown;
  timestamp: number;
}

export class MockNetworkAdapter implements NetworkPort {
  private state: MockNetworkState;
  private onlineCallbacks: Set<(online: boolean) => void> = new Set();

  constructor(initialState: Partial<MockNetworkState> = {}) {
    this.state = {
      online: true,
      articles: new Map(),
      articleContents: new Map(),
      changes: [],
      failNextRequest: false,
      requestDelay: 0,
      requestLog: [],
      ...initialState,
    };
  }

  // Test helpers
  setOnline(online: boolean): void {
    this.state.online = online;
    this.onlineCallbacks.forEach((cb) => cb(online));
  }

  setFailNextRequest(fail: boolean): void {
    this.state.failNextRequest = fail;
  }

  setRequestDelay(delayMs: number): void {
    this.state.requestDelay = delayMs;
  }

  addServerArticle(article: ServerArticle, contents?: string): void {
    this.state.articles.set(article.url, article);
    if (contents) {
      this.state.articleContents.set(article.url, contents);
    }
  }

  addChange(article: ServerArticle): void {
    this.state.changes.push(article);
  }

  clearChanges(): void {
    this.state.changes = [];
  }

  getRequestLog(): MockRequest[] {
    return [...this.state.requestLog];
  }

  clearRequestLog(): void {
    this.state.requestLog = [];
  }

  // NetworkPort implementation
  private async simulateRequest(): Promise<void> {
    if (this.state.requestDelay > 0) {
      await new Promise((resolve) => setTimeout(resolve, this.state.requestDelay));
    }

    if (this.state.failNextRequest) {
      this.state.failNextRequest = false;
      throw new Error('Mock network error');
    }

    if (!this.state.online) {
      throw new TypeError('Network error: offline');
    }
  }

  private logRequest(method: string, url: string, body?: unknown): void {
    this.state.requestLog.push({
      method,
      url,
      body,
      timestamp: Date.now(),
    });
  }

  async fetchChanges(since: string, _options?: FetchOptions): Promise<ServerArticle[]> {
    this.logRequest('GET', `/api/changes?since=${since}`);
    await this.simulateRequest();

    // Return changes since the timestamp
    const sinceTime = new Date(since).getTime();
    return this.state.changes.filter(
      (article) => new Date(article.lastAccess).getTime() > sinceTime
    );
  }

  async markRead(url: string, _options?: FetchOptions): Promise<void> {
    this.logRequest('POST', '/api/markRead', { url });
    await this.simulateRequest();

    const article = this.state.articles.get(url);
    if (article) {
      article.unread = false;
      article.lastAccess = new Date().toISOString();
    }
  }

  async setArchive(url: string, archived: boolean, _options?: FetchOptions): Promise<void> {
    this.logRequest('PUT', `/api/setArchive?url=${url}&setArchive=${archived}`);
    await this.simulateRequest();

    const article = this.state.articles.get(url);
    if (article) {
      article.archived = archived;
      article.lastAccess = new Date().toISOString();
    }
  }

  async getRecents(count: number, _options?: FetchOptions): Promise<ServerArticle[]> {
    this.logRequest('GET', `/api/recents?count=${count}`);
    await this.simulateRequest();

    return Array.from(this.state.articles.values())
      .filter((a) => !a.archived)
      .sort((a, b) => new Date(b.lastAccess).getTime() - new Date(a.lastAccess).getTime())
      .slice(0, count);
  }

  async getArchive(count: number, _options?: FetchOptions): Promise<ServerArticle[]> {
    this.logRequest('GET', `/api/archive?count=${count}`);
    await this.simulateRequest();

    return Array.from(this.state.articles.values())
      .filter((a) => a.archived)
      .sort((a, b) => new Date(b.lastAccess).getTime() - new Date(a.lastAccess).getTime())
      .slice(0, count);
  }

  async summarize(url: string, titleHint?: string, _options?: FetchOptions): Promise<Article> {
    this.logRequest('POST', '/api/summarize', { url, titleHint });
    await this.simulateRequest();

    const serverArticle = this.state.articles.get(url);
    const contents = this.state.articleContents.get(url) || 'Mock article contents';

    return {
      url,
      title: serverArticle?.title || titleHint || 'Mock Article',
      contents,
    };
  }

  isOnline(): boolean {
    return this.state.online;
  }

  onOnlineChange(callback: (online: boolean) => void): () => void {
    this.onlineCallbacks.add(callback);
    return () => {
      this.onlineCallbacks.delete(callback);
    };
  }
}

// Factory function for tests
export function createMockNetworkAdapter(
  initialState: Partial<MockNetworkState> = {}
): MockNetworkAdapter {
  return new MockNetworkAdapter(initialState);
}
