package main

import (
	"log"

	"github.com/kelseyhightower/envconfig"
	"github.com/rcbilson/readlater/www"
)

type specification struct {
	Port         int    `default:"9000"`
	FrontendPath string `default:"/home/richard/src/readlater/frontend/dist"`
	DbFile       string `default:"/home/richard/src/readlater/data/readlater.db"`
	GClientId    string `default:"250293909105-5da8lue96chip31p2q3ueug0bdvve96o.apps.googleusercontent.com"`
}

var spec specification

func main() {
	err := envconfig.Process("readlater", &spec)
	if err != nil {
		log.Fatal("error reading environment variables:", err)
	}

	summarizer := pandocSummarizer()

	db, err := NewRepo(spec.DbFile)
	if err != nil {
		log.Fatal("error initializing database interface:", err)
	}
	defer db.Close()

	handler(summarizer, db, www.Fetcher, spec.Port, spec.FrontendPath, spec.GClientId)
}
