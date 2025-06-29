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

var urls = [...]string{
	"https://www.allarticles.com/article/220943/chef-johns-buttermilk-biscuits",
	"https://www.seriouseats.com/classic-banana-bread-article",
	"https://knilson.org",
}

func mockFetcher(_ context.Context, url string) ([]byte, string, error) {
	return []byte("html for " + url), url, nil
}

type summaryStruct struct {
	Title       string   `json:"title"`
	Ingredients []string `json:"ingredients"`
}

type articleListEntryStruct struct {
	Url   string `json:"url"`
	Title string `json:"title"`
}

type articleListStruct []articleListEntryStruct

func mockSummarizer(_ context.Context, article []byte) (string, error) {
	// split the article into words and use each word as an ingredient
	// this allows us to search for something non-trivial
	return "# summary for " + string(article) + "\n" +
		strings.Join(strings.Split(string(article), ":/? "), " "), nil
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

func listTest(t *testing.T, handler AuthHandlerFunc, reqName string, reqCount int, expCount int, resultList *articleListStruct) {
	req := httptest.NewRequest(http.MethodGet, fmt.Sprintf("/%s?count=%d", reqName, reqCount), nil)
	w := httptest.NewRecorder()
	handler(w, req, User("test@example.com"))
	resp := w.Result()
	defer resp.Body.Close()

	var articleList articleListStruct
	err := json.NewDecoder(resp.Body).Decode(&articleList)
	assert.NilError(t, err)
	assert.Equal(t, expCount, len(articleList))
	if resultList != nil {
		*resultList = articleList
	}
}

func searchTest(t *testing.T, db Repo, pattern string, expCount int) {
	req := httptest.NewRequest(http.MethodGet, fmt.Sprintf("/search?q=%s", url.QueryEscape(pattern)), nil)
	w := httptest.NewRecorder()
	search(db)(w, req, User("test@example.com"))
	resp := w.Result()
	defer resp.Body.Close()

	var articleList articleListStruct
	err := json.NewDecoder(resp.Body).Decode(&articleList)
	assert.NilError(t, err)
	assert.Equal(t, expCount, len(articleList))
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
