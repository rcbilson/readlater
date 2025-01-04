package main

import (
	"testing"

	"gotest.tools/assert"
)

func setupTest(t *testing.T) *DbContext {
	db, err := InitializeDb(":memory:")
	assert.NilError(t, err)
	t.Cleanup(db.Close)
        return db
}

func testInsertGet(t *testing.T) {
        db := setupTest(t)

        assert.NilError(t, db.Insert("http://example.com", "recipe"))
        assert.Assert(t, nil != db.Insert("http://example.com", "recipe2"))
        summary, ok := db.Get("http://example.com")
        assert.Assert(t, ok)
        assert.Equal(t, summary, "recipe")
        summary, ok = db.Get("http://foo.com")
        assert.Assert(t, !ok)
}
