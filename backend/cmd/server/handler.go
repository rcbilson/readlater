package main

import (
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"net/url"
	"strconv"

	"knilson.org/recipe/llm"
	"knilson.org/recipe/www"
)

type recipeEntry struct {
	Title      string `json:"title"`
	Url        string `json:"url"`
	HasSummary bool   `json:"hasSummary"`
}

type recipeList []recipeEntry

type recipe struct {
	Title       string   `json:"title"`
	Ingredients []string `json:"ingredients"`
	Method      []string `json:"method"`
}

type httpError struct {
	Message string `json:"message"`
	Code    int    `json:"code"`
}

func handler(summarizer summarizeFunc, db Repo, fetcher www.FetcherFunc, port int, frontendPath string, gClientId string) {
	mux := http.NewServeMux()
	authHandler := requireAuth(db, gClientId)
	// Handle the api routes in the backend
	mux.Handle("POST /api/summarize", authHandler(summarize(summarizer, db, fetcher)))
	mux.Handle("GET /api/recents", authHandler(fetchRecents(db)))
	mux.Handle("GET /api/favorites", authHandler(fetchFavorites(db)))
	mux.Handle("GET /api/search", authHandler(search(db)))
	// bundled assets and static resources
	mux.Handle("GET /assets/", http.FileServer(http.Dir(frontendPath)))
	mux.Handle("GET /static/", http.FileServer(http.Dir(frontendPath)))
	// For other requests, serve up the frontend code
	mux.HandleFunc("GET /", func(w http.ResponseWriter, r *http.Request) {
		http.ServeFile(w, r, fmt.Sprintf("%s/index.html", frontendPath))
	})
	log.Println("server listening on port", port)
	log.Fatal(http.ListenAndServe(fmt.Sprintf(":%d", port), mux))
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
			logError(w, fmt.Sprintf("Error fetching recent recipes: %v", err), http.StatusInternalServerError)
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
			logError(w, fmt.Sprintf("Error fetching recent recipes: %v", err), http.StatusInternalServerError)
			return
		}
		json.NewEncoder(w).Encode(recentList)
		w.Header().Set("Content-Type", "application/json")
	}
}

func fetchFavorites(db Repo) AuthHandlerFunc {
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
		recentList, err := db.Favorites(r.Context(), count)
		if err != nil {
			logError(w, fmt.Sprintf("Error fetching favorite recipes: %v", err), http.StatusInternalServerError)
			return
		}
		json.NewEncoder(w).Encode(recentList)
		w.Header().Set("Content-Type", "application/json")
	}
}

func hit(db Repo) AuthHandlerFunc {
	return func(w http.ResponseWriter, r *http.Request, _ User) {
		url, ok := r.URL.Query()["url"]
		if !ok {
			logError(w, "No search terms provided", http.StatusBadRequest)
			return
		}
		err := db.Hit(r.Context(), url[0])
		if err != nil {
			logError(w, fmt.Sprintf("Error updating database: %v", err), http.StatusInternalServerError)
			return
		}
	}
}

func validateRecipe(js *string, html []byte, urlString string, titleHint string) {
	var r recipe
	err := json.Unmarshal([]byte(*js), &r)
	if err == nil && r.Title != "" {
		// Good enough!
		return
	}

	// sometimes the browser gives us the title for nothing
	r.Title = titleHint

	if r.Title == "" {
		// Try to extract the title from the HTML
		r.Title = www.HtmlTitle(html)
	}

	if r.Title == "" {
		// In desperation, use the URL
		parsedUrl, err := url.Parse(urlString)
		if err == nil {
			r.Title = parsedUrl.Path
		} else {
			r.Title = urlString
		}
	}

	b, err := json.Marshal(r)
	if err == nil {
		*js = string(b)
		return
	}
}

func summarize(summarizer summarizeFunc, db Repo, fetcher www.FetcherFunc) AuthHandlerFunc {
	return func(w http.ResponseWriter, r *http.Request, user User) {
		//w.Header().Set("Content-Type", "application/json")
		//fmt.Fprint(w, `{"title":"a dummy recipe", "ingredients":[], "method":[]}`)
		//return
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
		doUpdate := false
		_, err = url.Parse(req.Url)
		if err != nil {
			logError(w, fmt.Sprintf("Invalid URL: %v", err), http.StatusBadRequest)
			return
		}
		summary, ok := db.Get(ctx, req.Url)
		if !ok {
			log.Println("fetching recipe", req.Url)
			doUpdate = true
			recipe, err := fetcher(ctx, req.Url)
			if err != nil {
				logError(w, fmt.Sprintf("Error retrieving recipe: %v", err), http.StatusBadRequest)
			} else {
				var stats llm.Usage
				summary, err = summarizer(ctx, recipe, &stats)
				if err != nil {
					logError(w, fmt.Sprintf("Error communicating with llm: %v", err), http.StatusInternalServerError)
				}
				err = db.Usage(ctx, Usage{req.Url, len(recipe), len(summary), stats.InputTokens, stats.OutputTokens})
				if err != nil {
					log.Printf("Error updating usage: %v", err)
				}
			}
			validateRecipe(&summary, recipe, req.Url, req.TitleHint)
		}
		if doUpdate {
			err = db.Insert(ctx, req.Url, summary, user)
			if err != nil && err.Error() == "malformed JSON" {
				err = db.Insert(ctx, req.Url, `""`, user)
				summary = ""
			}
			if err != nil {
				log.Printf("Error inserting into db: %v", err)
			}
		}

		w.Header().Set("Content-Type", "application/json")
		fmt.Fprint(w, summary)
	}
}
