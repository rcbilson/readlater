package main

import (
	"context"
	"database/sql"
	"flag"
	"fmt"
	"log"
	"strings"
	"time"

	md "github.com/JohannesKaufmann/html-to-markdown"
	"github.com/rcbilson/readlater/www"
	_ "github.com/mattn/go-sqlite3"
)

type article struct {
	Title    string `json:"title"`
	Url      string `json:"url"`
	Contents string `json:"contents"`
}

type summarizeFunc func(ctx context.Context, article []byte) (string, error)

type migrationStats struct {
	total     int
	processed int
	updated   int
	skipped   int
	failed    int
}

func htmlToMarkdownSummarizer() summarizeFunc {
	return func(ctx context.Context, article []byte) (string, error) {
		converter := md.NewConverter("", true, nil)
		
		// Configure options for better conversion
		converter.Use(md.Plugin(func(c *md.Converter) []md.Rule {
			return []md.Rule{
				// Custom rules can be added here if needed
			}
		}))
		
		// Convert HTML to markdown
		markdown, err := converter.ConvertString(string(article))
		if err != nil {
			return "", err
		}
		
		// Clean up extra whitespace and normalize line endings
		markdown = strings.TrimSpace(markdown)
		
		return markdown, nil
	}
}

func getAllArticles(ctx context.Context, db *sql.DB) ([]article, error) {
	query := `SELECT url, title, contents FROM articles WHERE contents IS NOT NULL ORDER BY created`
	rows, err := db.QueryContext(ctx, query)
	if err != nil {
		return nil, fmt.Errorf("failed to query articles: %w", err)
	}
	defer rows.Close()

	var articles []article
	for rows.Next() {
		var art article
		err := rows.Scan(&art.Url, &art.Title, &art.Contents)
		if err != nil {
			return nil, fmt.Errorf("failed to scan article: %w", err)
		}
		articles = append(articles, art)
	}

	return articles, nil
}

func updateArticleContent(ctx context.Context, db *sql.DB, url, newContent string) error {
	_, err := db.ExecContext(ctx, 
		"UPDATE articles SET contents = ? WHERE url = ?", 
		newContent, url)
	return err
}

func migrateArticle(ctx context.Context, db *sql.DB, art article, fetcher www.FetcherFunc, summarizer summarizeFunc, dryRun bool, stats *migrationStats) error {
	stats.processed++
	
	log.Printf("[%d/%d] Processing: %s", stats.processed, stats.total, art.Url)
	
	// Create a context with 30-second timeout for this article
	timeoutCtx, cancel := context.WithTimeout(ctx, 30*time.Second)
	defer cancel()
	
	// Fetch fresh HTML content
	htmlBytes, _, err := fetcher(timeoutCtx, art.Url)
	if err != nil {
		log.Printf("  ERROR: Failed to fetch %s: %v", art.Url, err)
		stats.failed++
		return fmt.Errorf("failed to fetch %s: %w", art.Url, err)
	}
	
	// Convert to markdown using new summarizer
	newContent, err := summarizer(timeoutCtx, htmlBytes)
	if err != nil {
		log.Printf("  ERROR: Failed to convert %s: %v", art.Url, err)
		stats.failed++
		return fmt.Errorf("failed to convert %s: %w", art.Url, err)
	}
	
	// Check if content actually changed
	if strings.TrimSpace(newContent) == strings.TrimSpace(art.Contents) {
		log.Printf("  SKIP: Content unchanged for %s", art.Url)
		stats.skipped++
		return nil
	}
	
	// Update database if not in dry-run mode
	if !dryRun {
		err = updateArticleContent(timeoutCtx, db, art.Url, newContent)
		if err != nil {
			log.Printf("  ERROR: Failed to update %s: %v", art.Url, err)
			stats.failed++
			return fmt.Errorf("failed to update %s: %w", art.Url, err)
		}
		log.Printf("  SUCCESS: Updated %s", art.Url)
	} else {
		log.Printf("  DRY-RUN: Would update %s", art.Url)
	}
	
	stats.updated++
	return nil
}

func main() {
	var (
		dbFile = flag.String("db", "../data/readlater.db", "Path to database file")
		dryRun = flag.Bool("dry-run", false, "Show what would be done without making changes")
		limit  = flag.Int("limit", 0, "Limit number of articles to process (0 = all)")
	)
	flag.Parse()

	log.Printf("Starting article migration with html-to-markdown")
	log.Printf("Database: %s", *dbFile)
	log.Printf("Dry run: %v", *dryRun)
	if *limit > 0 {
		log.Printf("Limit: %d articles", *limit)
	}

	// Open existing database (don't apply schema since it should already exist)
	db, err := sql.Open("sqlite3", *dbFile)
	if err != nil {
		log.Fatalf("Failed to open database: %v", err)
	}
	defer db.Close()

	ctx := context.Background()
	
	// Get all articles with content
	articles, err := getAllArticles(ctx, db)
	if err != nil {
		log.Fatalf("Failed to get articles: %v", err)
	}

	if len(articles) == 0 {
		log.Printf("No articles found in database")
		return
	}

	// Apply limit if specified
	if *limit > 0 && *limit < len(articles) {
		articles = articles[:*limit]
	}

	log.Printf("Found %d articles to process", len(articles))

	// Initialize dependencies
	fetcher := www.FetcherCombined
	summarizer := htmlToMarkdownSummarizer()
	
	stats := &migrationStats{
		total: len(articles),
	}

	// Process each article
	startTime := time.Now()
	for _, art := range articles {
		err := migrateArticle(ctx, db, art, fetcher, summarizer, *dryRun, stats)
		if err != nil {
			// Continue processing other articles even if one fails
			log.Printf("Continuing despite error: %v", err)
		}

		// Add small delay to avoid overwhelming servers
		time.Sleep(100 * time.Millisecond)
	}

	// Print final statistics
	duration := time.Since(startTime)
	log.Printf("\n=== Migration Complete ===")
	log.Printf("Total articles: %d", stats.total)
	log.Printf("Processed: %d", stats.processed)
	log.Printf("Updated: %d", stats.updated)
	log.Printf("Skipped (unchanged): %d", stats.skipped)
	log.Printf("Failed: %d", stats.failed)
	log.Printf("Duration: %v", duration)

	if *dryRun {
		log.Printf("\nThis was a dry run. No changes were made to the database.")
		log.Printf("Run without --dry-run to apply changes.")
	}
}