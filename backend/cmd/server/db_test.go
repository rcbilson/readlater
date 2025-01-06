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
        `)
	assert.NilError(t, err)

	return db
}

func TestInsertGet(t *testing.T) {
	db := setupTest(t)
	ctx := context.Background()

	assert.NilError(t, db.Insert(ctx, "http://example.com", "recipe"))
	assert.Assert(t, nil != db.Insert(ctx, "http://example.com", "recipe2"))
	summary, ok := db.Get(ctx, "http://example.com")
	assert.Assert(t, ok)
	assert.Equal(t, summary, "recipe")
	summary, ok = db.Get(ctx, "http://foo.com")
	assert.Assert(t, !ok)
}

func TestRecents(t *testing.T) {
	db := setupTest(t)
	ctx := context.Background()

	// set up two recipes
	assert.NilError(t, db.Insert(ctx, "http://example.com", `{"title":"recipe"}`))
	assert.NilError(t, db.Insert(ctx, "http://example2.com", `{"title":"recipe2"}`))

	// ask for 5, expect 2
	recents, err := db.Recents(ctx, 5)
	assert.NilError(t, err)
	assert.Equal(t, 2, len(recents))
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
