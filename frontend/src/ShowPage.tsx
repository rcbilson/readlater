// A react component that has an editable text area for a article url
// next to a button with a refresh icon. When the button is clicked,
// the article url is fetched and the text area below the url is updated
// with the article contents.
import React, { useState, useCallback, useEffect, useContext } from "react";
import { useParams } from 'react-router-dom';
import axios, { AxiosError } from "axios";
import { useQuery } from '@tanstack/react-query'
import { ErrorBoundary } from "react-error-boundary";
import { marked } from 'marked';
import { AuthContext } from "@/components/ui/auth-context";
import { LuShare2 } from "react-icons/lu";
import DOMPurify from 'isomorphic-dompurify';
import { Article, ArticleRequest } from './Article';
import { getOfflineArticle, updateOfflineArticleUnreadStatus } from './localDataService';
import { useNetworkStatus } from './useNetworkStatus';
import "./Article.css";

const MainPage: React.FC = () => {
  const { articleUrl } = useParams();
  const { token, resetAuth } = useContext(AuthContext);
  const [debug, setDebug] = useState(false);
  const isOnline = useNetworkStatus();
 
  const formatArticle = async (contents: string) => {
    const html = await marked(contents);
    return DOMPurify.sanitize(html);
  }

  const markArticleAsRead = async (url: string) => {
    try {
      await axios.post("/api/markRead", { url }, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
    } catch (error) {
      console.warn("Failed to mark article as read:", error);
    }
    
    // Also update the offline storage if the article is cached
    updateOfflineArticleUnreadStatus(url, false);
  }

  const fetchArticle = async () => {
    try {
      if (!articleUrl) {
        throw new Error("no article to fetch");
      }

      // First, check if article is available offline with full content
      console.log("ShowPage: Checking for offline article:", articleUrl);
      const offlineArticle = await getOfflineArticle(articleUrl);
      console.log("ShowPage: getOfflineArticle result:", offlineArticle ? "found" : "not found");
      
      if (offlineArticle && offlineArticle.contents) {
        console.log("ShowPage: Using offline article:", articleUrl, "content length:", offlineArticle.contents.length);
        const html = await formatArticle(offlineArticle.contents);
        offlineArticle.rendered = html;
        markArticleAsRead(articleUrl);
        return offlineArticle;
      }

      // If not available offline or no content, try to fetch from network
      if (!isOnline) {
        console.log("ShowPage: Offline and no full content available for:", articleUrl);
        throw new Error("Article not available offline and you're not connected to the internet");
      }

      console.log("fetching " + articleUrl);

      // if we're coming from the share target we might have a title
      const params = new URLSearchParams(window.location.search);
      const titleHint = params.get("titleHint");

      const request: ArticleRequest = { url: articleUrl, titleHint: titleHint || undefined };
      const response = await axios.post<Article>("/api/summarize", request, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      const article = await response.data;
      const html = await formatArticle(article.contents);
      article.rendered = html;
      markArticleAsRead(articleUrl);
      return article;
    } catch (error) {
      if (error instanceof AxiosError && error.response?.status === 401) {
        resetAuth();
      } else {
        throw error;
      }
    }
  };

  const {isPending, isError, data, error} = useQuery({
    queryKey: ['article', articleUrl],
    queryFn: fetchArticle,
    refetchOnWindowFocus: false,
    networkMode: 'offlineFirst',
  });
  const article = data;

  // When CTRL-Q is pressed, switch to debug display
  const checkHotkey = useCallback(
    (event: KeyboardEvent) => {
      if (event.ctrlKey && event.key === "q") {
        setDebug(!debug);
      }
    },
    [debug],
  );

  useEffect(() => {
    document.addEventListener('keydown', checkHotkey);

    return () => {
      document.removeEventListener('keydown', checkHotkey);
    };
  }, [checkHotkey]);

  useEffect(() => {
    if (article && article.title) {
      document.title = "Read Later: " + article.title;
    } else {
      document.title = "Read Later";
    }
  }, [article]);
  
  const handleLinkClick = () => {
    return () => {
      if (articleUrl) {
        //navigator.clipboard.writeText(articleUrl);
        navigator.share({url: articleUrl});
      }
    }
  }

  const articleLink = <a href={articleUrl}>{articleUrl}</a>;

  return (
    <div id="articleContainer">
      {isError && <div>An error occurred: {error.message}</div>}
      {isPending && <div>We're loading this article, just a moment...</div>}
      {!isPending && !article && <div>We don't have a version of {articleLink}. You can see the original by clicking the link.</div>}
      {debug && article && <pre>{article.contents}</pre>}
      {!debug && article?.rendered && 
        <div>
          <div id="articleHeader">
            <div id="titleBox">
              {articleUrl && 
                <span>
                  <a id="url" href={articleUrl}>{new URL(articleUrl).hostname}</a>
                  <LuShare2 onClick={handleLinkClick()} style={{ display: 'inline', verticalAlign: 'middle', marginLeft: '1em', cursor: 'pointer' }}/>
                </span>}
            </div>
          </div>
          <ErrorBoundary
              fallback={<div>We weren't able to summarize {articleLink}. You can see the original by clicking the link.</div>}>
            <div className="article" dangerouslySetInnerHTML={{ __html: article.rendered }} />
          </ErrorBoundary>
        </div>
      }
    </div>
  );
};

export default MainPage;
