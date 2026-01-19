import { describe, it, expect } from 'vitest';
import {
  serverToLocal,
  threeWayMerge,
  createPushOperations,
  mergeServerArticle,
} from './conflictResolver';
import { LocalArticle, ServerArticle } from '../types';

describe('conflictResolver', () => {
  const baseServerArticle: ServerArticle = {
    url: 'https://example.com/article',
    title: 'Test Article',
    hasBody: true,
    unread: true,
    archived: false,
    lastAccess: '2024-01-01T00:00:00Z',
  };

  const baseLocalArticle: LocalArticle = {
    url: 'https://example.com/article',
    title: 'Test Article',
    hasBody: true,
    unread: true,
    archived: false,
    downloadedAt: 1704067200000,
    lastAccess: 1704067200000,
  };

  describe('serverToLocal', () => {
    it('converts ServerArticle to LocalArticle', () => {
      const result = serverToLocal(baseServerArticle);

      expect(result.url).toBe(baseServerArticle.url);
      expect(result.title).toBe(baseServerArticle.title);
      expect(result.hasBody).toBe(baseServerArticle.hasBody);
      expect(result.unread).toBe(baseServerArticle.unread);
      expect(result.archived).toBe(baseServerArticle.archived);
      expect(result.lastAccess).toBe(new Date(baseServerArticle.lastAccess).getTime());
    });
  });

  describe('threeWayMerge', () => {
    it('accepts server changes when local has not changed', () => {
      const local: LocalArticle = {
        ...baseLocalArticle,
        unread: true,
        lastKnownServerState: { ...baseLocalArticle, unread: true },
      };
      const server: ServerArticle = {
        ...baseServerArticle,
        unread: false, // Server changed to read
      };

      const result = threeWayMerge(local, server, local.lastKnownServerState);

      expect(result.article.unread).toBe(false); // Accept server change
      expect(result.needsPush).toBe(false);
      expect(result.changes).toHaveLength(1);
      expect(result.changes[0]).toEqual({
        field: 'unread',
        from: true,
        to: false,
        source: 'server',
      });
    });

    it('keeps local changes when server has not changed', () => {
      const base: LocalArticle = { ...baseLocalArticle, unread: true };
      const local: LocalArticle = {
        ...baseLocalArticle,
        unread: false, // Local changed to read
        lastKnownServerState: base,
      };
      const server: ServerArticle = {
        ...baseServerArticle,
        unread: true, // Server unchanged
      };

      const result = threeWayMerge(local, server, base);

      expect(result.article.unread).toBe(false); // Keep local change
      expect(result.needsPush).toBe(true);
      expect(result.changes).toHaveLength(1);
      expect(result.changes[0]).toEqual({
        field: 'unread',
        from: true,
        to: false,
        source: 'local',
      });
    });

    it('applies "read wins" when both changed unread status', () => {
      const base: LocalArticle = { ...baseLocalArticle, unread: true };
      const local: LocalArticle = {
        ...baseLocalArticle,
        unread: false, // Local marked as read
        lastKnownServerState: base,
      };
      const server: ServerArticle = {
        ...baseServerArticle,
        unread: false, // Server also marked as read
      };

      const result = threeWayMerge(local, server, base);

      expect(result.article.unread).toBe(false); // Both read, stays read
    });

    it('applies "archived wins" when both changed archive status', () => {
      const base: LocalArticle = { ...baseLocalArticle, archived: false };
      const local: LocalArticle = {
        ...baseLocalArticle,
        archived: true, // Local archived
        lastKnownServerState: base,
      };
      const server: ServerArticle = {
        ...baseServerArticle,
        archived: false, // Server still unarchived
      };

      const result = threeWayMerge(local, server, base);

      expect(result.article.archived).toBe(true); // Archived wins
      expect(result.needsPush).toBe(true);
    });

    it('updates title from server', () => {
      const local: LocalArticle = {
        ...baseLocalArticle,
        title: 'Old Title',
      };
      const server: ServerArticle = {
        ...baseServerArticle,
        title: 'New Title',
      };

      const result = threeWayMerge(local, server, undefined);

      expect(result.article.title).toBe('New Title');
      expect(result.changes).toContainEqual({
        field: 'title',
        from: 'Old Title',
        to: 'New Title',
        source: 'server',
      });
    });

    it('stores server state as lastKnownServerState', () => {
      const local: LocalArticle = { ...baseLocalArticle };
      const server: ServerArticle = { ...baseServerArticle };

      const result = threeWayMerge(local, server, undefined);

      expect(result.article.lastKnownServerState).toBeDefined();
      expect(result.article.lastKnownServerState?.url).toBe(server.url);
    });
  });

  describe('createPushOperations', () => {
    it('returns empty array when no base', () => {
      const local: LocalArticle = { ...baseLocalArticle };
      const result = createPushOperations(local, undefined);
      expect(result).toHaveLength(0);
    });

    it('creates markRead operation when unread changed to false', () => {
      const base: LocalArticle = { ...baseLocalArticle, unread: true };
      const local: LocalArticle = { ...baseLocalArticle, unread: false };

      const result = createPushOperations(local, base);

      expect(result).toHaveLength(1);
      expect(result[0].operation).toBe('markRead');
      expect(result[0].url).toBe(local.url);
    });

    it('creates setArchive operation when archived changed', () => {
      const base: LocalArticle = { ...baseLocalArticle, archived: false };
      const local: LocalArticle = { ...baseLocalArticle, archived: true };

      const result = createPushOperations(local, base);

      expect(result).toHaveLength(1);
      expect(result[0].operation).toBe('setArchive');
      expect(result[0].data).toEqual({ archived: true });
    });

    it('creates multiple operations when multiple fields changed', () => {
      const base: LocalArticle = { ...baseLocalArticle, unread: true, archived: false };
      const local: LocalArticle = { ...baseLocalArticle, unread: false, archived: true };

      const result = createPushOperations(local, base);

      expect(result).toHaveLength(2);
    });
  });

  describe('mergeServerArticle', () => {
    it('creates new article when no local exists', () => {
      const server: ServerArticle = { ...baseServerArticle };

      const result = mergeServerArticle(server, undefined);

      expect(result.article.url).toBe(server.url);
      expect(result.article.title).toBe(server.title);
      expect(result.article.lastKnownServerState).toBeDefined();
      expect(result.needsPush).toBe(false);
      expect(result.changes).toHaveLength(0);
    });

    it('merges with existing local article', () => {
      const local: LocalArticle = {
        ...baseLocalArticle,
        unread: false, // Local marked as read
        lastKnownServerState: { ...baseLocalArticle, unread: true },
      };
      const server: ServerArticle = {
        ...baseServerArticle,
        unread: true, // Server still unread
      };

      const result = mergeServerArticle(server, local);

      expect(result.article.unread).toBe(false); // Local change preserved
      expect(result.needsPush).toBe(true);
    });
  });
});
