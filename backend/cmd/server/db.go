package main

import (
	"context"
	"database/sql"
	"unicode"
	"unicode/utf8"

	"github.com/kelseyhightower/envconfig"
	_ "github.com/mattn/go-sqlite3"
)

type DbContext struct {
	db *sql.DB
}

func InitializeDb(dbfile string) (*DbContext, error) {
	var ctx DbContext

	var s specification
	err := envconfig.Process("recipe", &s)
	if err != nil {
		return nil, err
	}

	ctx.db, err = sql.Open("sqlite3", dbfile)
	if err != nil {
		return nil, err
	}

	return &ctx, nil
}

func (ctx *DbContext) Close() {
	ctx.db.Close()
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
	rows, err := dbctx.db.QueryContext(ctx, "SELECT summary ->> '$.title', url FROM recipes ORDER BY lastAccess DESC LIMIT ?", count)
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
	_, err := dbctx.db.ExecContext(ctx, "INSERT INTO recipes (url, summary, lastAccess) VALUES (?, json(?), datetime('now'))", url, summary)
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
