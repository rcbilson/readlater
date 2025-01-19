package main

import (
	"context"
	"log"

	"github.com/kelseyhightower/envconfig"
)

type specification struct {
	Port         int    `default:"9000"`
	FrontendPath string `default:"/home/richard/src/recipe/frontend/dist"`
	DbFile       string `default:"/home/richard/src/recipe/data/recipe.db"`
}

var spec specification

func main() {
	err := envconfig.Process("recipeserver", &spec)
	if err != nil {
		log.Fatal("error reading environment variables:", err)
	}

	llm, err := NewLlm(context.Background(), *theModel)
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

	handler(llm, db, fetcher, spec.Port, spec.FrontendPath)
}
