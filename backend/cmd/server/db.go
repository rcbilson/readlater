package main

import (
	"database/sql"

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
func (ctx *DbContext) Get(url string) (string, bool) {
	row := ctx.db.QueryRow("SELECT summary FROM recipes WHERE url = ?", url)
	var summary string
	err := row.Scan(&summary)
	if err != nil {
		return "", false
	}
	_, err = ctx.db.Exec("UPDATE recipes SET lastAccess = datetime('now') WHERE url = ?", url)
	return summary, true
}

// Returns the most recently-accessed recipes
func (ctx *DbContext) Recents(count int) (recents, error) {
	rows, err := ctx.db.Query("SELECT summary ->> '$.title', url FROM recipes ORDER BY lastAccess DESC LIMIT ?", count)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var result recents

	for rows.Next() {
		var r recent
		err := rows.Scan(&r.Title, &r.Url)
		if err != nil {
			return nil, err
		}
		result = append(result, r)
	}
	return result, nil
}

// Insert the recipe summary corresponding to the url into the database
func (ctx *DbContext) Insert(url string, summary string) error {
	_, err := ctx.db.Exec("INSERT INTO recipes (url, summary, lastAccess) VALUES (?, ?, datetime('now'))", url, summary)
	return err
}
