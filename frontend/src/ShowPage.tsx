// A react component that has an editable text area for a article url
// next to a button with a refresh icon. When the button is clicked,
// the article url is fetched and the text area below the url is updated
// with the article contents.
import React, { useState, useCallback, useEffect, useContext } from "react";
import { useParams } from 'react-router-dom';
import axios, { AxiosError } from "axios";
import { useQuery } from '@tanstack/react-query'
import { ErrorBoundary } from "react-error-boundary";
import { List } from "@chakra-ui/react"
import { AuthContext } from "@/components/ui/auth-context";
import { LuShare2 } from "react-icons/lu";

// ArticleRequest is a type consisting of the url of a article to fetch.
type ArticleRequest = {
  url: string;
  titleHint?: string; // optional title hint for the article
}

// Article is a type representing an article.
type Article = {
  title: string;
  ingredients: string[];
  method: string[];
}

const MainPage: React.FC = () => {
  const { articleUrl } = useParams();
  const { token, resetAuth } = useContext(AuthContext);

  if (!articleUrl) {
    return <div>Oops, no article here!</div>;
  }
 
  const [debug, setDebug] = useState(false);

  const fetcharticle = async () => {
    try {
      console.log("fetching " + articleUrl);
      
      // if we're coming from the share target we might have a title
      const params = new URLSearchParams(window.location.search);
      const titleHint = params.get("titleHint");

      const request: ArticleRequest = { url: articleUrl, titleHint: titleHint || undefined };
      const response = await axios.post<Article>("/api/summarize", request, {
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

  const {isPending, isError, data, error} = useQuery({
    queryKey: ['article', articleUrl],
    queryFn: fetcharticle,
    refetchOnWindowFocus: false,
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
      document.title = "articles: " + article.title;
    } else {
      document.title = "articles";
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
      {isPending && <div>We're loading a summary of this article, just a moment...</div>}
      {!isPending && !article && <div>We don't have a summary for {articleLink}. You can see the original by clicking the link.</div>}
      {debug && article && <pre>{JSON.stringify(article, null, 2)}</pre>}
      {!debug && article && 
        <div>
          <div id="articleHeader">
            <div id="titleBox">
              <div id="title">{article.title}</div>
              {articleUrl && 
                <span>
                  <a id="url" href={articleUrl}>{new URL(articleUrl).hostname}</a>
                  <LuShare2 onClick={handleLinkClick()} style={{ display: 'inline', verticalAlign: 'middle', marginLeft: '1em', cursor: 'pointer' }}/>
                </span>}
            </div>
          </div>
          <ErrorBoundary
              fallback={<div>We weren't able to summarize {articleLink}. You can see the original by clicking the link.</div>}>
            <div id="method">
              {article.ingredients &&
                <List.Root padding="0.5em">{article.ingredients.map((ingredient, id) =>
                  <List.Item key={id}>{ingredient}</List.Item>)}
                </List.Root>}
              {article.method &&
                <List.Root as="ol" padding="0.5em">{article.method.map((step, id) =>
                  <List.Item key={id}>{step}</List.Item>)}
                </List.Root>}
            </div>
          </ErrorBoundary>
        </div>
      }
    </div>
  );
};

export default MainPage;
