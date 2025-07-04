import { Article } from './Article';

const STORAGE_KEY_PREFIX = 'readlater_article_';
const STORAGE_INDEX_KEY = 'readlater_offline_articles';

export interface OfflineArticleEntry {
  url: string;
  title: string;
  downloadedAt: number;
}

// Get all offline articles index
export const getOfflineArticles = (): OfflineArticleEntry[] => {
  try {
    const stored = localStorage.getItem(STORAGE_INDEX_KEY);
    return stored ? JSON.parse(stored) : [];
  } catch (error) {
    console.error('Error reading offline articles index:', error);
    return [];
  }
};

// Check if an article is stored offline
export const isArticleOffline = (url: string): boolean => {
  const articles = getOfflineArticles();
  return articles.some(article => article.url === url);
};

// Store an article offline
export const storeArticleOffline = (article: Article): void => {
  try {
    // Store the article data
    const articleKey = STORAGE_KEY_PREFIX + encodeURIComponent(article.url);
    localStorage.setItem(articleKey, JSON.stringify(article));

    // Update the index
    const articles = getOfflineArticles();
    const existingIndex = articles.findIndex(a => a.url === article.url);
    
    const entry: OfflineArticleEntry = {
      url: article.url,
      title: article.title,
      downloadedAt: Date.now()
    };

    if (existingIndex >= 0) {
      articles[existingIndex] = entry;
    } else {
      articles.push(entry);
    }

    localStorage.setItem(STORAGE_INDEX_KEY, JSON.stringify(articles));
  } catch (error) {
    console.error('Error storing article offline:', error);
    throw new Error('Failed to store article offline. Your device may be out of storage space.');
  }
};

// Remove an article from offline storage
export const removeArticleOffline = (url: string): void => {
  try {
    // Remove the article data
    const articleKey = STORAGE_KEY_PREFIX + encodeURIComponent(url);
    localStorage.removeItem(articleKey);

    // Update the index
    const articles = getOfflineArticles();
    const filteredArticles = articles.filter(article => article.url !== url);
    localStorage.setItem(STORAGE_INDEX_KEY, JSON.stringify(filteredArticles));
  } catch (error) {
    console.error('Error removing article from offline storage:', error);
  }
};

// Get an article from offline storage
export const getOfflineArticle = (url: string): Article | null => {
  try {
    const articleKey = STORAGE_KEY_PREFIX + encodeURIComponent(url);
    const stored = localStorage.getItem(articleKey);
    return stored ? JSON.parse(stored) : null;
  } catch (error) {
    console.error('Error reading offline article:', error);
    return null;
  }
};

// Toggle article offline status
export const toggleArticleOffline = (article: Article): boolean => {
  const isCurrentlyOffline = isArticleOffline(article.url);
  
  if (isCurrentlyOffline) {
    removeArticleOffline(article.url);
    return false;
  } else {
    storeArticleOffline(article);
    return true;
  }
};

// Store multiple articles offline efficiently
export const storeBatchArticlesOffline = (articles: Article[]): void => {
  try {
    const existingIndex = getOfflineArticles();
    const updatedIndex = [...existingIndex];
    
    articles.forEach(article => {
      // Store the article data
      const articleKey = STORAGE_KEY_PREFIX + encodeURIComponent(article.url);
      localStorage.setItem(articleKey, JSON.stringify(article));

      // Update index entry
      const existingEntryIndex = updatedIndex.findIndex(a => a.url === article.url);
      const entry: OfflineArticleEntry = {
        url: article.url,
        title: article.title,
        downloadedAt: Date.now()
      };

      if (existingEntryIndex >= 0) {
        updatedIndex[existingEntryIndex] = entry;
      } else {
        updatedIndex.push(entry);
      }
    });

    // Single index update for all articles
    localStorage.setItem(STORAGE_INDEX_KEY, JSON.stringify(updatedIndex));
  } catch (error) {
    console.error('Error storing articles offline:', error);
    throw new Error('Failed to store articles offline. Your device may be out of storage space.');
  }
};

// Clear all offline articles (for cleanup if needed)
export const clearAllOfflineArticles = (): void => {
  try {
    const articles = getOfflineArticles();
    articles.forEach(article => {
      const articleKey = STORAGE_KEY_PREFIX + encodeURIComponent(article.url);
      localStorage.removeItem(articleKey);
    });
    localStorage.removeItem(STORAGE_INDEX_KEY);
  } catch (error) {
    console.error('Error clearing offline articles:', error);
  }
};