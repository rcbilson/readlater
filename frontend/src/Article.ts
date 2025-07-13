// ArticleRequest is a type consisting of the url of a article to fetch.
export type ArticleRequest = {
  url: string;
  titleHint?: string; // optional title hint for the article
}

// Article is a type representing an article.
export type Article = {
  title: string;
  url: string;
  contents: string;
  rendered?: string;
}

