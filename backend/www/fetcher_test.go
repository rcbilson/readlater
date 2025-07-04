package www

import (
	"context"
	"os"
	"path/filepath"
	"testing"
)

var urls = [...]string{
	"https://www.allrecipes.com/recipe/220943/chef-johns-buttermilk-biscuits",
	"https://www.seriouseats.com/classic-banana-bread-recipe",
        "https://www.npr.org/2025/06/09/nx-s1-5340706/homes-energy-tips-heating-air-conditioning",
	//"https://www.seriouseats.com/bravetart-homemade-cinnamon-rolls-recipe",
	//"https://www.recipetineats.com/christmas-cake-moist-easy-fruit-cake/",
	//"https://www.spendwithpennies.com/easy-cheesy-scalloped-potatoes-and-the-secret-to-getting-them-to-cook-quickly/",
	//"https://www.allrecipes.com/recipe/261352/cinnamon-roll-bread-pudding/",
	//"https://www.thekitchn.com/gado-gado-recipe-23649720",
	//"https://www.seriouseats.com/one-pot-salmon-curried-leeks-yogurt-sauce-recipe",
	//"https://kaleforniakravings.com/easy-pan-seared-salmon-with-lemon-dijon-sauce",
}

func TestFetch(t *testing.T) {
	if testing.Short() {
		t.Skip()
	}

	for _, url := range urls {
		bytes, finalURL, err := FetcherCombined(context.Background(), url)
		if err != nil {
			t.Errorf("Failed to fetch %s", url)
		}
		
		t.Logf("Original URL: %s, Final URL: %s", url, finalURL)

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

	_, _, err := Fetcher(context.Background(), "not a valid url")
	if err == nil {
		t.Error("Failed to return error for invalid url")
	}
}
