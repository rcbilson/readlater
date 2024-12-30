package main

import (
	"context"
	"fmt"
	"log"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestRecipes(t *testing.T) {
	llm, err := InitializeLlm(context.Background(), *theModel)
	if err != nil {
		log.Fatal("error initializing llm interface:", err)
	}

	matches, err := filepath.Glob("testdata/*.html")
	if err != nil {
		t.Error(fmt.Sprintf("Error listing files: %v", err))
		return
	}
	if len(matches) == 0 {
		t.Error("no test data")
	}
	for _, file := range matches {
		bytes, err := os.ReadFile(file)
		if err != nil {
			t.Error(fmt.Sprintf("%s: error reading file: %v", file, err))
			continue
		}
		summary, err := llm.Ask(context.Background(), bytes)
		if err != nil {
			t.Error(fmt.Sprintf("%s: error communicating with llm: %v", file, err))
			continue
		}
		// save summary for possible analysis
		path := strings.TrimSuffix(file, ".html") + ".json"
		output, err := os.Create(path)
		if err != nil {
			t.Error(fmt.Sprintf("%s: error creating file: %v", file, err))
		}
		defer output.Close()

		_, err = output.Write([]byte(summary))
		if err != nil {
			t.Error(fmt.Sprintf("%s: error writing summary output: %v", file, err))
		}
	}
}
