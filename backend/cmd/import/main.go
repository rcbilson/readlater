package main

import (
	"context"
	"database/sql"
	"encoding/csv"
	"flag"
	"fmt"
	"io"
	"log"
	"net/url"
	"os"
	"os/exec"
	"regexp"
	"strconv"
	"time"

	"github.com/rcbilson/readlater/sqlite"
	"github.com/rcbilson/readlater/www"
)

type specification struct {
	CsvFile  string
	DbFile   string
	DryRun   bool
}

type csvRecord struct {
	Title     string
	URL       string
	TimeAdded int64
	Tags      string
	Status    string
}

// Copied types from server package
type article struct {
	Title    string `json:"title"`
	Url      string `json:"url"`
	Contents string `json:"contents"`
}

type summarizeFunc func(ctx context.Context, html []byte) (string, error)

// Repo interface (simplified for import needs)
type Repo interface {
	Get(ctx context.Context, url string) (*article, bool)
	InsertWithTimestamp(ctx context.Context, art *article, createdTime string) error
	Close()
}

var titleExtractor = regexp.MustCompile(`^# (.*)\n`)

// Simple repo implementation
type repo struct {
	db *sql.DB
}

func newRepo(dbfile string) (Repo, error) {
	// Use the same schema as the server
	schema := []string{
		`
CREATE TABLE IF NOT EXISTS metadata (
  id integer primary key,
  schemaVersion integer
);

CREATE TABLE IF NOT EXISTS articles (
  url text primary key,
  contents text,
  title text,
  unread boolean default true,
  archived boolean default false,
  created datetime default current_timestamp,
  lastAccess datetime default current_timestamp
);

CREATE TABLE IF NOT EXISTS usage (
  timestamp datetime default current_timestamp,
  url text,
  lengthIn integer,
  lengthOut integer,
  tokensIn integer,
  tokensOut integer
);

CREATE VIRTUAL TABLE IF NOT EXISTS fts USING fts5(
  url UNINDEXED,
  title,
  contents,
  content='articles',
  prefix='1 2 3',
  tokenize='porter unicode61'
);

-- Triggers to keep the FTS index up to date.
CREATE TRIGGER IF NOT EXISTS articles_ai AFTER INSERT ON articles BEGIN
  INSERT INTO fts(rowid, url, title, contents) VALUES (new.rowid, new.url, new.title, new.contents);
END;

CREATE TRIGGER IF NOT EXISTS articles_ad AFTER DELETE ON articles BEGIN
  INSERT INTO fts(fts, rowid, url, title, contents) VALUES('delete', old.rowid, old.url, old.title, old.contents);
END;

CREATE TRIGGER IF NOT EXISTS articles_au AFTER UPDATE ON articles BEGIN
  INSERT INTO fts(fts, rowid, url, title, contents) VALUES('delete', old.rowid, old.url, old.title, old.contents);
  INSERT INTO fts(rowid, url, title, contents) VALUES (new.rowid, new.url, new.title, new.contents);
END;
		`,
	}

	db, err := sqlite.NewFromFile(dbfile, schema)
	if err != nil {
		return nil, err
	}

	return &repo{db}, nil
}

func (r *repo) Get(ctx context.Context, url string) (*article, bool) {
	row := r.db.QueryRowContext(ctx, "SELECT title, contents FROM articles WHERE url = ?", url)
	art := &article{Url: url}
	err := row.Scan(&art.Title, &art.Contents)
	if err != nil {
		return nil, false
	}
	return art, true
}

func (r *repo) InsertWithTimestamp(ctx context.Context, art *article, createdTime string) error {
	_, err := r.db.ExecContext(ctx,
		"INSERT INTO articles (title, url, contents, created) VALUES (?, ?, ?, ?)",
		art.Title, art.Url, art.Contents, createdTime)
	return err
}

func (r *repo) Close() {
	r.db.Close()
}

func main() {
	var spec specification
	
	flag.StringVar(&spec.CsvFile, "csv", "", "Path to CSV file to import")
	flag.StringVar(&spec.DbFile, "db", "/home/richard/src/readlater/data/readlater.db", "Path to database file")
	flag.BoolVar(&spec.DryRun, "dry-run", false, "Preview import without making changes")
	flag.Parse()

	if spec.CsvFile == "" {
		log.Fatal("CSV file path is required (-csv flag)")
	}

	if err := importArticles(spec); err != nil {
		log.Fatal("Import failed:", err)
	}
}

func importArticles(spec specification) error {
	fmt.Printf("Import configuration:\n")
	fmt.Printf("  CSV file: %s\n", spec.CsvFile)
	fmt.Printf("  DB file: %s\n", spec.DbFile)
	fmt.Printf("  Dry run: %v\n", spec.DryRun)
	fmt.Println()

	// Parse CSV file
	records, err := parseCSV(spec.CsvFile)
	if err != nil {
		return fmt.Errorf("failed to parse CSV: %w", err)
	}

	fmt.Printf("Found %d records in CSV\n", len(records))

	if spec.DryRun {
		fmt.Println("\nDry run mode - showing first 5 records:")
		for i, record := range records {
			if i >= 5 {
				break
			}
			fmt.Printf("  %d. URL: %s, Time: %s, Title: %s\n", 
				i+1, record.URL, time.Unix(record.TimeAdded, 0).Format("2006-01-02 15:04:05"), record.Title)
		}
		return nil
	}

	// Initialize database
	db, err := newRepo(spec.DbFile)
	if err != nil {
		return fmt.Errorf("failed to initialize database: %w", err)
	}
	defer db.Close()

	// Initialize fetcher and summarizer
	fetcher := www.FetcherCombined
	summarizer := pandocSummarizer()

	// Process records
	return processRecords(records, db, fetcher, summarizer)
}

func parseCSV(filename string) ([]csvRecord, error) {
	file, err := os.Open(filename)
	if err != nil {
		return nil, err
	}
	defer file.Close()

	reader := csv.NewReader(file)
	rows, err := reader.ReadAll()
	if err != nil {
		return nil, err
	}

	if len(rows) == 0 {
		return nil, fmt.Errorf("CSV file is empty")
	}

	// Skip header row
	var records []csvRecord
	for i, row := range rows[1:] {
		if len(row) < 5 {
			log.Printf("Skipping row %d: insufficient columns (%d)", i+2, len(row))
			continue
		}

		timeAdded, err := strconv.ParseInt(row[2], 10, 64)
		if err != nil {
			log.Printf("Skipping row %d: invalid timestamp '%s': %v", i+2, row[2], err)
			continue
		}

		record := csvRecord{
			Title:     row[0],
			URL:       row[1],
			TimeAdded: timeAdded,
			Tags:      row[3],
			Status:    row[4],
		}
		records = append(records, record)
	}

	return records, nil
}

func processRecords(records []csvRecord, db Repo, fetcher www.FetcherFunc, summarizer summarizeFunc) error {
	ctx := context.Background()
	total := len(records)
	processed := 0
	skipped := 0
	failed := 0

	fmt.Printf("\nProcessing %d records...\n\n", total)

	for i, record := range records {
		fmt.Printf("[%d/%d] Processing: %s\n", i+1, total, record.URL)

		// Check if article already exists
		if _, exists := db.Get(ctx, record.URL); exists {
			fmt.Printf("  ✓ Already exists, skipping\n")
			skipped++
			continue
		}

		// Fetch and process article
		if err := processRecord(ctx, record, db, fetcher, summarizer); err != nil {
			fmt.Printf("  ✗ Failed: %v\n", err)
			failed++
		} else {
			fmt.Printf("  ✓ Imported successfully\n")
			processed++
		}
	}

	fmt.Printf("\nImport summary:\n")
	fmt.Printf("  Total records: %d\n", total)
	fmt.Printf("  Successfully imported: %d\n", processed)
	fmt.Printf("  Skipped (already exist): %d\n", skipped)
	fmt.Printf("  Failed: %d\n", failed)

	return nil
}

func processRecord(ctx context.Context, record csvRecord, db Repo, fetcher www.FetcherFunc, summarizer summarizeFunc) error {
	// Validate URL
	if _, err := url.Parse(record.URL); err != nil {
		return fmt.Errorf("invalid URL: %w", err)
	}

	// Fetch content
	html, finalURL, err := fetcher(ctx, record.URL)
	if err != nil {
		return fmt.Errorf("failed to fetch: %w", err)
	}

	// Check final URL if different from original
	if finalURL != record.URL {
		if _, exists := db.Get(ctx, finalURL); exists {
			return fmt.Errorf("final URL already exists: %s", finalURL)
		}
	}

	// Process content with summarizer
	contents, err := summarizer(ctx, html)
	if err != nil {
		return fmt.Errorf("failed to process content: %w", err)
	}

	// Extract title
	title := extractTitle(&contents, html, finalURL, record.Title)

	// Create article
	art := &article{
		Title:    title,
		Url:      finalURL,
		Contents: contents,
	}

	// Convert timestamp to SQLite datetime format
	createdTime := time.Unix(record.TimeAdded, 0).UTC().Format("2006-01-02 15:04:05")

	// Insert with timestamp
	return db.InsertWithTimestamp(ctx, art, createdTime)
}

func extractTitle(md *string, html []byte, urlString string, titleHint string) string {
	matches := titleExtractor.FindStringSubmatch(*md)
	if matches != nil && len(matches) > 1 {
		return matches[1]
	}

	// sometimes the browser gives us the title for nothing
	if titleHint != "" {
		return titleHint
	}

	// Try to extract the title from the HTML
	title := www.HtmlTitle(html)
	if title != "" {
		return title
	}

	// In desperation, use the URL
	parsedUrl, err := url.Parse(urlString)
	if err == nil {
		return parsedUrl.Path
	} else {
		return urlString
	}
}

func pandocSummarizer() summarizeFunc {
	return func(ctx context.Context, article []byte) (string, error) {
		// Use os/exec to run pandoc
		cmd := exec.CommandContext(ctx, "pandoc", "-f", "html", "-t", "commonmark", "--strip-comments")
		stdin, err := cmd.StdinPipe()
		if err != nil {
			return "", fmt.Errorf("failed to get stdin pipe: %w", err)
		}
		stdout, err := cmd.StdoutPipe()
		if err != nil {
			return "", fmt.Errorf("failed to get stdout pipe: %w", err)
		}
		if err := cmd.Start(); err != nil {
			return "", fmt.Errorf("failed to start pandoc: %w", err)
		}
		_, err = stdin.Write(article)
		stdin.Close()
		if err != nil {
			return "", fmt.Errorf("failed to write to pandoc stdin: %w", err)
		}
		output, err := io.ReadAll(stdout)
		if err != nil {
			return "", fmt.Errorf("failed to read pandoc output: %w", err)
		}
		if err := cmd.Wait(); err != nil {
			return "", fmt.Errorf("pandoc failed: %w", err)
		}
		return string(output), nil
	}
}