// A react component that displays recent articles using local-first architecture
import React, { useState, useEffect } from "react";
import { useNavigate } from 'react-router-dom';
import { LuBookmark, LuDownload, LuLoader, LuWifi, LuWifiOff } from "react-icons/lu";

import { LocalArticle, getRecentArticles } from "./database";
import { syncManager, SyncStatus } from "./syncManager";
import { useNetworkStatus } from "./useNetworkStatus";
import { useColorModeValue } from "@/components/ui/color-mode";
// import { useToggleArchive } from "./useToggleArchive";

const RecentPage: React.FC = () => {
  const navigate = useNavigate();
  const isOnline = useNetworkStatus();
  // const toggleArchive = useToggleArchive(); // Not needed in new implementation
  const [articles, setArticles] = useState<LocalArticle[]>([]);
  const [syncStatus, setSyncStatus] = useState<SyncStatus>({
    isOnline: false,
    isSyncing: false,
    pendingOperations: 0
  });
  const [loading, setLoading] = useState(true);

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
        const localArticles = await getRecentArticles(50);
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
    const unsubscribe = syncManager.onStatusChange(setSyncStatus);
    return unsubscribe;
  }, []);

  // Trigger sync when coming online
  useEffect(() => {
    if (isOnline) {
      syncManager.performFullSync().catch(console.error);
    }
  }, [isOnline]);

  // Refresh articles after sync operations and when sync status changes
  useEffect(() => {
    if (!syncStatus.isSyncing) {
      const refreshArticles = async () => {
        console.log('RecentPage: Refreshing articles after sync...');
        const localArticles = await getRecentArticles(50);
        const unarchivedArticles = localArticles.filter(a => !a.archived);
        console.log('RecentPage: Refreshed to', unarchivedArticles.length, 'unarchived articles');
        setArticles(unarchivedArticles);
      };
      refreshArticles().catch(console.error);
    }
  }, [syncStatus.isSyncing, syncStatus.pendingOperations]);

  // Periodic refresh to catch any missed sync updates
  useEffect(() => {
    const interval = setInterval(async () => {
      if (!syncStatus.isSyncing) {
        console.log('RecentPage: Periodic refresh check...');
        const localArticles = await getRecentArticles(50);
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
  }, [articles, syncStatus.isSyncing]);

  const handleArticleClick = (article: LocalArticle) => {
    return () => {
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
        await syncManager.setArchive(article.url, true);
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
        if (article.hasBody) {
          // Remove content (make it not downloaded)
          setArticles(prev => prev.map(a => 
            a.url === article.url ? { ...a, hasBody: false, contents: undefined } : a
          ));
        } else {
          // Download content
          await syncManager.downloadArticle(article.url);
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
        {syncStatus.isSyncing ? (
          <>
            <LuLoader className="animate-spin" />
            Syncing...
          </>
        ) : syncStatus.isOnline ? (
          <>
            Online
            {syncStatus.lastSyncTime && (
              <span style={{ marginLeft: '0.5em', fontSize: '0.9em', color: mutedTextColor }}>
                Last sync: {syncStatus.lastSyncTime.toLocaleTimeString()}
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
                <div className="title">{article.title}</div>
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
