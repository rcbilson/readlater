// A react component that displays recent articles using local-first architecture
import React, { useState, useEffect } from "react";
import { useNavigate } from 'react-router-dom';
import { LuBookmark, LuDownload, LuLoader, LuWifi, LuWifiOff } from "react-icons/lu";

import { getSyncService, LocalArticle, SyncStatus } from "./sync";
import { useNetworkStatus } from "./useNetworkStatus";
import { useColorModeValue } from "@/components/ui/color-mode-hooks";
import { useMarkAsRead } from "./useMarkAsRead";

const RecentPage: React.FC = () => {
  const navigate = useNavigate();
  const isOnline = useNetworkStatus();
  const markAsRead = useMarkAsRead();
  const [articles, setArticles] = useState<LocalArticle[]>([]);
  const [syncStatus, setSyncStatus] = useState<SyncStatus>({
    state: 'idle',
    isOnline: false,
    pendingOperations: 0
  });
  const [loading, setLoading] = useState(true);

  const truncateTitle = (title: string, maxLength: number = 80): string => {
    if (title.length <= maxLength) {
      return title;
    }
    return title.substring(0, maxLength) + '...';
  };

  // Color mode aware colors
  const onlineBg = useColorModeValue('#e8f5e8', '#2d4a2d');
  const offlineBg = useColorModeValue('#f5f5f5', '#2d2d2d');
  const textColor = useColorModeValue('#000000', '#ffffff');
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
      setSyncStatus(status);
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

  // Refresh articles after sync operations
  useEffect(() => {
    if (syncStatus.state !== 'syncing') {
      const refreshArticles = async () => {
        console.log('RecentPage: Refreshing articles after sync...');
        const syncService = getSyncService();
        const localArticles = await syncService.getRecentArticles(50);
        const unarchivedArticles = localArticles.filter(a => !a.archived);
        console.log('RecentPage: Refreshed to', unarchivedArticles.length, 'unarchived articles');
        setArticles(unarchivedArticles);
      };
      refreshArticles().catch(console.error);
    }
  }, [syncStatus.state, syncStatus.pendingOperations]);

  // Periodic refresh to catch any missed sync updates
  useEffect(() => {
    const interval = setInterval(async () => {
      if (syncStatus.state !== 'syncing') {
        console.log('RecentPage: Periodic refresh check...');
        const syncService = getSyncService();
        const localArticles = await syncService.getRecentArticles(50);
        const unarchivedArticles = localArticles.filter(a => !a.archived);

        // Only update if the article count or URLs have changed
        if (unarchivedArticles.length !== articles.length ||
            !unarchivedArticles.every((article, index) =>
              articles[index] && articles[index].url === article.url
            )) {
          console.log('RecentPage: Detected changes during periodic refresh, updating...');
          setArticles(unarchivedArticles);
        }
      }
    }, 10000); // Check every 10 seconds

    return () => clearInterval(interval);
  }, [articles, syncStatus.state]);

  const handleArticleClick = (article: LocalArticle) => {
    return async () => {
      // Mark article as read regardless of whether it has body or not
      await markAsRead(article.url);

      const encodedUrl = encodeURIComponent(article.url);
      if (article.hasBody) {
        navigate("/show/" + encodedUrl);
      } else {
        window.open(article.url, "_blank");
      }
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

      try {
        const syncService = getSyncService();
        if (article.hasBody) {
          // Remove content (make it not downloaded)
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
        <LuLoader className="animate-spin" style={{ display: 'inline-block', marginRight: '0.5em' }} />
        Loading articles...
      </div>
    );
  }

  const isSyncing = syncStatus.state === 'syncing';
  const lastSyncTime = syncStatus.lastSyncTime;

  return (
    <div id="recentContainer">
      {/* Sync Status Bar */}
      <div style={{
        padding: '0.5em',
        background: syncStatus.isOnline ? onlineBg : offlineBg,
        color: textColor,
        marginBottom: '1em',
        borderRadius: '4px',
        display: 'flex',
        alignItems: 'center',
        gap: '0.5em'
      }}>
        {syncStatus.isOnline ? <LuWifi /> : <LuWifiOff />}
        {isSyncing ? (
          <>
            <LuLoader className="animate-spin" />
            Syncing...
          </>
        ) : syncStatus.isOnline ? (
          <>
            Online
            {lastSyncTime && (
              <span style={{ marginLeft: '0.5em', fontSize: '0.9em', color: mutedTextColor }}>
                Last sync: {lastSyncTime.toLocaleTimeString()}
              </span>
            )}
          </>
        ) : (
          'Offline - showing local articles'
        )}
        {syncStatus.pendingOperations > 0 && (
          <span style={{ marginLeft: 'auto', fontSize: '0.9em', color: mutedTextColor }}>
            {syncStatus.pendingOperations} pending
          </span>
        )}
        {syncStatus.error && (
          <span style={{ marginLeft: 'auto', fontSize: '0.9em', color: '#d32f2f' }}>
            Error: {syncStatus.error}
          </span>
        )}
      </div>

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
          articles.map((article) => (
            <div
              className={`articleEntry ${article.unread ? 'unread' : ''}`}
              key={article.url}
              onClick={handleArticleClick(article)}
            >
              <div className="articleContent">
                <div className="title">{truncateTitle(article.title)}</div>
                <div className="url">{new URL(article.url).hostname}</div>
              </div>
              <div className="articleButtons">
                <div
                  className={`downloadButton ${article.hasBody ? 'downloaded' : ''}`}
                  onClick={handleDownloadClick(article)}
                  title={article.hasBody ? 'Remove download' : 'Download for offline'}
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
          ))
        )}
      </div>
    </div>
  );
};

export default RecentPage;
