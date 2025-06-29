package main

import (
	"context"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/rcbilson/readlater/www"
)

func TestPandoc(t *testing.T) {
	var urls = []string{
		"http://bbc.com/future/article/20250528-why-some-countries-dont-fluoridate-their-water?utm_source=pocket_shared",
		"http://slate.com/life/2025/06/pride-2025-queer-lgbtq-trump-conservative.html?utm_source=pocket_shared",
		"https://tastecooking.com/is-it-soft-tofus-time/",
	}

	summarizer := pandocSummarizer()

	for _, url := range urls {
		base := filepath.Base(url)
		htmlPath := filepath.Join("testdata", base+".html")
		bytes, err := os.ReadFile(htmlPath)
		if err != nil {
			if os.IsNotExist(err) {
				bytes, _, err = www.Fetcher(context.Background(), url)
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
			t.Errorf("%s: error from pandoc: %v", url, err)
		}
		// save contents for possible analysis
		mdPath := strings.TrimSuffix(htmlPath, ".html") + ".md"
		saveFile(t, mdPath, []byte(contents))
	}
}
