// A react component that has an editable text area for a recipe url
// next to a button with a refresh icon. When the button is clicked,
// the recipe url is fetched and the text area below the url is updated
// with the recipe contents.
import React from "react";
import { useNavigate } from 'react-router-dom';

import ArticleQuery from "./ArticleQuery.tsx";
import { useNetworkStatus } from "./useNetworkStatus";
import { getOfflineArticles } from "./localStorage";

const OfflineArticleList: React.FC = () => {
  const navigate = useNavigate();
  const offlineArticles = getOfflineArticles();

  const handleArticleClick = (url: string) => {
    return () => {
      const encodedUrl = encodeURIComponent(url);
      navigate("/show/" + encodedUrl);
    }
  };

  return (
    <div id="articleList">
      {offlineArticles.length === 0 ? (
        <div style={{ padding: '1em', textAlign: 'center', color: '#666' }}>
          No articles downloaded for offline reading.
          <br />
          Connect to the internet and download articles to read them offline.
        </div>
      ) : (
        offlineArticles.map((article) =>
          <div className="articleEntry" key={article.url} onClick={handleArticleClick(article.url)}>
            <div className="articleContent">
              <div className="title">{article.title}</div>
              <div className="url">{new URL(article.url).hostname}</div>
            </div>
            <div className="offlineIndicator">
              📱 Offline
            </div>
          </div>
        )
      )}
    </div>
  );
};

const RecentPage: React.FC = () => {
  const isOnline = useNetworkStatus();

  return (
    <div id="recentContainer">
      {isOnline ? (
        <ArticleQuery queryPath='/api/recents?count=50' />
      ) : (
        <>
          <div style={{ padding: '0.5em', background: '#f5f5f5', marginBottom: '1em', borderRadius: '4px' }}>
            🔌 You're offline - showing downloaded articles
          </div>
          <OfflineArticleList />
        </>
      )}
    </div>
  );
};

export default RecentPage;
