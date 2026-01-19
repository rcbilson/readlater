// Three-way merge conflict resolution

import {
  LocalArticle,
  ServerArticle,
  MergeResult,
  FieldChange,
  SyncQueueItem,
} from '../types';

/**
 * Convert a ServerArticle to LocalArticle format for comparison
 */
export function serverToLocal(server: ServerArticle): LocalArticle {
  return {
    url: server.url,
    title: server.title,
    hasBody: server.hasBody,
    unread: server.unread,
    archived: server.archived,
    downloadedAt: Date.now(),
    lastAccess: new Date(server.lastAccess).getTime(),
  };
}

/**
 * Three-way merge algorithm for conflict resolution.
 *
 * 1. Compare local vs lastKnownServerState to detect local changes
 * 2. Compare server vs lastKnownServerState to detect server changes
 * 3. If only one side changed: accept that change
 * 4. If both changed: use semantic rules
 *
 * Semantic rules:
 * - "read wins": if either side marked as read, result is read
 * - "archived wins": if either side marked as archived, result is archived
 */
export function threeWayMerge(
  local: LocalArticle,
  server: ServerArticle,
  base: LocalArticle | ServerArticle | undefined
): MergeResult {
  const changes: FieldChange[] = [];
  let needsPush = false;

  // If no base (first sync), server wins for metadata
  const baseState = base || server;

  // Detect what changed locally vs base
  const localChangedUnread = local.unread !== baseState.unread;
  const localChangedArchived = local.archived !== baseState.archived;

  // Detect what changed on server vs base
  const serverChangedUnread = server.unread !== baseState.unread;
  const serverChangedArchived = server.archived !== baseState.archived;

  // Start with local as the base for the result
  const result: LocalArticle = { ...local };

  // Resolve unread status
  if (localChangedUnread && !serverChangedUnread) {
    // Only local changed - keep local value, need to push
    needsPush = true;
    changes.push({
      field: 'unread',
      from: server.unread,
      to: local.unread,
      source: 'local',
    });
  } else if (!localChangedUnread && serverChangedUnread) {
    // Only server changed - accept server value
    result.unread = server.unread;
    changes.push({
      field: 'unread',
      from: local.unread,
      to: server.unread,
      source: 'server',
    });
  } else if (localChangedUnread && serverChangedUnread) {
    // Both changed - "read wins" (unread=false wins)
    if (!local.unread || !server.unread) {
      result.unread = false;
      if (local.unread && !server.unread) {
        changes.push({
          field: 'unread',
          from: local.unread,
          to: false,
          source: 'server',
        });
      } else if (!local.unread && server.unread) {
        needsPush = true;
        changes.push({
          field: 'unread',
          from: server.unread,
          to: false,
          source: 'local',
        });
      }
    }
  }
  // If neither changed, keep current value

  // Resolve archived status
  if (localChangedArchived && !serverChangedArchived) {
    // Only local changed - keep local value, need to push
    needsPush = true;
    changes.push({
      field: 'archived',
      from: server.archived,
      to: local.archived,
      source: 'local',
    });
  } else if (!localChangedArchived && serverChangedArchived) {
    // Only server changed - accept server value
    result.archived = server.archived;
    changes.push({
      field: 'archived',
      from: local.archived,
      to: server.archived,
      source: 'server',
    });
  } else if (localChangedArchived && serverChangedArchived) {
    // Both changed - "archived wins" (archived=true wins)
    if (local.archived || server.archived) {
      result.archived = true;
      if (!local.archived && server.archived) {
        changes.push({
          field: 'archived',
          from: local.archived,
          to: true,
          source: 'server',
        });
      } else if (local.archived && !server.archived) {
        needsPush = true;
        changes.push({
          field: 'archived',
          from: server.archived,
          to: true,
          source: 'local',
        });
      }
    }
  }
  // If neither changed, keep current value

  // Always update lastAccess from server (server is authoritative for this)
  const serverLastAccess = new Date(server.lastAccess).getTime();
  if (result.lastAccess !== serverLastAccess) {
    result.lastAccess = serverLastAccess;
  }

  // Update title from server if changed
  if (server.title !== local.title) {
    result.title = server.title;
    changes.push({
      field: 'title',
      from: local.title,
      to: server.title,
      source: 'server',
    });
  }

  // Store server state as new baseline for future merges
  result.lastKnownServerState = serverToLocal(server);

  return {
    article: result,
    needsPush,
    changes,
  };
}

/**
 * Create sync queue items for local changes that need to be pushed
 */
export function createPushOperations(
  local: LocalArticle,
  base: LocalArticle | undefined
): SyncQueueItem[] {
  const operations: SyncQueueItem[] = [];

  if (!base) {
    // No base means this is a new article, nothing to push
    return operations;
  }

  // Check for unread changes
  if (local.unread !== base.unread && !local.unread) {
    operations.push({
      url: local.url,
      operation: 'markRead',
      data: { unread: false },
      timestamp: Date.now(),
      retryCount: 0,
    });
  }

  // Check for archive changes
  if (local.archived !== base.archived) {
    operations.push({
      url: local.url,
      operation: 'setArchive',
      data: { archived: local.archived },
      timestamp: Date.now(),
      retryCount: 0,
    });
  }

  return operations;
}

/**
 * Merge a new server article into local storage
 * Returns the article to store and whether we need to push changes back
 */
export function mergeServerArticle(
  serverArticle: ServerArticle,
  localArticle: LocalArticle | undefined
): MergeResult {
  if (!localArticle) {
    // New article from server - just store it
    const article = serverToLocal(serverArticle);
    article.lastKnownServerState = serverToLocal(serverArticle);
    return {
      article,
      needsPush: false,
      changes: [],
    };
  }

  // Use three-way merge
  return threeWayMerge(
    localArticle,
    serverArticle,
    localArticle.lastKnownServerState
  );
}
