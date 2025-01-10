package main

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"strconv"

	"github.com/kelseyhightower/envconfig"
)

type specification struct {
	Port         int    `default:"9000"`
	FrontendPath string `default:"/home/richard/src/recipe/frontend/dist"`
	DbFile       string `default:"/home/richard/src/recipe/data/recipe.db"`
}

type recipeEntry struct {
	Title string `json:"title"`
	Url   string `json:"url"`
}

type recipeList []recipeEntry

var spec specification

func main() {
	err := envconfig.Process("recipeserver", &spec)
	if err != nil {
		log.Fatal("error reading environment variables:", err)
	}

	llm, err := InitializeLlm(context.Background(), *theModel)
	if err != nil {
		log.Fatal("error initializing llm interface:", err)
	}

	db, err := InitializeDb(spec.DbFile)
	if err != nil {
		log.Fatal("error initializing database interface:", err)
	}
	defer db.Close()

	// Handle the api routes in the backend
	http.Handle("/summarize", http.HandlerFunc(summarize(llm, db)))
	http.Handle("/recents", http.HandlerFunc(fetchRecents(db)))
	// For other requests, serve up the frontend code
	http.HandleFunc("/", func(w http.ResponseWriter, r *http.Request) {
		http.ServeFile(w, r, fmt.Sprintf("%s/index.html", spec.FrontendPath))
	})
	http.Handle("/assets/", http.FileServer(http.Dir(spec.FrontendPath)))
	log.Println("server listening on port", spec.Port)
	log.Fatal(http.ListenAndServe(fmt.Sprintf(":%d", spec.Port), nil))
}

func logError(w http.ResponseWriter, msg string, code int) {
	log.Printf("%d %s", code, msg)
	http.Error(w, msg, code)
}

func fetchRecents(db *DbContext) func(http.ResponseWriter, *http.Request) {
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
			logError(w, fmt.Sprintf("Error fetching recent recipes: %v", err), http.StatusBadRequest)
			return
		}
		json.NewEncoder(w).Encode(recentList)
		w.Header().Set("Content-Type", "application/json")
	}
}

func summarize(llm *LlmContext, db *DbContext) func(http.ResponseWriter, *http.Request) {
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
			recipe, err := fetch(ctx, req.Url)
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
			if err != nil {
				log.Printf("Error inserting into db: %v", err)
			}
		}

		w.Header().Set("Content-Type", "application/json")
		fmt.Fprint(w, summary)
	}
}

func fetch(ctx context.Context, url string) ([]byte, error) {
	var httpClient http.Client

	req, err := http.NewRequestWithContext(ctx, http.MethodGet, url, nil)
	if err != nil {
		return nil, err
	}
	// spoof user agent to work around bot detection
	req.Header["User-Agent"] = []string{"Mozilla/5.0 (X11; CrOS x86_64 8172.45.0) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/51.0.2704.64 Safari/537.36"}
	res, err := httpClient.Do(req)
	if err != nil {
		return nil, err
	}

	body, err := io.ReadAll(res.Body)
	res.Body.Close()
	if res.StatusCode > 299 {
		log.Println("Headers:")
		for k, v := range res.Header {
			log.Println("    ", k, ":", v)
		}
		log.Fatalf("Response failed with status code: %d and\nbody: %s\n", res.StatusCode, body)
	}
	if err != nil {
		return nil, err
	}
	return body, nil
}
