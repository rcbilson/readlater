// A react component that displays recent articles using local-first architecture
import React, { useState, useEffect, useRef, useCallback } from "react";
import { useNavigate } from 'react-router-dom';
import { LuBookmark, LuDownload } from "react-icons/lu";

import { getSyncService, LocalArticle, getHostname, SyncState } from "./sync";
import { useNetworkStatus } from "./useNetworkStatus";
import { useColorModeValue } from "@/components/ui/color-mode-hooks";
import { useMarkAsRead } from "./useMarkAsRead";

const RecentPage: React.FC = () => {
  const navigate = useNavigate();
  const isOnline = useNetworkStatus();
  const markAsRead = useMarkAsRead();
  const [articles, setArticles] = useState<LocalArticle[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncState, setSyncState] = useState<SyncState>('idle');

  const truncateTitle = (title: string, maxLength: number = 80): string => {
    if (title.length <= maxLength) {
      return title;
    }
    return title.substring(0, maxLength) + '...';
  };

  // Color mode aware colors
  const mutedTextColor = useColorModeValue('#666666', '#cccccc');

  // Load articles from local database
  useEffect(() => {
    const loadArticles = async () => {
      try {
        console.log('RecentPage: Loading articles from local database...');
        const syncService = getSyncService();
        const localArticles = await syncService.getRecentArticles(50);
        console.log('RecentPage: Retrieved', localArticles.length, 'articles from database');
        const unarchivedArticles = localArticles.filter(a => !a.archived);
        console.log('RecentPage: Filtered to', unarchivedArticles.length, 'unarchived articles');
        setArticles(unarchivedArticles);
        setLoading(false);
      } catch (error) {
        console.error('RecentPage: Error loading articles:', error);
        setLoading(false);
      }
    };

    loadArticles();
  }, []);

  // Subscribe to sync status
  useEffect(() => {
    const syncService = getSyncService();
    const unsubscribe = syncService.onStatusChange((status) => {
      setSyncState(status.state);
    });
    return unsubscribe;
  }, []);

  // Trigger sync when coming online
  useEffect(() => {
    if (isOnline) {
      const syncService = getSyncService();
      syncService.requestSync().catch(console.error);
    }
  }, [isOnline]);

  // Track previous sync state to detect when sync completes
  const prevSyncState = useRef(syncState);

  // Refresh articles function (memoized to avoid recreation)
  const refreshArticles = useCallback(async () => {
    console.log('RecentPage: Refreshing articles...');
    const syncService = getSyncService();
    const localArticles = await syncService.getRecentArticles(50);
    const unarchivedArticles = localArticles.filter(a => !a.archived);
    console.log('RecentPage: Refreshed to', unarchivedArticles.length, 'unarchived articles');
    setArticles(unarchivedArticles);
  }, []);

  // Refresh articles only when sync completes (transitions from syncing to idle)
  useEffect(() => {
    const wassyncing = prevSyncState.current === 'syncing';
    const isNowIdle = syncState === 'idle';
    prevSyncState.current = syncState;

    if (wassyncing && isNowIdle) {
      console.log('RecentPage: Sync completed, refreshing articles');
      refreshArticles().catch(console.error);
      }
  }, [syncState, refreshArticles]);

  // Periodic refresh to catch any missed sync updates
  // Uses a ref to access current articles without causing effect recreation
  const articlesRef = useRef(articles);
  articlesRef.current = articles;

  useEffect(() => {
    const interval = setInterval(async () => {
      console.log('RecentPage: Periodic refresh check...');
      const syncService = getSyncService();
      const localArticles = await syncService.getRecentArticles(50);
      const unarchivedArticles = localArticles.filter(a => !a.archived);
      const currentArticles = articlesRef.current;

      // Only update if the article count or URLs have changed
      if (unarchivedArticles.length !== currentArticles.length ||
          !unarchivedArticles.every((article, index) =>
            currentArticles[index] && currentArticles[index].url === article.url
          )) {
        console.log('RecentPage: Detected changes during periodic refresh, updating...');
        setArticles(unarchivedArticles);
      }
    }, 10000); // Check every 10 seconds

    return () => clearInterval(interval);
  }, []);

  const handleArticleClick = (article: LocalArticle) => {
    return async () => {
      // Mark article as read regardless of whether it has body or not
      await markAsRead(article.url);

      const encodedUrl = encodeURIComponent(article.url);
      if (article.hasBody) {
        navigate("/show/" + encodedUrl);
      } else if (isOnline) {
        window.open(article.url, "_blank");
      }
      // When offline without body, do nothing (article is not available)
    }
  };

  const handleArchiveClick = (article: LocalArticle) => {
    return async (e: React.MouseEvent) => {
      e.stopPropagation();

      try {
        const syncService = getSyncService();
        await syncService.setArchive(article.url, true);
        // Remove from UI immediately (optimistic update)
        setArticles(prev => prev.filter(a => a.url !== article.url));
      } catch (error) {
        console.error('Error archiving article:', error);
      }
    }
  };

  const handleDownloadClick = (article: LocalArticle) => {
    return async (e: React.MouseEvent) => {
      e.stopPropagation();

      // When offline: don't allow downloading (requires network)
      // and don't allow removing content (would lose offline access)
      if (!isOnline) return;

      try {
        const syncService = getSyncService();
        if (article.hasBody) {
          // Remove content from IndexedDB
          await syncService.removeContent(article.url);
          // Update UI (optimistic update after successful removal)
          setArticles(prev => prev.map(a =>
            a.url === article.url ? { ...a, hasBody: false, contents: undefined } : a
          ));
        } else {
          // Download content
          await syncService.downloadArticle(article.url);
          // Update UI
          setArticles(prev => prev.map(a =>
            a.url === article.url ? { ...a, hasBody: true } : a
          ));
        }
      } catch (error) {
        console.error('Error toggling download:', error);
      }
    }
  };

  if (loading) {
    return (
      <div style={{ padding: '2em', textAlign: 'center' }}>
        Loading articles...
      </div>
    );
  }

  return (
    <div id="recentContainer">
      {/* Articles List */}
      <div id="articleList">
        {articles.length === 0 ? (
          <div style={{ padding: '2em', textAlign: 'center', color: mutedTextColor }}>
            {isOnline ? (
              <>
                No recent articles found.
                <br />
                Add some articles to get started.
              </>
            ) : (
              <>
                No articles available offline.
                <br />
                Connect to the internet to download articles.
              </>
            )}
          </div>
        ) : (
          articles.map((article) => {
            const availableOffline = article.hasBody;
            const clickable = isOnline || availableOffline;

            return (
              <div
                className={`articleEntry ${article.unread ? 'unread' : ''}`}
                key={article.url}
                onClick={handleArticleClick(article)}
                style={{ opacity: clickable ? 1 : 0.5, cursor: clickable ? 'pointer' : 'default' }}
              >
                <div className="articleContent">
                  <div className="title">{truncateTitle(article.title)}</div>
                  <div className="url">{getHostname(article.url)}</div>
                </div>
                <div className="articleButtons">
                  <div
                    className={`downloadButton ${article.hasBody ? 'downloaded' : ''}`}
                    onClick={handleDownloadClick(article)}
                    title={!isOnline ? 'Offline' : article.hasBody ? 'Remove download' : 'Download for offline'}
                    style={{ opacity: isOnline ? 1 : 0.5, cursor: isOnline ? 'pointer' : 'default' }}
                  >
                    <LuDownload />
                  </div>
                  <div
                    className="archiveButton"
                    onClick={handleArchiveClick(article)}
                    title="Archive article"
                  >
                    <LuBookmark />
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};

export default RecentPage;
