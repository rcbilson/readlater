# Article Content Migration Tool

This tool migrates all existing articles in the database to use the new html-to-markdown converter instead of the legacy pandoc-based conversion.

## Usage

```bash
# Build the migration tool
go build -tags fts5 -o migrate-articles cmd/migrate/*.go

# Run a dry-run to see what would be changed (recommended first)
./migrate-articles --dry-run --db ../data/readlater.db

# Run the actual migration
./migrate-articles --db ../data/readlater.db

# Process only a limited number of articles (useful for testing)
./migrate-articles --dry-run --limit 10 --db ../data/readlater.db
```

## Options

- `--db <path>`: Path to the SQLite database file (default: `../data/readlater.db`)
- `--dry-run`: Show what would be done without making any changes
- `--limit <n>`: Process only the first N articles (0 = all articles)

## What it does

1. **Fetches all articles** with content from the database
2. **Re-downloads the HTML** for each article URL
3. **Converts to markdown** using the new html-to-markdown library
4. **Updates the database** with the new content (if not dry-run)
5. **Provides detailed progress** and statistics

## Features

- **Dry-run mode** for safe testing
- **Progress tracking** with detailed logging
- **Error handling** - continues processing if individual articles fail
- **Content comparison** - skips articles where content hasn't changed
- **Rate limiting** - adds small delays between requests to be respectful to servers
- **Statistics** - shows total processed, updated, skipped, and failed counts

## Example Output

```
2025/06/30 18:12:35 Starting article migration with html-to-markdown
2025/06/30 18:12:35 Database: ../data/readlater.db
2025/06/30 18:12:35 Dry run: true
2025/06/30 18:12:36 Found 1 articles to process
2025/06/30 18:12:36 [1/1] Processing: https://example.com/article
2025/06/30 18:12:36   DRY-RUN: Would update https://example.com/article

=== Migration Complete ===
2025/06/30 18:12:36 Total articles: 1
2025/06/30 18:12:36 Processed: 1
2025/06/30 18:12:36 Updated: 1
2025/06/30 18:12:36 Skipped (unchanged): 0
2025/06/30 18:12:36 Failed: 0
2025/06/30 18:12:36 Duration: 819ms
```

## Safety

- Always run with `--dry-run` first to preview changes
- The tool will continue processing even if individual articles fail
- Original article metadata (title, URL, timestamps) is preserved
- Only the `contents` field is updated
- The FTS index is automatically updated via database triggers