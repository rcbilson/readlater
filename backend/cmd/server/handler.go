package main

import (
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"net/url"
	"regexp"
	"strconv"

	"github.com/rcbilson/readlater/www"

	_ "net/http/pprof"
)

type articleEntry struct {
	Title      string `json:"title"`
	Url        string `json:"url"`
	HasBody    bool   `json:"hasBody"`
	Unread     bool   `json:"unread"`
	Archived   bool   `json:"archived"`
	LastAccess string `json:"lastAccess"`
}

type articleList []articleEntry

type article struct {
	Title    string `json:"title"`
	Url      string `json:"url"`
	Contents string `json:"contents"`
}

type httpError struct {
	Message string `json:"message"`
	Code    int    `json:"code"`
}

func handler(summarizer summarizeFunc, db Repo, fetcher www.FetcherFunc, port int, frontendPath string, _ string) {
	authHandler := noAuth()
	// Handle the api routes in the backend
	http.Handle("POST /api/summarize", authHandler(summarize(summarizer, db, fetcher)))
	http.Handle("POST /api/markRead", authHandler(markRead(db)))
	http.Handle("GET /api/recents", authHandler(fetchRecents(db)))
	http.Handle("GET /api/archive", authHandler(fetchArchive(db)))
	http.Handle("GET /api/search", authHandler(search(db)))
	http.Handle("PUT /api/setArchive", authHandler(setArchive(db)))
	http.Handle("GET /api/changes", authHandler(fetchChanges(db)))
	// frontend
	http.Handle("GET /", http.FileServer(http.Dir(frontendPath)))
	log.Println("server listening on port", port)
	log.Fatal(http.ListenAndServe(fmt.Sprintf(":%d", port), nil))
}

// canonicalizeURL removes query parameters from a URL to create a canonical version.
// This is critical for URL consistency across the application:
//
// 1. URLs can arrive with query parameters from various sources:
//    - User input (e.g., "https://example.com/article?utm_source=twitter")
//    - HTTP redirects that add tracking parameters
//    - Server responses that include session/auth tokens in URLs
//
// 2. Without canonicalization, the same article could be stored multiple times:
//    - "https://example.com/article" 
//    - "https://example.com/article?utm_source=twitter"
//    - "https://example.com/article?ref=homepage"
//
// 3. This causes problems in the sync system:
//    - Frontend might request "https://example.com/article?utm_source=twitter"
//    - But article was stored as "https://example.com/article"
//    - Database lookup fails, preventing offline access
//
// 4. By canonicalizing URLs before storage, we ensure:
//    - One canonical URL per article in the database
//    - Consistent URL matching for sync operations
//    - Reliable offline article access regardless of how URL was accessed
//
// 5. react-router double decodes slash characters in urls
//    - see https://github.com/remix-run/react-router/pull/13813
//    - this means that when we compute a ShowPage URL it may be incorreclty
//      decoded, leading to duplicat articles
//
// The frontend no longer needs to canonicalize URLs since the backend handles this.
func canonicalizeURL(rawURL string) (string, error) {
	parsedURL, err := url.Parse(rawURL)
	if err != nil {
		return "", err
	}
	// Remove query parameters and fragment
	parsedURL.RawQuery = ""
	parsedURL.Fragment = ""
	return parsedURL.String(), nil
}

func logError(w http.ResponseWriter, msg string, code int) {
	log.Printf("%d %s", code, msg)
	http.Error(w, msg, code)
}

func search(db Repo) AuthHandlerFunc {
	return func(w http.ResponseWriter, r *http.Request, _ User) {
		query, ok := r.URL.Query()["q"]
		if !ok {
			logError(w, "No search terms provided", http.StatusBadRequest)
			return
		}
		list, err := db.Search(r.Context(), query[0])
		if err != nil {
			logError(w, fmt.Sprintf("Error searching articles: %v", err), http.StatusInternalServerError)
			return
		}
		json.NewEncoder(w).Encode(list)
		w.Header().Set("Content-Type", "application/json")
	}
}

func fetchRecents(db Repo) AuthHandlerFunc {
	return func(w http.ResponseWriter, r *http.Request, _ User) {
		var err error
		count := 5
		countStr, ok := r.URL.Query()["count"]
		if ok {
			count, err = strconv.Atoi(countStr[0])
			if err != nil {
				logError(w, fmt.Sprintf("Invalid count specification: %s", countStr[0]), http.StatusBadRequest)
				return
			}
		}
		recentList, err := db.Recents(r.Context(), count)
		if err != nil {
			logError(w, fmt.Sprintf("Error fetching recent articles: %v", err), http.StatusInternalServerError)
			return
		}
		json.NewEncoder(w).Encode(recentList)
		w.Header().Set("Content-Type", "application/json")
	}
}

func setArchive(db Repo) AuthHandlerFunc {
	return func(w http.ResponseWriter, r *http.Request, _ User) {
		var err error
		archived := false
		archiveStr, ok := r.URL.Query()["setArchive"]
		if ok {
			if archiveStr[0] == "true" {
				archived = true
			}
		}
		var url string
		urls, ok := r.URL.Query()["url"]
		if ok {
			url = urls[0]
		} else {
			logError(w, "No URL provided", http.StatusBadRequest)
			return
		}
		err = db.SetArchive(r.Context(), url, archived)
		if err != nil {
			logError(w, fmt.Sprintf("Error setting archive status: %v", err), http.StatusInternalServerError)
			return
		}
	}
}

func fetchArchive(db Repo) AuthHandlerFunc {
	return func(w http.ResponseWriter, r *http.Request, _ User) {
		var err error
		count := 5
		countStr, ok := r.URL.Query()["count"]
		if ok {
			count, err = strconv.Atoi(countStr[0])
			if err != nil {
				logError(w, fmt.Sprintf("Invalid count specification: %s", countStr[0]), http.StatusBadRequest)
				return
			}
		}
		recentList, err := db.Archive(r.Context(), count)
		if err != nil {
			logError(w, fmt.Sprintf("Error fetching favorite articles: %v", err), http.StatusInternalServerError)
			return
		}
		json.NewEncoder(w).Encode(recentList)
		w.Header().Set("Content-Type", "application/json")
	}
}

var titleExtractor = regexp.MustCompile(`^# (.*)\n`)

func extractTitle(md *string, html []byte, urlString string, titleHint string) string {
	matches := titleExtractor.FindStringSubmatch(*md)
	if matches != nil && len(matches) > 1 {
		return matches[1]
	}

	// sometimes the browser gives us the title for nothing
	if titleHint != "" {
		return titleHint
	}

	// Try to extract the title from the HTML
	title := www.HtmlTitle(html)
	if title != "" {
		return title
	}

	// In desperation, use the URL
	parsedUrl, err := url.Parse(urlString)
	if err == nil {
		return parsedUrl.Path
	} else {
		return urlString
	}
}

func summarize(summarizer summarizeFunc, db Repo, fetcher www.FetcherFunc) AuthHandlerFunc {
	return func(w http.ResponseWriter, r *http.Request, user User) {
		ctx := r.Context()

		var req struct {
			Url       string `json:"url"`
			TitleHint string `json:"titleHint"`
		}
		err := json.NewDecoder(r.Body).Decode(&req)
		if err != nil {
			logError(w, fmt.Sprintf("JSON decode error: %v", err), http.StatusBadRequest)
			return
		}
		_, err = url.Parse(req.Url)
		if err != nil {
			logError(w, fmt.Sprintf("Invalid URL: %v", err), http.StatusBadRequest)
			return
		}
		// First try to get article using original URL
		article, ok := db.GetWithoutUpdating(ctx, req.Url)
		var finalURL string
		if !ok {
			log.Println("fetching article", req.Url)
			html, finalURLFromFetcher, err := fetcher(ctx, req.Url)
			finalURL = finalURLFromFetcher
			if err != nil {
				logError(w, fmt.Sprintf("Error retrieving article: %v", err), http.StatusBadRequest)
			} else {
				// Check if we already have this article using the final URL or its canonical form
				if finalURL != req.Url {
					article, ok = db.GetWithoutUpdating(ctx, finalURL)
					// Also check canonical URL if not found
					if !ok {
						canonicalURL, err := canonicalizeURL(finalURL)
						if err == nil && canonicalURL != finalURL {
							article, ok = db.GetWithoutUpdating(ctx, canonicalURL)
						}
					}
				}

				if !ok {
					article.Contents, err = summarizer(ctx, html)
					if err != nil {
						logError(w, fmt.Sprintf("Error extracting article text: %v", err), http.StatusInternalServerError)
					}
					article.Title = extractTitle(&article.Contents, html, finalURL, req.TitleHint)
					// Canonicalize URL by removing query parameters before storing
					canonicalURL, err := canonicalizeURL(finalURL)
					if err != nil {
						log.Printf("Error canonicalizing URL %s: %v", finalURL, err)
						canonicalURL = finalURL // fallback to original URL
					}
					article.Url = canonicalURL
					err = db.Insert(ctx, article)
					if err != nil {
						log.Printf("Error inserting into db: %v", err)
					}
				}
			}
		}

		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(article)
	}
}

func fetchChanges(db Repo) AuthHandlerFunc {
	return func(w http.ResponseWriter, r *http.Request, _ User) {
		since := r.URL.Query().Get("since")
		if since == "" {
			// If no timestamp provided, return empty list
			json.NewEncoder(w).Encode(articleList{})
			w.Header().Set("Content-Type", "application/json")
			return
		}

		changesList, err := db.GetChangesSince(r.Context(), since)
		if err != nil {
			logError(w, fmt.Sprintf("Error fetching article changes: %v", err), http.StatusInternalServerError)
			return
		}

		json.NewEncoder(w).Encode(changesList)
		w.Header().Set("Content-Type", "application/json")
	}
}

func markRead(db Repo) AuthHandlerFunc {
	return func(w http.ResponseWriter, r *http.Request, user User) {
		ctx := r.Context()

		var req struct {
			Url string `json:"url"`
		}
		err := json.NewDecoder(r.Body).Decode(&req)
		if err != nil {
			logError(w, fmt.Sprintf("JSON decode error: %v", err), http.StatusBadRequest)
			return
		}

		err = db.MarkRead(ctx, req.Url)
		if err != nil {
			logError(w, fmt.Sprintf("Error marking article as read: %v", err), http.StatusInternalServerError)
			return
		}

		w.WriteHeader(http.StatusOK)
	}
}
