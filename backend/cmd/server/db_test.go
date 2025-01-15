package main

import (
	"context"
	"testing"

	"gotest.tools/assert"
)

func setupTest(t *testing.T) *DbContext {
	db, err := InitializeDb(":memory:")
	//db, err := InitializeDb("test.db")
	assert.NilError(t, err)
	t.Cleanup(db.Close)

	_, err = db.db.Exec(`
CREATE TABLE recipes (
  url text primary key,
  summary text,
  lastAccess datetime
);
CREATE VIRTUAL TABLE fts USING fts5(
  url UNINDEXED,
  summary,
  content='recipes',
  prefix='1 2 3',
  tokenize='porter unicode61'
);
CREATE TRIGGER recipes_ai AFTER INSERT ON recipes BEGIN
  INSERT INTO fts(rowid, url, summary) VALUES (new.rowid, new.url, new.summary);
END;
        `)
	assert.NilError(t, err)

	return db
}

func TestInsertGet(t *testing.T) {
	db := setupTest(t)
	ctx := context.Background()

	assert.NilError(t, db.Insert(ctx, "http://example.com", `{"title":"recipe"}`))
	assert.Assert(t, nil != db.Insert(ctx, "http://example.com", `{"title":"recipe"}`))
	summary, ok := db.Get(ctx, "http://example.com")
	assert.Assert(t, ok)
	assert.Equal(t, summary, `{"title":"recipe"}`)
	summary, ok = db.Get(ctx, "http://foo.com")
	assert.Assert(t, !ok)
}

func TestBadJson(t *testing.T) {
	db := setupTest(t)
	ctx := context.Background()

	assert.Error(t, db.Insert(ctx, "http://example.com", "recipe"), "malformed JSON")
}

func TestRecents(t *testing.T) {
	db := setupTest(t)
	ctx := context.Background()

	// set up two recipes
	assert.NilError(t, db.Insert(ctx, "http://example.com", `{"title":"recipe"}`))
	assert.NilError(t, db.Insert(ctx, "http://example2.com", `{"title":"recipe2"}`))
	assert.NilError(t, db.Insert(ctx, "http://example3.com", `""`))

	// ask for 5, expect 2
	recents, err := db.Recents(ctx, 5)
	assert.NilError(t, err)
	assert.Equal(t, 2, len(recents))
}

func TestSearch(t *testing.T) {
	db := setupTest(t)
	ctx := context.Background()

	// set up two recipes
	assert.NilError(t, db.Insert(ctx, "http://example.com", `{"title":"one two"}`))
	assert.NilError(t, db.Insert(ctx, "http://example2.com", `{"title":"one three"}`))

	// expect 2
	results, err := db.Search(ctx, "one")
	assert.NilError(t, err)
	assert.Equal(t, 2, len(results))

	// expect 1
	results, err = db.Search(ctx, "one two")
	assert.NilError(t, err)

	// expect 0
	results, err = db.Search(ctx, "one two three")
	assert.NilError(t, err)
	assert.Equal(t, 0, len(results))

	// expect 1, auto prefix final token
	results, err = db.Search(ctx, "one thr")
	assert.NilError(t, err)
	assert.Equal(t, 1, len(results))

	// expect 1, phrase match
	results, err = db.Search(ctx, `"one three"`)
	assert.NilError(t, err)
	assert.Equal(t, 1, len(results))

	// expect 0, no auto prefix
	results, err = db.Search(ctx, `"one thr"`)
	assert.NilError(t, err)
	assert.Equal(t, 0, len(results))
}

func TestGetUpdatesLastAccessed(t *testing.T) {
	db := setupTest(t)
	ctx := context.Background()

	_, err := db.db.Exec(`INSERT INTO recipes (url, summary, lastAccess) VALUES ('http://example.com', '{"title":"recipe"}', '2016-03-29')`)
	assert.NilError(t, err)
	_, err = db.db.Exec(`INSERT INTO recipes (url, summary, lastAccess) VALUES ('http://example2.com', '{"title":"recipe2"}', '2016-03-30')`)
	assert.NilError(t, err)

	// example2 should be the first result
	recents, err := db.Recents(ctx, 1)
	assert.NilError(t, err)
	assert.Equal(t, 1, len(recents))
	assert.Equal(t, "http://example2.com", recents[0].Url)
	assert.Equal(t, "recipe2", recents[0].Title)

	// a Get on example should make it the first result
	_, ok := db.Get(ctx, "http://example.com")
	assert.Equal(t, true, ok)
	recents, err = db.Recents(ctx, 1)
	assert.NilError(t, err)
	assert.Equal(t, 1, len(recents))
	assert.Equal(t, "http://example.com", recents[0].Url)
	assert.Equal(t, "recipe", recents[0].Title)
}

func TestInsertUpdatesLastAccessed(t *testing.T) {
	db := setupTest(t)
	ctx := context.Background()

	_, err := db.db.Exec(`INSERT INTO recipes (url, summary, lastAccess) VALUES ('http://example2.com', '{"title":"recipe2"}', '2016-03-30')`)
	assert.NilError(t, err)

	// example2 should be the first result
	recents, err := db.Recents(ctx, 1)
	assert.NilError(t, err)
	assert.Equal(t, 1, len(recents))
	assert.Equal(t, "http://example2.com", recents[0].Url)
	assert.Equal(t, "recipe2", recents[0].Title)

	// a inserting example should make it the first result
	assert.NilError(t, db.Insert(ctx, "http://example.com", `{"title":"recipe"}`))
	recents, err = db.Recents(ctx, 1)
	assert.NilError(t, err)
	assert.Equal(t, 1, len(recents))
	assert.Equal(t, "http://example.com", recents[0].Url)
	assert.Equal(t, "recipe", recents[0].Title)
}
