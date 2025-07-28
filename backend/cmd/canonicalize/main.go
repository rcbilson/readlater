package main

import (
	"context"
	"database/sql"
	"flag"
	"fmt"
	"log"
	"net/url"
	"strings"

	_ "github.com/mattn/go-sqlite3"
)

type article struct {
	URL      string
	Title    string
	Contents string
	Created  string
	Unread   bool
	Archived bool
}

type canonicalizationStats struct {
	total          int
	canonicalized  int
	duplicatesFound int
	duplicatesRemoved int
	errors         int
}

// canonicalizeURL removes query parameters from a URL to create a canonical version
func canonicalizeURL(rawURL string) (string, error) {
	parsedURL, err := url.Parse(rawURL)
	if err != nil {
		return "", err
	}
	// Remove query parameters and fragment
	parsedURL.RawQuery = ""
	parsedURL.Fragment = ""
	return parsedURL.String(), nil
}

func main() {
	var dbPath = flag.String("db", "", "Path to SQLite database file")
	var dryRun = flag.Bool("dry-run", false, "Show what would be done without making changes")
	flag.Parse()

	if *dbPath == "" {
		log.Fatal("Database path is required. Use -db flag to specify the path.")
	}

	db, err := sql.Open("sqlite3", *dbPath+"?_fk=1")
	if err != nil {
		log.Fatalf("Failed to open database: %v", err)
	}
	defer db.Close()

	ctx := context.Background()
	stats := &canonicalizationStats{}

	log.Printf("Starting URL canonicalization process (dry-run: %v)", *dryRun)
	
	if err := canonicalizeArticleURLs(ctx, db, stats, *dryRun); err != nil {
		log.Fatalf("Canonicalization failed: %v", err)
	}

	log.Printf("\nCanonicalization Summary:")
	log.Printf("  Total articles processed: %d", stats.total)
	log.Printf("  URLs canonicalized: %d", stats.canonicalized)
	log.Printf("  Duplicate articles found: %d", stats.duplicatesFound)
	log.Printf("  Duplicate articles removed: %d", stats.duplicatesRemoved)
	log.Printf("  Errors: %d", stats.errors)

	if *dryRun {
		log.Printf("\nThis was a dry run. Re-run without -dry-run flag to apply changes.")
	} else {
		log.Printf("\nCanonicalization completed successfully!")
	}
}

func canonicalizeArticleURLs(ctx context.Context, db *sql.DB, stats *canonicalizationStats, dryRun bool) error {
	// First, get all articles
	articles, err := getAllArticles(ctx, db)
	if err != nil {
		return fmt.Errorf("failed to get articles: %w", err)
	}

	stats.total = len(articles)
	log.Printf("Found %d articles to process", stats.total)

	// Track canonical URLs to detect duplicates
	canonicalMap := make(map[string][]article)
	
	// Process each article and group by canonical URL
	for _, art := range articles {
		canonicalURL, err := canonicalizeURL(art.URL)
		if err != nil {
			log.Printf("ERROR: Failed to canonicalize URL %s: %v", art.URL, err)
			stats.errors++
			continue
		}

		// Group articles by their canonical URL
		canonicalMap[canonicalURL] = append(canonicalMap[canonicalURL], art)

		if canonicalURL != art.URL {
			stats.canonicalized++
		}
	}

	// Process each group of articles with the same canonical URL
	for canonicalURL, articlesGroup := range canonicalMap {
		if len(articlesGroup) == 1 {
			// Single article - just update URL if needed
			art := articlesGroup[0]
			if art.URL != canonicalURL {
				log.Printf("Canonicalizing: %s -> %s", art.URL, canonicalURL)
				if !dryRun {
					if err := updateArticleURL(ctx, db, art.URL, canonicalURL); err != nil {
						log.Printf("ERROR: Failed to update URL for %s: %v", art.URL, err)
						stats.errors++
					}
				}
			}
		} else {
			// Multiple articles with same canonical URL - handle duplicates
			stats.duplicatesFound += len(articlesGroup) - 1
			
			log.Printf("\nFound %d duplicate articles for canonical URL: %s", len(articlesGroup), canonicalURL)
			for i, art := range articlesGroup {
				log.Printf("  [%d] %s (created: %s, archived: %v)", i+1, art.URL, art.Created, art.Archived)
			}

			// Find the best article to keep (prefer non-archived, most recent, with content)
			keepIndex := findBestArticle(articlesGroup)
			keepArticle := articlesGroup[keepIndex]
			
			log.Printf("  -> Keeping article: %s", keepArticle.URL)

			// Update the kept article's URL to canonical form if needed
			if keepArticle.URL != canonicalURL {
				log.Printf("  -> Canonicalizing kept article: %s -> %s", keepArticle.URL, canonicalURL)
				if !dryRun {
					if err := updateArticleURL(ctx, db, keepArticle.URL, canonicalURL); err != nil {
						log.Printf("ERROR: Failed to update URL for kept article %s: %v", keepArticle.URL, err)
						stats.errors++
						continue
					}
				}
			}

			// Remove duplicate articles
			for i, art := range articlesGroup {
				if i != keepIndex {
					log.Printf("  -> Removing duplicate: %s", art.URL)
					if !dryRun {
						if err := deleteArticle(ctx, db, art.URL); err != nil {
							log.Printf("ERROR: Failed to delete duplicate article %s: %v", art.URL, err)
							stats.errors++
						} else {
							stats.duplicatesRemoved++
						}
					} else {
						stats.duplicatesRemoved++
					}
				}
			}
		}
	}

	return nil
}

func getAllArticles(ctx context.Context, db *sql.DB) ([]article, error) {
	query := `SELECT url, title, COALESCE(contents, ''), created, unread, archived FROM articles ORDER BY created`
	rows, err := db.QueryContext(ctx, query)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var articles []article
	for rows.Next() {
		var art article
		err := rows.Scan(&art.URL, &art.Title, &art.Contents, &art.Created, &art.Unread, &art.Archived)
		if err != nil {
			return nil, err
		}
		articles = append(articles, art)
	}

	return articles, rows.Err()
}

func findBestArticle(articles []article) int {
	bestIndex := 0
	best := articles[0]

	for i, art := range articles[1:] {
		current := i + 1
		
		// Prefer non-archived articles
		if art.Archived && !best.Archived {
			continue
		}
		if !art.Archived && best.Archived {
			bestIndex = current
			best = art
			continue
		}

		// Prefer articles with content
		hasContent := strings.TrimSpace(art.Contents) != ""
		bestHasContent := strings.TrimSpace(best.Contents) != ""
		
		if hasContent && !bestHasContent {
			bestIndex = current
			best = art
			continue
		}
		if !hasContent && bestHasContent {
			continue
		}

		// Prefer more recent articles (if created timestamps are available)
		if art.Created > best.Created {
			bestIndex = current
			best = art
		}
	}

	return bestIndex
}

func updateArticleURL(ctx context.Context, db *sql.DB, oldURL, newURL string) error {
	_, err := db.ExecContext(ctx, "UPDATE articles SET url = ? WHERE url = ?", newURL, oldURL)
	return err
}

func deleteArticle(ctx context.Context, db *sql.DB, url string) error {
	_, err := db.ExecContext(ctx, "DELETE FROM articles WHERE url = ?", url)
	return err
}