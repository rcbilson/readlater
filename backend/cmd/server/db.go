package main

import (
	"context"
	"database/sql"
	"fmt"
	"unicode"
	"unicode/utf8"

	"knilson.org/recipe/sqlite"
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
	Insert(ctx context.Context, url string, summary string, user User) error
	Search(ctx context.Context, pattern string) (recipeList, error)
	Usage(ctx context.Context, usage Usage) error
	GetSession(ctx context.Context, email string) string
}

type DbContext struct {
	db *sql.DB
}

func NewDb(dbfile string) (Db, error) {
	db, err := sqlite.NewFromFile(dbfile, schema)
	if err != nil {
		return nil, err
	}

	return &DbContext{db}, nil
}

func NewTestDb() (*DbContext, error) {
	db, err := sqlite.NewFromMemory(schema)
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
	_, _ = dbctx.db.Exec("UPDATE recipes SET lastAccess = datetime('now') WHERE url = ?", url)
	return summary, true
}

const listQuery = `
		SELECT summary ->> '$.title', url,
			   (summary ->> '$.ingredients' IS NOT NULL) AND (summary ->> '$.method' IS NOT NULL)
		FROM recipes WHERE summary != '""' ORDER BY %s DESC LIMIT ?;`

// Returns the most recently-accessed recipes
func (dbctx *DbContext) Recents(ctx context.Context, count int) (recipeList, error) {
	query := fmt.Sprintf(listQuery, "lastAccess")
	rows, err := dbctx.db.QueryContext(ctx, query, count)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var result recipeList

	for rows.Next() {
		var r recipeEntry
		err := rows.Scan(&r.Title, &r.Url, &r.HasSummary)
		if err != nil {
			return nil, err
		}
		result = append(result, r)
	}
	return result, nil
}

// Returns the most frequently-accessed recipes
func (dbctx *DbContext) Favorites(ctx context.Context, count int) (recipeList, error) {
	query := fmt.Sprintf(listQuery, "hitCount")
	rows, err := dbctx.db.QueryContext(ctx, query, count)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var result recipeList

	for rows.Next() {
		var r recipeEntry
		err := rows.Scan(&r.Title, &r.Url, &r.HasSummary)
		if err != nil {
			return nil, err
		}
		result = append(result, r)
	}
	return result, nil
}

// Insert the recipe summary corresponding to the url into the database
func (dbctx *DbContext) Insert(ctx context.Context, url string, summary string, user User) error {
	_, err := dbctx.db.ExecContext(ctx,
		"INSERT INTO recipes (url, summary, user, lastAccess, hitCount) VALUES (?, json(?), ?, datetime('now'), 0)",
		url, summary, user)
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

func (dbctx *DbContext) GetSession(ctx context.Context, email string) string {
	row := dbctx.db.QueryRowContext(ctx, "SELECT nonce FROM session WHERE email = ?", email)
	var nonce string
	_ = row.Scan(&nonce)
	return nonce
}
