package main

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"net/url"
	"strings"
	"testing"

	"github.com/rcbilson/readlater/llm"
	"gotest.tools/assert"
)

var urls = [...]string{
	"https://www.allrecipes.com/recipe/220943/chef-johns-buttermilk-biscuits",
	"https://www.seriouseats.com/classic-banana-bread-recipe",
	"https://knilson.org",
}

func mockFetcher(_ context.Context, url string) ([]byte, error) {
	return []byte("html for " + url), nil
}

type summaryStruct struct {
	Title       string   `json:"title"`
	Ingredients []string `json:"ingredients"`
}

type recipeListEntryStruct struct {
	Url   string `json:"url"`
	Title string `json:"title"`
}

type recipeListStruct []recipeListEntryStruct

func mockSummarizer(_ context.Context, recipe []byte, stats *llm.Usage) (string, error) {
	// split the recipe into words and use each word as an ingredient
	// this allows us to search for something non-trivial
	var summary = summaryStruct{
		Title:       "summary for " + string(recipe),
		Ingredients: strings.Split(string(recipe), ":/? "),
	}
	bytes, err := json.Marshal(summary)
	return string(bytes), err
}

func summarizeTest(t *testing.T, db Repo, url string) {
	var reqData struct {
		Url string `json:"url"`
	}
	reqData.Url = url
	data, err := json.Marshal(reqData)
	assert.NilError(t, err)
	req := httptest.NewRequest(http.MethodPost, "/summarize", bytes.NewReader(data))
	w := httptest.NewRecorder()
	summarize(mockSummarizer, db, mockFetcher)(w, req, User("test@example.com"))
	resp := w.Result()
	defer resp.Body.Close()

	var summary summaryStruct
	err = json.NewDecoder(resp.Body).Decode(&summary)
	assert.NilError(t, err)
	assert.Equal(t, "summary for html for "+url, summary.Title)
}

func listTest(t *testing.T, handler AuthHandlerFunc, reqName string, reqCount int, expCount int, resultList *recipeListStruct) {
	req := httptest.NewRequest(http.MethodGet, fmt.Sprintf("/%s?count=%d", reqName, reqCount), nil)
	w := httptest.NewRecorder()
	handler(w, req, User("test@example.com"))
	resp := w.Result()
	defer resp.Body.Close()

	var recipeList recipeListStruct
	err := json.NewDecoder(resp.Body).Decode(&recipeList)
	assert.NilError(t, err)
	assert.Equal(t, expCount, len(recipeList))
	if resultList != nil {
		*resultList = recipeList
	}
}

func searchTest(t *testing.T, db Repo, pattern string, expCount int) {
	req := httptest.NewRequest(http.MethodGet, fmt.Sprintf("/search?q=%s", url.QueryEscape(pattern)), nil)
	w := httptest.NewRecorder()
	search(db)(w, req, User("test@example.com"))
	resp := w.Result()
	defer resp.Body.Close()

	var recipeList recipeListStruct
	err := json.NewDecoder(resp.Body).Decode(&recipeList)
	assert.NilError(t, err)
	assert.Equal(t, expCount, len(recipeList))
}

func setArchiveTest(t *testing.T, db Repo, url string, archived bool) {
	archivedStr := "false"
	if archived {
		archivedStr = "true"
	}
	req := httptest.NewRequest(http.MethodPost, fmt.Sprintf("/setArchive?url=%s&setArchive=%s", url, archivedStr), nil)
	w := httptest.NewRecorder()
	setArchive(db)(w, req, User("test@example.com"))
	resp := w.Result()
	defer resp.Body.Close()
	assert.Equal(t, http.StatusOK, resp.StatusCode)
}

// TODO: test something other than the happy path
func TestHandlers(t *testing.T) {
	db, err := NewTestRepo()
	assert.NilError(t, err)

	// basic summarize request
	summarizeTest(t, db, urls[0])

	// repeating test should produce same result but hit db
	summarizeTest(t, db, urls[0])

	// set up a second summary in the db
	summarizeTest(t, db, urls[1])

	// set up a third summary in the db, but archive it
	summarizeTest(t, db, urls[2])
	setArchiveTest(t, db, urls[2], true)

	// ask for five recents, expect two
	listTest(t, fetchRecents(db), "recent", 5, 2, nil)

	// ask for one recent, expect one
	listTest(t, fetchRecents(db), "recent", 1, 1, nil)

	// ask for one archived, expect one
	listTest(t, fetchArchive(db), "archive", 1, 1, nil)

	// ask for five archived, expect three
	listTest(t, fetchArchive(db), "archive", 5, 3, nil)

	// should have one search hit
	searchTest(t, db, "buttermilk", 1)

	// prefix should be allowed
	searchTest(t, db, "buttermil", 1)

	// should have three search hits
	searchTest(t, db, "http", 3)

	// should have no search hits
	searchTest(t, db, "foo", 0)
}
