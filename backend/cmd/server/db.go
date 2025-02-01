package main

import (
	"context"
	"database/sql"
	"unicode"
	"unicode/utf8"

	_ "github.com/mattn/go-sqlite3"
)

type Usage struct {
	Url       string
	LengthIn  int
	LengthOut int
	TokensIn  int
	TokensOut int
}

type Db interface {
	Close()
	Hit(ctx context.Context, url string) error
	Get(ctx context.Context, url string) (string, bool)
	Recents(ctx context.Context, count int) (recipeList, error)
	Favorites(ctx context.Context, count int) (recipeList, error)
	Insert(ctx context.Context, url string, summary string) error
	Search(ctx context.Context, pattern string) (recipeList, error)
	Usage(ctx context.Context, usage Usage) error
}

type DbContext struct {
	db *sql.DB
}

func NewDb(dbfile string) (Db, error) {
	db, err := sql.Open("sqlite3", dbfile)
	if err != nil {
		return nil, err
	}

	return &DbContext{db}, nil
}

func NewTestDb() (*DbContext, error) {
	db, err := sql.Open("sqlite3", ":memory:")
	if err != nil {
		return nil, err
	}

	_, err = db.Exec(`
CREATE TABLE recipes (
  url text primary key,
  summary text,
  lastAccess datetime,
  hitCount integer
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
	if err != nil {
		return nil, err
	}

	return &DbContext{db}, err
}

func (ctx *DbContext) Close() {
	ctx.db.Close()
}

// Returns a recipe summary if one exists in the database
func (dbctx *DbContext) Hit(ctx context.Context, url string) error {
	_, err := dbctx.db.Exec("UPDATE recipes SET hitCount = hitCount + 1 WHERE url = ?", url)
	return err
}

// Returns a recipe summary if one exists in the database
func (dbctx *DbContext) Get(ctx context.Context, url string) (string, bool) {
	row := dbctx.db.QueryRowContext(ctx, "SELECT summary FROM recipes WHERE url = ?", url)
	var summary string
	err := row.Scan(&summary)
	if err != nil {
		return "", false
	}
	_, err = dbctx.db.Exec("UPDATE recipes SET lastAccess = datetime('now') WHERE url = ?", url)
	return summary, true
}

// Returns the most recently-accessed recipes
func (dbctx *DbContext) Recents(ctx context.Context, count int) (recipeList, error) {
	rows, err := dbctx.db.QueryContext(ctx, `SELECT summary ->> '$.title', url FROM recipes WHERE summary != '""' ORDER BY lastAccess DESC LIMIT ?`, count)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var result recipeList

	for rows.Next() {
		var r recipeEntry
		err := rows.Scan(&r.Title, &r.Url)
		if err != nil {
			return nil, err
		}
		result = append(result, r)
	}
	return result, nil
}

// Returns the most frequently-accessed recipes
func (dbctx *DbContext) Favorites(ctx context.Context, count int) (recipeList, error) {
	rows, err := dbctx.db.QueryContext(ctx, `SELECT summary ->> '$.title', url FROM recipes WHERE summary != '""' ORDER BY hitCount DESC LIMIT ?`, count)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var result recipeList

	for rows.Next() {
		var r recipeEntry
		err := rows.Scan(&r.Title, &r.Url)
		if err != nil {
			return nil, err
		}
		result = append(result, r)
	}
	return result, nil
}

// Insert the recipe summary corresponding to the url into the database
func (dbctx *DbContext) Insert(ctx context.Context, url string, summary string) error {
	_, err := dbctx.db.ExecContext(ctx, "INSERT INTO recipes (url, summary, lastAccess, hitCount) VALUES (?, json(?), datetime('now'), 0)", url, summary)
	return err
}

// Search for recipes matching a pattern
func (dbctx *DbContext) Search(ctx context.Context, pattern string) (recipeList, error) {
	if pattern == "" {
		return nil, nil
	}
	// If the final token in the pattern is a letter, add a star to treat it as
	// a prefix query
	lastRune, _ := utf8.DecodeLastRuneInString(pattern)
	if unicode.IsLetter(lastRune) {
		pattern += "*"
	}
	rows, err := dbctx.db.QueryContext(ctx, "SELECT summary ->> '$.title', url FROM fts where fts MATCH ? ORDER BY rank", pattern)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var result recipeList

	for rows.Next() {
		var r recipeEntry
		err := rows.Scan(&r.Title, &r.Url)
		if err != nil {
			return nil, err
		}
		result = append(result, r)
	}
	return result, nil
}

func (dbctx *DbContext) Usage(ctx context.Context, usage Usage) error {
	_, err := dbctx.db.ExecContext(ctx,
		"INSERT INTO usage (url, lengthIn, lengthOut, tokensIn, tokensOut) VALUES (?, ?, ?, ?, ?)",
		usage.Url, usage.LengthIn, usage.LengthOut, usage.TokensIn, usage.TokensOut)
	return err
}
