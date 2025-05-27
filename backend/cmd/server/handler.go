package main

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"strconv"
	"strings"

	"google.golang.org/api/idtoken"
)

type recipeEntry struct {
	Title string `json:"title"`
	Url   string `json:"url"`
}

type recipeList []recipeEntry

func requireAuth(db Db, gClientId string) func(http.HandlerFunc) http.HandlerFunc {
	return func(next http.HandlerFunc) http.HandlerFunc {
		return func(w http.ResponseWriter, r *http.Request) {
			session, err := r.Cookie("session")
			if err != nil && err != http.ErrNoCookie {
				logError(w, "Unexpected error reading session cookie: "+err.Error(), http.StatusInternalServerError)
				return
			}
			if session != nil {
				fields := strings.Fields(session.Value)
				if len(fields) != 2 {
					logError(w, "Malformed session cookie", http.StatusUnauthorized)
					return
				}
				userNonce := db.GetSession(r.Context(), fields[0])
				if userNonce == fields[1] {
					next(w, r)
					return
				}
			}
			authHeader := r.Header.Get("Authorization")
			if !strings.HasPrefix(authHeader, "Bearer ") {
				logError(w, "Missing or invalid Authorization header", http.StatusUnauthorized)
				return
			}
			token := strings.TrimPrefix(authHeader, "Bearer ")
			payload, err := idtoken.Validate(context.Background(), token, gClientId)
			if err != nil {
				logError(w, "Invalid ID token: "+err.Error(), http.StatusUnauthorized)
				return
			}
			email, ok := payload.Claims["email"].(string)
			if !ok {
				logError(w, "No valid email claim", http.StatusUnauthorized)
				return
			}
			nonce := db.GetSession(r.Context(), email)
			if nonce == "" {
				logError(w, fmt.Sprintf("No registered user %s", email), http.StatusUnauthorized)
				return
			}
			http.SetCookie(w, &http.Cookie{
				Name:     "session",
				Value:    fmt.Sprintf("%s %s", email, nonce),
				MaxAge:   2592000, // 30 days
				HttpOnly: true,
				Secure:   true,
				SameSite: http.SameSiteStrictMode,
			})
			next(w, r)
		}
	}
}

func handler(llm Llm, db Db, fetcher Fetcher, port int, frontendPath string, gClientId string) {
	mux := http.NewServeMux()
	auth := requireAuth(db, gClientId)
	// Handle the api routes in the backend
	mux.Handle("POST /api/summarize", auth(http.HandlerFunc(summarize(llm, db, fetcher))))
	mux.Handle("GET /api/recents", auth(http.HandlerFunc(fetchRecents(db))))
	mux.Handle("GET /api/favorites", auth(http.HandlerFunc(fetchFavorites(db))))
	mux.Handle("GET /api/search", auth(http.HandlerFunc(search(db))))
	mux.Handle("POST /api/hit", auth(http.HandlerFunc(hit(db))))
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

func search(db Db) func(http.ResponseWriter, *http.Request) {
	return func(w http.ResponseWriter, r *http.Request) {
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

func fetchRecents(db Db) func(http.ResponseWriter, *http.Request) {
	return func(w http.ResponseWriter, r *http.Request) {
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

func fetchFavorites(db Db) func(http.ResponseWriter, *http.Request) {
	return func(w http.ResponseWriter, r *http.Request) {
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

func hit(db Db) func(http.ResponseWriter, *http.Request) {
	return func(w http.ResponseWriter, r *http.Request) {
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

func summarize(llm Llm, db Db, fetcher Fetcher) func(http.ResponseWriter, *http.Request) {
	return func(w http.ResponseWriter, r *http.Request) {
		//w.Header().Set("Content-Type", "application/json")
		//fmt.Fprint(w, `{"title":"a dummy recipe", "ingredients":[], "method":[]}`)
		//return
		ctx := r.Context()
		var req struct {
			Url string `json:"url"`
		}
		err := json.NewDecoder(r.Body).Decode(&req)
		if err != nil {
			logError(w, fmt.Sprintf("JSON decode error: %v", err), http.StatusBadRequest)
			return
		}
		doUpdate := false
		summary, ok := db.Get(ctx, req.Url)
		if !ok {
			log.Println("fetching recipe", req.Url)
			doUpdate = true
			recipe, err := fetcher.Fetch(ctx, req.Url)
			if err != nil {
				logError(w, fmt.Sprintf("Error retrieving recipe: %v", err), http.StatusBadRequest)
				return
			}
			var stats LlmStats
			summary, err = llm.Ask(ctx, recipe, &stats)
			if err != nil {
				logError(w, fmt.Sprintf("Error communicating with llm: %v", err), http.StatusInternalServerError)
				return
			}
			err = db.Usage(ctx, Usage{req.Url, len(recipe), len(summary), stats.InputTokens, stats.OutputTokens})
			if err != nil {
				log.Printf("Error updating usage: %v", err)
			}
		}
		if doUpdate {
			err = db.Insert(ctx, req.Url, summary)
			if err != nil && err.Error() == "malformed JSON" {
				err = db.Insert(ctx, req.Url, `""`)
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
