import { Article } from './Article';
import {
  getSyncService,
  LocalArticle,
  SyncStatusCallback,
} from './sync';

// Interface matching the old localStorage API for easier migration
export interface OfflineArticleEntry {
  url: string;
  title: string;
  downloadedAt: number;
  unread: boolean;
}

// Convert LocalArticle to OfflineArticleEntry for backward compatibility
const localToOfflineEntry = (local: LocalArticle): OfflineArticleEntry => ({
  url: local.url,
  title: local.title,
  downloadedAt: local.downloadedAt,
  unread: local.unread
});

// Get all local articles (equivalent to getOfflineArticles)
export const getOfflineArticles = async (): Promise<OfflineArticleEntry[]> => {
  try {
    const articles = await getSyncService().getRecentArticles(100);
    return articles.map(localToOfflineEntry);
  } catch (error) {
    console.error('Error reading local articles:', error);
    return [];
  }
};

// Check if an article is stored locally
export const isArticleOffline = async (url: string): Promise<boolean> => {
  try {
    const article = await getSyncService().getArticle(url);
    return article !== undefined;
  } catch (error) {
    console.error('Error checking if article is offline:', error);
    return false;
  }
};

// Store an article locally (with sync integration)
export const storeArticleOffline = async (article: Article, _unread: boolean = true): Promise<void> => {
  try {
    // The sync service handles storage through downloadArticle
    await getSyncService().downloadArticle(article.url);
  } catch (error) {
    console.error('Error storing article offline:', error);
    throw new Error('Failed to store article offline. Your device may be out of storage space.');
  }
};

// Remove an article from local storage
export const removeArticleOffline = async (_url: string): Promise<void> => {
  try {
    // In the new system, we don't actually remove articles, just clear content
    // This is handled through the storage adapter
    console.warn('removeArticleOffline: Not fully implemented in new system');
  } catch (error) {
    console.error('Error removing article from local storage:', error);
  }
};

// Get an article from local storage
export const getOfflineArticle = async (url: string): Promise<Article | null> => {
  try {
    console.log('localDataService: getOfflineArticle called for:', url);

    const localArticle = await getSyncService().getArticle(url);
    console.log('localDataService: Result:', localArticle ? 'found' : 'not found');

    if (localArticle) {
      console.log('localDataService: Article details - hasBody:', localArticle.hasBody, 'contents length:', localArticle.contents?.length || 0);
    }

    if (localArticle?.contents) {
      return {
        url: localArticle.url,
        title: localArticle.title,
        contents: localArticle.contents,
        rendered: localArticle.contents
      };
    }

    console.log('localDataService: No contents found, returning null');
    return null;
  } catch (error) {
    console.error('Error reading local article:', error);
    return null;
  }
};

// Toggle article offline status
export const toggleArticleOffline = async (article: Article, unread: boolean = true): Promise<boolean> => {
  const isCurrentlyOffline = await isArticleOffline(article.url);

  if (isCurrentlyOffline) {
    await removeArticleOffline(article.url);
    return false;
  } else {
    await storeArticleOffline(article, unread);
    return true;
  }
};

// Update the unread status for a local article (with sync integration)
export const updateOfflineArticleUnreadStatus = async (url: string, unread: boolean): Promise<void> => {
  try {
    if (!unread) {
      await getSyncService().markRead(url);
    }
  } catch (error) {
    console.error('Error updating local article unread status:', error);
  }
};

// Clear all local articles (for cleanup if needed)
export const clearAllOfflineArticles = async (): Promise<void> => {
  try {
    console.warn('clearAllOfflineArticles not fully implemented in new system');
  } catch (error) {
    console.error('Error clearing local articles:', error);
  }
};

// Enhanced APIs that take advantage of the new sync system

// Get recent articles (local-first)
export const getRecentArticlesLocalFirst = async (count: number = 50): Promise<LocalArticle[]> => {
  try {
    return await getSyncService().getRecentArticles(count);
  } catch (error) {
    console.error('Error fetching recent articles:', error);
    return [];
  }
};

// Get archived articles (local-first)
export const getArchivedArticlesLocalFirst = async (count: number = 50): Promise<LocalArticle[]> => {
  try {
    return await getSyncService().getArchivedArticles(count);
  } catch (error) {
    console.error('Error fetching archived articles:', error);
    return [];
  }
};

// Download and store article with sync
export const downloadArticle = async (url: string, titleHint?: string): Promise<Article> => {
  const syncArticle = await getSyncService().downloadArticle(url, titleHint);
  if (!syncArticle.contents) {
    throw new Error('Downloaded article has no contents');
  }
  return {
    url: syncArticle.url,
    title: syncArticle.title,
    contents: syncArticle.contents,
  };
};

// Mark article as read with sync
export const markRead = async (articleUrl: string): Promise<void> => {
  await getSyncService().markRead(articleUrl);
};

// Set archive status with sync
export const setArchive = async (articleUrl: string, archived: boolean): Promise<void> => {
  await getSyncService().setArchive(articleUrl, archived);
};

// Search articles locally
export const searchArticles = async (query: string): Promise<LocalArticle[]> => {
  try {
    return await getSyncService().searchArticles(query);
  } catch (error) {
    console.error('Error searching articles:', error);
    return [];
  }
};

// Initialize the data service (load initial data if needed)
export const initializeDataService = async (): Promise<void> => {
  try {
    await getSyncService().initialize();
  } catch (error) {
    console.error('Error initializing data service:', error);
  }
};

// Get sync status
export const getSyncStatus = (): ((callback: SyncStatusCallback) => () => void) => {
  return (callback: SyncStatusCallback) => getSyncService().onStatusChange(callback);
};

// Export for backward compatibility
export { getSyncService as syncManager } from './sync';

// Re-export LocalArticle type
export type { LocalArticle } from './sync';
