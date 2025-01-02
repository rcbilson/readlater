package main

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"

	"github.com/kelseyhightower/envconfig"
)

type specification struct {
	Port         int    `default:"9000"`
	FrontendPath string `default:"/home/richard/src/recipe/frontend/build"`
}

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

	// Handle the /api route in the backend
	http.Handle("/summarize", http.HandlerFunc(summarize(llm)))
	/*
		// For render requests, serve up the frontend code
		http.HandleFunc("/render/", func(w http.ResponseWriter, r *http.Request) {
			http.ServeFile(w, r, fmt.Sprintf("%s/index.html", spec.FrontendPath))
		})
		http.Handle("/static/", http.FileServer(http.Dir(spec.FrontendPath)))
		http.Handle("/favicon.ico", http.FileServer(http.Dir(spec.FrontendPath)))
		http.HandleFunc("/", indexHandler)
	*/
	log.Println("server listening on port", spec.Port)
	log.Fatal(http.ListenAndServe(fmt.Sprintf(":%d", spec.Port), nil))
}

func logError(w http.ResponseWriter, msg string, code int) {
	log.Printf("%d %s", code, msg)
	http.Error(w, msg, code)
}

func summarize(llm *LlmContext) func(http.ResponseWriter, *http.Request) {
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
		recipe, err := fetch(ctx, req.Url)
		if err != nil {
			logError(w, fmt.Sprintf("Error retrieving recipe: %v", err), http.StatusBadRequest)
			return
		}
		summary, err := llm.Ask(ctx, recipe)
		if err != nil {
			logError(w, fmt.Sprintf("Error communicating with llm: %v", err), http.StatusInternalServerError)
			return
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
