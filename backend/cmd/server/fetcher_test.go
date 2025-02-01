package main

import (
	"context"
	"os"
	"path/filepath"
	"testing"

	"gotest.tools/assert"
)

var urls = [...]string{
	"https://www.allrecipes.com/recipe/220943/chef-johns-buttermilk-biscuits",
	"https://www.seriouseats.com/classic-banana-bread-recipe",
	//"https://www.seriouseats.com/bravetart-homemade-cinnamon-rolls-recipe",
	"https://www.recipetineats.com/christmas-cake-moist-easy-fruit-cake/",
	"https://www.spendwithpennies.com/easy-cheesy-scalloped-potatoes-and-the-secret-to-getting-them-to-cook-quickly/",
	"https://www.allrecipes.com/recipe/261352/cinnamon-roll-bread-pudding/",
	//"https://www.thekitchn.com/gado-gado-recipe-23649720",
}

func TestFetch(t *testing.T) {
	if testing.Short() {
		t.Skip()
	}

	fetcher, err := NewFetcher()
	assert.NilError(t, err)

	for _, url := range urls {
		bytes, err := fetcher.Fetch(context.Background(), url)
		if err != nil {
			t.Errorf("Failed to fetch %s", url)
		}

		// save files for other tests
		base := filepath.Base(url)
		path := filepath.Join("testdata", base+".html")
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

	_, err = fetcher.Fetch(context.Background(), "not a valid url")
	if err == nil {
		t.Error("Failed to return error for invalid url")
	}
}
