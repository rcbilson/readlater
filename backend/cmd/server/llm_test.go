package main

import (
	"context"
	"encoding/json"
	"log"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"knilson.org/recipe/llm"
)

type recipeJson struct {
	Title       string   `json:"title"`
	Ingredients []string `json:"ingredients"`
	Method      []string `json:"method"`
}

func TestRecipes(t *testing.T) {
	if testing.Short() {
		t.Skip()
	}

	llm, err := llm.New(context.Background(), *theModel)
	if err != nil {
		log.Fatal("error initializing llm interface:", err)
	}

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
		summary, err := llm.Ask(context.Background(), bytes, nil)
		if err != nil {
			t.Errorf("%s: error communicating with llm: %v", file, err)
			continue
		}
		// save summary for possible analysis
		path := strings.TrimSuffix(file, ".html") + ".json"
		output, err := os.Create(path)
		if err != nil {
			t.Errorf("%s: error creating file: %v", file, err)
		}
		defer output.Close()

		_, err = output.Write([]byte(summary))
		if err != nil {
			t.Errorf("%s: error writing summary output: %v", file, err)
		}

		var r recipeJson
		err = json.Unmarshal([]byte(summary), &r)
		if err != nil {
			t.Errorf("%s: JSON decode error: %v", file, err)
			return
		}
	}
}
