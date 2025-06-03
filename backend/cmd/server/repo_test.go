package main

import (
	"context"
	"testing"

	"gotest.tools/assert"
)

const testUser = User("test@example.com")

func setupTest(t *testing.T) Repo {
	db, err := NewTestRepo()
	assert.NilError(t, err)
	t.Cleanup(db.Close)
	return db
}

func TestInsertGet(t *testing.T) {
	db := setupTest(t)
	ctx := context.Background()

	assert.NilError(t, db.Insert(ctx, "http://example.com", `{"title":"article"}`, testUser))
	assert.Assert(t, nil != db.Insert(ctx, "http://example.com", `{"title":"article"}`, testUser))
	summary, ok := db.Get(ctx, "http://example.com")
	assert.Assert(t, ok)
	assert.Equal(t, summary, `{"title":"article"}`)
	_, ok = db.Get(ctx, "http://foo.com")
	assert.Assert(t, !ok)
}

func TestBadJson(t *testing.T) {
	db := setupTest(t)
	ctx := context.Background()

	assert.Error(t, db.Insert(ctx, "http://example.com", "article", testUser), "malformed JSON")
}

func TestRecents(t *testing.T) {
	db := setupTest(t)
	ctx := context.Background()

	// set up two articles
	assert.NilError(t, db.Insert(ctx, "http://example.com", `{"title":"article"}`, testUser))
	assert.NilError(t, db.Insert(ctx, "http://example2.com", `{"title":"article2"}`, testUser))
	assert.NilError(t, db.Insert(ctx, "http://example3.com", `""`, testUser))
	assert.NilError(t, db.Insert(ctx, "http://example4.com", `{"title":"article4"}`, testUser))

	// mark one as archived
	assert.NilError(t, db.SetArchive(ctx, "http://example4.com", true))

	// ask for 5, expect 2
	recents, err := db.Recents(ctx, 5)
	assert.NilError(t, err)
	assert.Equal(t, 2, len(recents))
}

func TestArchive(t *testing.T) {
	db := setupTest(t)
	ctx := context.Background()

	// set up two articles
	assert.NilError(t, db.Insert(ctx, "http://example.com", `{"title":"article"}`, testUser))
	assert.NilError(t, db.Insert(ctx, "http://example2.com", `{"title":"article2"}`, testUser))

	// mark one as archived
	assert.NilError(t, db.SetArchive(ctx, "http://example.com", true))

	// ask for 5, expect 2
	archive, err := db.Archive(ctx, 5)
	assert.NilError(t, err)
	assert.Equal(t, 2, len(archive))
}

func TestSearch(t *testing.T) {
	db := setupTest(t)
	ctx := context.Background()

	// set up two articles
	assert.NilError(t, db.Insert(ctx, "http://example.com", `{"title":"one two"}`, testUser))
	assert.NilError(t, db.Insert(ctx, "http://example2.com", `{"title":"one three"}`, testUser))

	// expect 2
	results, err := db.Search(ctx, "one")
	assert.NilError(t, err)
	assert.Equal(t, 2, len(results))

	// expect 1
	results, err = db.Search(ctx, "one two")
	assert.NilError(t, err)
	assert.Equal(t, 1, len(results))

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

	_, err := db.db.Exec(`INSERT INTO articles (url, contents, lastAccess) VALUES ('http://example.com', '{"title":"article"}', '2016-03-29')`)
	assert.NilError(t, err)
	_, err = db.db.Exec(`INSERT INTO articles (url, contents, lastAccess) VALUES ('http://example2.com', '{"title":"article2"}', '2016-03-30')`)
	assert.NilError(t, err)

	// example2 should be the first result
	recents, err := db.Recents(ctx, 1)
	assert.NilError(t, err)
	assert.Equal(t, 1, len(recents))
	assert.Equal(t, "http://example2.com", recents[0].Url)
	assert.Equal(t, "article2", recents[0].Title)

	// a Get on example should make it the first result
	_, ok := db.Get(ctx, "http://example.com")
	assert.Equal(t, true, ok)
	recents, err = db.Recents(ctx, 1)
	assert.NilError(t, err)
	assert.Equal(t, 1, len(recents))
	assert.Equal(t, "http://example.com", recents[0].Url)
	assert.Equal(t, "article", recents[0].Title)
}

func TestInsertUpdatesLastAccessed(t *testing.T) {
	db := setupTest(t)
	ctx := context.Background()

	_, err := db.db.Exec(`INSERT INTO articles (url, contents, lastAccess) VALUES ('http://example2.com', '{"title":"article2"}', '2016-03-30')`)
	assert.NilError(t, err)

	// example2 should be the first result
	recents, err := db.Recents(ctx, 1)
	assert.NilError(t, err)
	assert.Equal(t, 1, len(recents))
	assert.Equal(t, "http://example2.com", recents[0].Url)
	assert.Equal(t, "article2", recents[0].Title)

	// a inserting example should make it the first result
	assert.NilError(t, db.Insert(ctx, "http://example.com", `{"title":"article"}`, testUser))
	recents, err = db.Recents(ctx, 1)
	assert.NilError(t, err)
	assert.Equal(t, 1, len(recents))
	assert.Equal(t, "http://example.com", recents[0].Url)
	assert.Equal(t, "article", recents[0].Title)
}
