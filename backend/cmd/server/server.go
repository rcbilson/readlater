package main

import (
	"context"
	"log"

	"github.com/kelseyhightower/envconfig"
	"knilson.org/recipe/llm"
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

	llm, err := llm.New(context.Background(), *theModel)
	if err != nil {
		log.Fatal("error initializing llm interface:", err)
	}

	db, err := NewDb(spec.DbFile)
	if err != nil {
		log.Fatal("error initializing database interface:", err)
	}
	defer db.Close()

	fetcher, err := NewFetcher()
	if err != nil {
		log.Fatal("error initializing fetcher:", err)
	}

	handler(llm, db, fetcher, spec.Port, spec.FrontendPath, spec.GClientId)
}
