package main

import (
	"context"
	"log"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/rcbilson/readlater/llm"
	"github.com/rcbilson/readlater/www"
)

func saveFile(t *testing.T, path string, bytes []byte) {
	// save files for other tests
	file, err := os.Create(path)
	if err != nil {
		t.Errorf("Error creating file: %v", err)
	}
	defer file.Close()

	_, err = file.Write(bytes)
	if err != nil {
		t.Errorf("Error writing to file: %v", err)
	}
}

func TestArticles(t *testing.T) {
	if testing.Short() {
		t.Skip()
	}

	var urls = []string{
		"http://bbc.com/future/article/20250528-why-some-countries-dont-fluoridate-their-water?utm_source=pocket_shared",
		"http://slate.com/life/2025/06/pride-2025-queer-lgbtq-trump-conservative.html?utm_source=pocket_shared",
		"https://tastecooking.com/is-it-soft-tofus-time/",
	}

	llm, err := llm.New(context.Background(), theModel.Params)
	if err != nil {
		log.Fatal("error initializing llm interface:", err)
	}

	summarizer := newSummarizer(llm, *theModel)

	for _, url := range urls {
		base := filepath.Base(url)
		htmlPath := filepath.Join("testdata", base+".html")
		bytes, err := os.ReadFile(htmlPath)
		if err != nil {
			if os.IsNotExist(err) {
				bytes, err = www.Fetcher(context.Background(), url)
				if err != nil {
					t.Errorf("Failed to fetch %s: %v", url, err)
					continue
				}
				saveFile(t, htmlPath, bytes)
			} else {
				t.Errorf("%s: error reading file: %v", htmlPath, err)
				continue
			}
		}
		contents, err := summarizer(context.Background(), bytes, nil)
		if err != nil {
			t.Errorf("%s: error communicating with llm: %v", url, err)
		}
		// save contents for possible analysis
		mdPath := strings.TrimSuffix(htmlPath, ".html") + ".md"
		saveFile(t, mdPath, []byte(contents))
	}
}
