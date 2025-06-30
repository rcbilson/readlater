// A react component that has an editable text area for a article url
// next to a button with a refresh icon. When the button is clicked,
// the article url is fetched and the text area below the url is updated
// with the article contents.
import React, { useContext, useState, useEffect } from "react";
import { useNavigate } from 'react-router-dom';
import axios, { AxiosError } from "axios";
import { useQuery } from '@tanstack/react-query'
import { AuthContext } from "@/components/ui/auth-context";
import { LuBookmark, LuBookmarkCheck, LuDownload } from "react-icons/lu";
import { useToggleArchive } from "./useToggleArchive";
import { isArticleOffline, toggleArticleOffline } from "./localStorage";
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
  });
  const recents = data;

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
    return (e: React.MouseEvent) => {
      e.stopPropagation(); // Prevent triggering article click
      toggleArchive(entry.url, !entry.archived);
    }
  };

  const handleDownloadClick = (entry: ArticleEntry) => {
    return async (e: React.MouseEvent) => {
      e.stopPropagation(); // Prevent triggering article click
      
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
          
          // Store offline
          toggleArticleOffline(article);
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

  if (isError) {
    return <div>An error occurred: {error.message}</div>
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
            <div className={`downloadButton ${offlineArticles.has(recent.url) ? 'downloaded' : ''}`} onClick={handleDownloadClick(recent)}>
              <LuDownload />
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
