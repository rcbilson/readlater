import { 
  LocalArticle,
  getRecentArticles, 
  getArchivedArticles, 
  getArticle, 
  hasArticle, 
  storeArticle, 
  markArticleRead,
  // setArticleArchive,
  articleToLocal,
  localToArticle,
  searchArticles as dbSearchArticles
} from './database';
import { syncManager } from './syncManager';
import { Article } from './Article';

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
    const articles = await getRecentArticles(100); // Get more articles for full list
    return articles.map(localToOfflineEntry);
  } catch (error) {
    console.error('Error reading local articles:', error);
    return [];
  }
};

// Check if an article is stored locally
export const isArticleOffline = async (url: string): Promise<boolean> => {
  try {
    return await hasArticle(url);
  } catch (error) {
    console.error('Error checking if article is offline:', error);
    return false;
  }
};

// Store an article locally (with sync integration)
export const storeArticleOffline = async (article: Article, unread: boolean = true): Promise<void> => {
  try {
    const localArticle = articleToLocal(article, unread, false);
    await storeArticle(localArticle);
  } catch (error) {
    console.error('Error storing article offline:', error);
    throw new Error('Failed to store article offline. Your device may be out of storage space.');
  }
};

// Remove an article from local storage
export const removeArticleOffline = async (url: string): Promise<void> => {
  try {
    // In the new system, we don't actually remove articles, just mark them as not downloaded
    // This preserves sync state and metadata
    const article = await getArticle(url);
    if (article) {
      await storeArticle({
        ...article,
        contents: undefined,
        hasBody: false
      });
    }
  } catch (error) {
    console.error('Error removing article from local storage:', error);
  }
};

// Get an article from local storage
export const getOfflineArticle = async (url: string): Promise<Article | null> => {
  try {
    const localArticle = await getArticle(url);
    if (localArticle?.contents) {
      return localToArticle(localArticle);
    }
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
    await markArticleRead(url, unread);
    // Also trigger sync manager to queue this for server sync
    if (!unread) {
      await syncManager.markRead(url);
    }
  } catch (error) {
    console.error('Error updating local article unread status:', error);
  }
};

// Clear all local articles (for cleanup if needed)
export const clearAllOfflineArticles = async (): Promise<void> => {
  try {
    // This would need to be implemented in database.ts
    console.warn('clearAllOfflineArticles not fully implemented in new system');
  } catch (error) {
    console.error('Error clearing local articles:', error);
  }
};

// Enhanced APIs that take advantage of the new sync system

// Get recent articles (local-first)
export const getRecentArticlesLocalFirst = async (count: number = 50): Promise<LocalArticle[]> => {
  try {
    return await getRecentArticles(count);
  } catch (error) {
    console.error('Error fetching recent articles:', error);
    return [];
  }
};

// Get archived articles (local-first)
export const getArchivedArticlesLocalFirst = async (count: number = 50): Promise<LocalArticle[]> => {
  try {
    return await getArchivedArticles(count);
  } catch (error) {
    console.error('Error fetching archived articles:', error);
    return [];
  }
};

// Download and store article with sync
export const downloadArticle = async (url: string, titleHint?: string): Promise<Article> => {
  return await syncManager.downloadArticle(url, titleHint);
};

// Mark article as read with sync
export const markRead = async (articleUrl: string): Promise<void> => {
  await syncManager.markRead(articleUrl);
};

// Set archive status with sync
export const setArchive = async (articleUrl: string, archived: boolean): Promise<void> => {
  await syncManager.setArchive(articleUrl, archived);
};

// Search articles locally
export const searchArticles = async (query: string): Promise<LocalArticle[]> => {
  try {
    return await dbSearchArticles(query);
  } catch (error) {
    console.error('Error searching articles:', error);
    return [];
  }
};

// Initialize the data service (load initial data if needed)
export const initializeDataService = async (): Promise<void> => {
  try {
    await syncManager.loadInitialData();
  } catch (error) {
    console.error('Error initializing data service:', error);
  }
};

// Get sync status
export const getSyncStatus = () => {
  return syncManager.onStatusChange;
};


// Export sync manager for advanced usage
export { syncManager } from './syncManager';