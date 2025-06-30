package main

import (
	"context"
	"database/sql"
	"unicode"
	"unicode/utf8"

	"github.com/rcbilson/readlater/sqlite"
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
	//db, err := sqlite.NewFromFile("/tmp/xxx.db", schema)
	if err != nil {
		return Repo{}, err
	}

	return Repo{db}, err
}

func (ctx *Repo) Close() {
	ctx.db.Close()
}

// Returns a article contents if one exists in the database
func (repo *Repo) Get(ctx context.Context, url string) (*article, bool) {
	row := repo.db.QueryRowContext(ctx, "SELECT title, contents FROM articles WHERE url = ?", url)
	art := article{Url: url}
	err := row.Scan(&art.Title, &art.Contents)
	if err != nil {
		return &art, false
	}
	_, _ = repo.db.Exec("UPDATE articles SET unread = false, lastAccess = datetime('now') WHERE url = ?", url)
	return &art, true
}

// Returns a article contents without updating unread status or lastAccess time
func (repo *Repo) GetWithoutUpdating(ctx context.Context, url string) (*article, bool) {
	row := repo.db.QueryRowContext(ctx, "SELECT title, contents FROM articles WHERE url = ?", url)
	art := article{Url: url}
	err := row.Scan(&art.Title, &art.Contents)
	if err != nil {
		return &art, false
	}
	return &art, true
}

// Returns the most recently-accessed articles
func (repo *Repo) Recents(ctx context.Context, count int) (articleList, error) {
	query := `
		SELECT title, url, (contents IS NOT NULL), unread, archived FROM articles WHERE NOT archived
		ORDER BY lastAccess DESC LIMIT ?;`
	rows, err := repo.db.QueryContext(ctx, query, count)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var result articleList

	for rows.Next() {
		var r articleEntry
		err := rows.Scan(&r.Title, &r.Url, &r.HasBody, &r.Unread, &r.Archived)
		if err != nil {
			return nil, err
		}
		result = append(result, r)
	}
	return result, nil
}

// Returns the most frequently-accessed articles
func (repo *Repo) Archive(ctx context.Context, count int) (articleList, error) {
	query := `
		SELECT title, url, (contents IS NOT NULL), unread, archived FROM articles 
		ORDER BY created DESC LIMIT ?;`
	rows, err := repo.db.QueryContext(ctx, query, count)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var result articleList

	for rows.Next() {
		var r articleEntry
		err := rows.Scan(&r.Title, &r.Url, &r.HasBody, &r.Unread, &r.Archived)
		if err != nil {
			return nil, err
		}
		result = append(result, r)
	}
	return result, nil
}

// Insert the article contents corresponding to the url into the database
func (repo *Repo) Insert(ctx context.Context, art *article) error {
	_, err := repo.db.ExecContext(ctx,
		"INSERT INTO articles (title, url, contents) VALUES (?, ?, ?)",
		art.Title, art.Url, art.Contents)
	return err
}

// Insert the article contents with a custom created timestamp
func (repo *Repo) InsertWithTimestamp(ctx context.Context, art *article, createdTime string) error {
	_, err := repo.db.ExecContext(ctx,
		"INSERT INTO articles (title, url, contents, created) VALUES (?, ?, ?, ?)",
		art.Title, art.Url, art.Contents, createdTime)
	return err
}

// Insert the article contents corresponding to the url into the database
func (repo *Repo) SetArchive(ctx context.Context, url string, archive bool) error {
	_, err := repo.db.ExecContext(ctx,
		"UPDATE articles SET archived = ? WHERE url = ?",
		archive, url)
	return err
}

// Mark an article as read by updating unread status and lastAccess time
func (repo *Repo) MarkRead(ctx context.Context, url string) error {
	_, err := repo.db.ExecContext(ctx,
		"UPDATE articles SET unread = false, lastAccess = datetime('now') WHERE url = ?",
		url)
	return err
}

// Search for articles matching a pattern
func (repo *Repo) Search(ctx context.Context, pattern string) (articleList, error) {
	if pattern == "" {
		return nil, nil
	}
	// If the final token in the pattern is a letter, add a star to treat it as
	// a prefix query
	lastRune, _ := utf8.DecodeLastRuneInString(pattern)
	if unicode.IsLetter(lastRune) {
		pattern += "*"
	}
	rows, err := repo.db.QueryContext(ctx, "SELECT a.title, a.url, (a.contents IS NOT NULL), a.unread, a.archived FROM fts INNER JOIN articles a ON fts.url = a.url WHERE fts MATCH ? ORDER BY rank", pattern)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var result articleList

	for rows.Next() {
		var r articleEntry
		err := rows.Scan(&r.Title, &r.Url, &r.HasBody, &r.Unread, &r.Archived)
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
