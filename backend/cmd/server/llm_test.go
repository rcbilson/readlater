package main

import (
	"context"
	"encoding/json"
	"log"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/rcbilson/readlater/llm"
)

func TestArticles(t *testing.T) {
	if testing.Short() {
		t.Skip()
	}

	llm, err := llm.New(context.Background(), theModel.Params)
	if err != nil {
		log.Fatal("error initializing llm interface:", err)
	}

	summarizer := newSummarizer(llm, *theModel)

	matches, err := filepath.Glob("testdata/*.html")
	if err != nil {
		t.Errorf("Error listing files: %v", err)
		return
	}
	if len(matches) == 0 {
		t.Error("no test data")
	}
	for _, file := range matches {
		bytes, err := os.ReadFile(file)
		if err != nil {
			t.Errorf("%s: error reading file: %v", file, err)
			continue
		}
		contents, err := summarizer(context.Background(), bytes, nil)
		if err != nil {
			t.Errorf("%s: error communicating with llm: %v", file, err)
			continue
		}
		// save contents for possible analysis
		path := strings.TrimSuffix(file, ".html") + ".json"
		output, err := os.Create(path)
		if err != nil {
			t.Errorf("%s: error creating file: %v", file, err)
		}
		defer output.Close()

		_, err = output.Write([]byte(contents))
		if err != nil {
			t.Errorf("%s: error writing contents output: %v", file, err)
		}

		var r article
		err = json.Unmarshal([]byte(contents), &r)
		if err != nil {
			t.Errorf("%s: JSON decode error: %v", file, err)
			return
		}
	}
}
