package main

import (
	"context"
	"log"

	"github.com/kelseyhightower/envconfig"
	"knilson.org/recipe/llm"
	"knilson.org/recipe/www"
)

type specification struct {
	Port         int    `default:"9000"`
	FrontendPath string `default:"/home/richard/src/recipe/frontend/dist"`
	DbFile       string `default:"/home/richard/src/recipe/data/recipe.db"`
	GClientId    string `default:"250293909105-5da8lue96chip31p2q3ueug0bdvve96o.apps.googleusercontent.com"`
}

var spec specification

func main() {
	err := envconfig.Process("recipeserver", &spec)
	if err != nil {
		log.Fatal("error reading environment variables:", err)
	}

	llm, err := llm.New(context.Background(), theModel.Params)
	if err != nil {
		log.Fatal("error initializing llm interface:", err)
	}

	summarizer := newSummarizer(llm, *theModel)

	db, err := NewRepo(spec.DbFile)
	if err != nil {
		log.Fatal("error initializing database interface:", err)
	}
	defer db.Close()

	handler(summarizer, db, www.Fetcher, spec.Port, spec.FrontendPath, spec.GClientId)
}
