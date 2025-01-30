package main

import (
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"strconv"
)

type recipeEntry struct {
	Title string `json:"title"`
	Url   string `json:"url"`
}

type recipeList []recipeEntry

func handler(llm Llm, db Db, fetcher Fetcher, port int, frontendPath string) {
	// Handle the api routes in the backend
	http.Handle("/api/summarize", http.HandlerFunc(summarize(llm, db, fetcher)))
	http.Handle("/api/recents", http.HandlerFunc(fetchRecents(db)))
	http.Handle("/api/favorites", http.HandlerFunc(fetchFavorites(db)))
	http.Handle("/api/search", http.HandlerFunc(search(db)))
	http.Handle("/api/hit", http.HandlerFunc(hit(db)))
	// For other requests, serve up the frontend assets
	http.Handle("/", http.FileServer(http.Dir(frontendPath)))
	log.Println("server listening on port", port)
	log.Fatal(http.ListenAndServe(fmt.Sprintf(":%d", port), nil))
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
			summary, err = llm.Ask(ctx, recipe)
			if err != nil {
				logError(w, fmt.Sprintf("Error communicating with llm: %v", err), http.StatusInternalServerError)
				return
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
