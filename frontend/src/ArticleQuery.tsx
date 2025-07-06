// A react component that has an editable text area for a article url
// next to a button with a refresh icon. When the button is clicked,
// the article url is fetched and the text area below the url is updated
// with the article contents.
import React, { useContext, useState, useEffect } from "react";
import { useNavigate } from 'react-router-dom';
import axios, { AxiosError } from "axios";
import { useQuery } from '@tanstack/react-query'
import { AuthContext } from "@/components/ui/auth-context";
import { LuBookmark, LuBookmarkCheck, LuDownload, LuLoader } from "react-icons/lu";
import { useToggleArchive } from "./useToggleArchive";
import { isArticleOffline, toggleArticleOffline, getOfflineArticles, storeArticleOffline } from "./localStorage";
import { Article } from "./Article";

type ArticleEntry = {
  title: string;
  url: string;
  hasBody: boolean;
  unread: boolean;
  archived: boolean;
}

interface Props {
  queryPath: string;
}

const ArticleQuery: React.FC<Props> = ({queryPath}: Props) => {
  const navigate = useNavigate();
  const { token, resetAuth } = useContext(AuthContext);
  const toggleArchive = useToggleArchive();
  const [offlineArticles, setOfflineArticles] = useState<Set<string>>(new Set());
  const [autoDownloading, setAutoDownloading] = useState<Set<string>>(new Set());

  const fetchQuery = (queryPath: string) => {
    return async () => {
      try {
        console.log("fetching " + queryPath);
        const response = await axios.get<Array<ArticleEntry>>(queryPath, {
          headers: token ? { Authorization: `Bearer ${token}` } : {},
        });
        return response.data;
      } catch (error) {
        if (error instanceof AxiosError && error.response?.status === 401) {
          resetAuth();
        } else {
          throw error;
        }
      }
    };
  };

  const {isError, data, error} = useQuery({
    queryKey: ['articleList', queryPath],
    queryFn: fetchQuery(queryPath),
    enabled: navigator.onLine, // Only fetch when online
  });
  
  // Convert offline articles to ArticleEntry format
  const getOfflineArticleEntries = (): ArticleEntry[] => {
    return getOfflineArticles().map(offlineArticle => ({
      title: offlineArticle.title,
      url: offlineArticle.url,
      hasBody: true, // Offline articles always have body
      unread: offlineArticle.unread ?? true,  // Use stored unread status, default to true for backward compatibility
      archived: false // Offline articles are not archived
    }));
  };
  
  // Use offline articles when offline, otherwise use fetched data
  const recents = navigator.onLine ? data : getOfflineArticleEntries();

  // Reset auto-download state when query changes
  useEffect(() => {
    setAutoDownloading(new Set());
  }, [queryPath]);

  // Initialize offline articles state
  useEffect(() => {
    if (recents) {
      const offlineSet = new Set<string>();
      recents.forEach(article => {
        if (isArticleOffline(article.url)) {
          offlineSet.add(article.url);
        }
      });
      setOfflineArticles(offlineSet);
    }
  }, [recents]);

  // Auto-download all recent articles that aren't already offline
  // Only auto-download for the recent page, not for archive or other pages
  useEffect(() => {
    if (!recents || !navigator.onLine || !queryPath.includes('/api/recents')) {
      return;
    }

    const articlesToDownload = recents.filter(article => 
      !isArticleOffline(article.url) && !autoDownloading.has(article.url)
    );

    if (articlesToDownload.length === 0) {
      return;
    }

    const downloadArticles = async () => {
      const downloadingUrls = new Set(articlesToDownload.map(a => a.url));
      setAutoDownloading(downloadingUrls);

      const downloadPromises = articlesToDownload.map(async (entry) => {
        try {
          console.log("Auto-downloading:", entry.url);
          const response = await axios.post<Article>("/api/summarize", { url: entry.url }, {
            headers: token ? { Authorization: `Bearer ${token}` } : {},
          });
          return response.data;
        } catch (error) {
          console.error('Error auto-downloading article:', entry.url, error);
          if (error instanceof AxiosError && error.response?.status === 401) {
            resetAuth();
          }
          return null;
        }
      });

      try {
        const downloadedArticles = await Promise.all(downloadPromises);
        const successfulDownloads = downloadedArticles.filter((article): article is Article => article !== null);
        
        if (successfulDownloads.length > 0) {
          // Store each article with its original unread status
          successfulDownloads.forEach(article => {
            const originalEntry = articlesToDownload.find(entry => entry.url === article.url);
            const unreadStatus = originalEntry?.unread ?? true;
            storeArticleOffline(article, unreadStatus);
          });
          
          setOfflineArticles(prev => {
            const newSet = new Set(prev);
            successfulDownloads.forEach(article => newSet.add(article.url));
            return newSet;
          });
        }
      } catch (error) {
        console.error('Error storing batch articles:', error);
      } finally {
        setAutoDownloading(new Set());
      }
    };

    downloadArticles();
  }, [recents, token, resetAuth, autoDownloading, queryPath]);

  const handleArticleClick = (entry: ArticleEntry) => {
    return () => {
      console.log(entry);
      const encodedUrl = encodeURIComponent(entry.url);
      if (entry.hasBody) {
        navigate("/show/" + encodedUrl);
      } else {
        window.open(entry.url, "_blank");
      }
    }
  };

  const handleArchiveClick = (entry: ArticleEntry) => {
    return async (e: React.MouseEvent) => {
      e.stopPropagation(); // Prevent triggering article click
      
      const willBeArchived = !entry.archived;
      
      // If archiving and article is currently offline, remove it from UI state
      if (willBeArchived && offlineArticles.has(entry.url)) {
        setOfflineArticles(prev => {
          const newSet = new Set(prev);
          newSet.delete(entry.url);
          return newSet;
        });
      }
      
      await toggleArchive(entry.url, willBeArchived);
    }
  };

  const handleDownloadClick = (entry: ArticleEntry) => {
    return async (e: React.MouseEvent) => {
      e.stopPropagation(); // Prevent triggering article click
      
      // Prevent manual download if auto-downloading
      if (autoDownloading.has(entry.url)) {
        return;
      }
      
      const isCurrentlyOffline = offlineArticles.has(entry.url);
      
      if (isCurrentlyOffline) {
        // Remove from offline storage
        toggleArticleOffline({ url: entry.url, title: entry.title, contents: '' });
        setOfflineArticles(prev => {
          const newSet = new Set(prev);
          newSet.delete(entry.url);
          return newSet;
        });
      } else {
        // Download article first, then store offline
        try {
          console.log("downloading " + entry.url);
          const response = await axios.post<Article>("/api/summarize", { url: entry.url }, {
            headers: token ? { Authorization: `Bearer ${token}` } : {},
          });
          const article = response.data;
          
          // Store offline with current unread status
          toggleArticleOffline(article, entry.unread);
          setOfflineArticles(prev => new Set([...prev, entry.url]));
        } catch (error) {
          console.error('Error downloading article:', error);
          if (error instanceof AxiosError && error.response?.status === 401) {
            resetAuth();
          }
          // Don't update UI state if download failed
        }
      }
    }
  };

  if (isError && navigator.onLine) {
    return <div>An error occurred: {error.message}</div>
  }
  
  // Show offline indicator when offline
  if (!navigator.onLine) {
    return (
      <div>
        <div className="offline-indicator" style={{ padding: '10px', background: '#f0f0f0', marginBottom: '10px' }}>
          📱 Offline - Showing downloaded articles
        </div>
        <div id="articleList">
          {recents && recents.map((recent) =>
            <div className={`articleEntry ${recent.unread ? 'unread' : ''}`} key={recent.url} onClick={handleArticleClick(recent)}>
              <div className="articleContent">
                <div className="title">{recent.title}</div>
                <div className="url">{new URL(recent.url).hostname}</div>
              </div>
              <div className="articleButtons">
                <div className={`downloadButton downloaded`}>
                  <LuDownload />
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div id="articleList">
      {recents && recents.map((recent) =>
        <div className={`articleEntry ${recent.unread ? 'unread' : ''}`} key={recent.url} onClick={handleArticleClick(recent)}>
          <div className="articleContent">
            <div className="title">{recent.title}</div>
            <div className="url">{new URL(recent.url).hostname}</div>
          </div>
          <div className="articleButtons">
            <div className={`downloadButton ${offlineArticles.has(recent.url) ? 'downloaded' : ''} ${autoDownloading.has(recent.url) ? 'downloading' : ''}`} onClick={handleDownloadClick(recent)}>
              {autoDownloading.has(recent.url) ? <LuLoader className="animate-spin" /> : <LuDownload />}
            </div>
            <div className="archiveButton" onClick={handleArchiveClick(recent)}>
              {recent.archived ? <LuBookmarkCheck /> : <LuBookmark />}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ArticleQuery;
