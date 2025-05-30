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

	"gotest.tools/assert"
)

type mockFetcher struct {
}

func (*mockFetcher) Fetch(_ context.Context, url string) ([]byte, error) {
	return []byte("html for " + url), nil
}

type mockLlm struct {
	t *testing.T
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

func (llm *mockLlm) Ask(_ context.Context, recipe []byte, stats *LlmStats) (string, error) {
	// split the recipe into words and use each word as an ingredient
	// this allows us to search for something non-trivial
	var summary = summaryStruct{
		Title:       "summary for " + string(recipe),
		Ingredients: strings.Split(string(recipe), ":/? "),
	}
	bytes, err := json.Marshal(summary)
	assert.NilError(llm.t, err)
	return string(bytes), nil
}

var testFetcher = &mockFetcher{}

func summarizeTest(t *testing.T, llm Llm, db Db, url string) {
	var reqData struct {
		Url string `json:"url"`
	}
	reqData.Url = url
	data, err := json.Marshal(reqData)
	assert.NilError(t, err)
	req := httptest.NewRequest(http.MethodPost, "/summarize", bytes.NewReader(data))
	w := httptest.NewRecorder()
	summarize(llm, db, testFetcher)(w, req, User("test@example.com"))
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

func searchTest(t *testing.T, db Db, pattern string, expCount int) {
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

func hitTest(_ *testing.T, db Db, urlstr string) {
	req := httptest.NewRequest(http.MethodPost, fmt.Sprintf("/hit?url=%s", url.QueryEscape(urlstr)), nil)
	w := httptest.NewRecorder()
	hit(db)(w, req, User("test@example.com"))
	resp := w.Result()
	defer resp.Body.Close()
}

// TODO: test something other than the happy path
func TestHandlers(t *testing.T) {
	testLlm := &mockLlm{t}

	db, err := NewTestDb()
	assert.NilError(t, err)

	// basic summarize request
	summarizeTest(t, testLlm, db, urls[0])

	// repeating test should produce same result but hit db
	summarizeTest(t, testLlm, db, urls[0])

	// set up a second summary in the db
	summarizeTest(t, testLlm, db, urls[1])

	// ask for five recents, expect two
	listTest(t, fetchRecents(db), "recent", 5, 2, nil)

	// ask for one recent, expect one
	listTest(t, fetchRecents(db), "recent", 1, 1, nil)

	// ask for one favorite, expect one
	listTest(t, fetchFavorites(db), "favorite", 1, 1, nil)

	// ask for five favorites, expect two
	var resultList recipeListStruct
	listTest(t, fetchFavorites(db), "favorite", 5, 2, &resultList)

	// hit whichever was reported second
	hitTest(t, db, resultList[1].Url)

	// ask for the favorites after the hit, second should now be first
	var newResultList recipeListStruct
	listTest(t, fetchFavorites(db), "favorite", 2, 2, &newResultList)
	assert.Equal(t, resultList[1].Title, newResultList[0].Title)

	// should have one search hit
	searchTest(t, db, "buttermilk", 1)

	// prefix should be allowed
	searchTest(t, db, "buttermil", 1)

	// should have two search hits
	searchTest(t, db, "http", 2)

	// should have no search hits
	searchTest(t, db, "foo", 0)
}
