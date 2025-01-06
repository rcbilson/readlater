package main

import (
	"context"
	"fmt"
	"os"
	"path/filepath"
	"testing"
)

var urls = [...]string{
	"https://www.allrecipes.com/recipe/220943/chef-johns-buttermilk-biscuits",
	"https://www.seriouseats.com/classic-banana-bread-recipe",
        "https://www.seriouseats.com/bravetart-homemade-cinnamon-rolls-recipe",
        "https://www.recipetineats.com/christmas-cake-moist-easy-fruit-cake/",
        "https://www.spendwithpennies.com/easy-cheesy-scalloped-potatoes-and-the-secret-to-getting-them-to-cook-quickly/",
        "https://www.allrecipes.com/recipe/261352/cinnamon-roll-bread-pudding/",
}

func TestFetch(t *testing.T) {
	if testing.Short() {
		t.Skip()
	}

	for _, url := range urls {
		bytes, err := fetch(context.Background(), url)
		if err != nil {
			t.Error(fmt.Sprintf("Failed to fetch %s", url))
		}

		// save files for other tests
		base := filepath.Base(url)
		path := filepath.Join("testdata", base + ".html")
		file, err := os.Create(path)
		if err != nil {
			t.Error(fmt.Sprintf("Error creating file: %v", err))
		}
		defer file.Close()

		_, err = file.Write(bytes)
		if err != nil {
			t.Error(fmt.Sprintf("Error writing to file: %v", err))
		}
	}

	_, err := fetch(context.Background(), "not a valid url")
	if err == nil {
		t.Error("Failed to return error for invalid url")
	}
}
