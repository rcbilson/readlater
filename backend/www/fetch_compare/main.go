package main

import (
	"context"
	"fmt"

	"github.com/rcbilson/readlater/www"
)

var urls = [...]string{
	"https://www.allrecipes.com/recipe/220943/chef-johns-buttermilk-biscuits",
	"https://www.seriouseats.com/classic-banana-bread-recipe",
	//"https://www.seriouseats.com/bravetart-homemade-cinnamon-rolls-recipe",
	//"https://www.recipetineats.com/christmas-cake-moist-easy-fruit-cake/",
	//"https://www.spendwithpennies.com/easy-cheesy-scalloped-potatoes-and-the-secret-to-getting-them-to-cook-quickly/",
	//"https://www.allrecipes.com/recipe/261352/cinnamon-roll-bread-pudding/",
	//"https://www.thekitchn.com/gado-gado-recipe-23649720",
	//"https://www.seriouseats.com/one-pot-salmon-curried-leeks-yogurt-sauce-recipe",
	//"https://kaleforniakravings.com/easy-pan-seared-salmon-with-lemon-dijon-sauce",
}

func FetchTest(fetcher www.FetcherFunc, name string) {
	fmt.Printf("%s ============================\n", name)
	errors := 0
	successes := 0
	for _, url := range urls {
		bytes, err := fetcher(context.Background(), url)
		if err != nil {
			fmt.Printf("%s error: %v\n", url, err)
			errors++
		} else {
			fmt.Printf("%s success length: %d\n", url, len(bytes))
			successes++
		}
	}
	fmt.Printf("%s: successes:%d errors:%d\n", name, successes, errors)
}

func main() {
	FetchTest(www.Fetcher, "Fetcher")
	FetchTest(www.FetcherSpoof, "FetcherSpoof")
	FetchTest(www.FetcherCurl, "FetcherCurl")
}
