package main

import (
	"context"
	"database/sql"
	"fmt"
	"unicode"
	"unicode/utf8"

	"github.com/rcbilson/recipe/sqlite"
)

type Usage struct {
	Url       string
	LengthIn  int
	LengthOut int
	TokensIn  int
	TokensOut int
}

type Repo struct {
	db *sql.DB
}

func NewRepo(dbfile string) (Repo, error) {
	db, err := sqlite.NewFromFile(dbfile, schema)
	if err != nil {
		return Repo{}, err
	}

	return Repo{db}, nil
}

func NewTestRepo() (Repo, error) {
	db, err := sqlite.NewFromMemory(schema)
	if err != nil {
		return Repo{}, err
	}

	return Repo{db}, err
}

func (ctx *Repo) Close() {
	ctx.db.Close()
}

// Returns a recipe summary if one exists in the database
func (repo *Repo) Hit(ctx context.Context, url string) error {
	_, err := repo.db.Exec("UPDATE recipes SET hitCount = hitCount + 1 WHERE url = ?", url)
	return err
}

// Returns a recipe summary if one exists in the database
func (repo *Repo) Get(ctx context.Context, url string) (string, bool) {
	row := repo.db.QueryRowContext(ctx, "SELECT summary FROM recipes WHERE url = ?", url)
	var summary string
	err := row.Scan(&summary)
	if err != nil {
		return "", false
	}
	_, _ = repo.db.Exec("UPDATE recipes SET lastAccess = datetime('now') WHERE url = ?", url)
	return summary, true
}

const listQuery = `
		SELECT summary ->> '$.title', url,
			   (summary ->> '$.ingredients' IS NOT NULL) AND (summary ->> '$.method' IS NOT NULL)
		FROM recipes WHERE summary != '""' ORDER BY %s DESC LIMIT ?;`

// Returns the most recently-accessed recipes
func (repo *Repo) Recents(ctx context.Context, count int) (recipeList, error) {
	query := fmt.Sprintf(listQuery, "lastAccess")
	rows, err := repo.db.QueryContext(ctx, query, count)
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
func (repo *Repo) Favorites(ctx context.Context, count int) (recipeList, error) {
	query := fmt.Sprintf(listQuery, "hitCount")
	rows, err := repo.db.QueryContext(ctx, query, count)
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
func (repo *Repo) Insert(ctx context.Context, url string, summary string, user User) error {
	_, err := repo.db.ExecContext(ctx,
		"INSERT INTO recipes (url, summary, user, lastAccess, hitCount) VALUES (?, json(?), ?, datetime('now'), 0)",
		url, summary, user)
	return err
}

// Search for recipes matching a pattern
func (repo *Repo) Search(ctx context.Context, pattern string) (recipeList, error) {
	if pattern == "" {
		return nil, nil
	}
	// If the final token in the pattern is a letter, add a star to treat it as
	// a prefix query
	lastRune, _ := utf8.DecodeLastRuneInString(pattern)
	if unicode.IsLetter(lastRune) {
		pattern += "*"
	}
	rows, err := repo.db.QueryContext(ctx, "SELECT summary ->> '$.title', url FROM fts where fts MATCH ? ORDER BY rank", pattern)
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

func (repo *Repo) Usage(ctx context.Context, usage Usage) error {
	_, err := repo.db.ExecContext(ctx,
		"INSERT INTO usage (url, lengthIn, lengthOut, tokensIn, tokensOut) VALUES (?, ?, ?, ?, ?)",
		usage.Url, usage.LengthIn, usage.LengthOut, usage.TokensIn, usage.TokensOut)
	return err
}

func (repo *Repo) GetSession(ctx context.Context, email string) string {
	row := repo.db.QueryRowContext(ctx, "SELECT nonce FROM session WHERE email = ?", email)
	var nonce string
	_ = row.Scan(&nonce)
	return nonce
}
