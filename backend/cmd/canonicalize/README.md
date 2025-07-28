# URL Canonicalization Tool

This tool canonicalizes URLs in the database and removes duplicate articles that have the same canonical URL.

## What it does

1. **Canonicalizes URLs**: Removes query parameters and fragments from all article URLs
2. **Detects duplicates**: Finds articles that have the same canonical URL
3. **Merges duplicates**: Keeps the best article and removes duplicates based on:
   - Non-archived articles are preferred over archived ones
   - Articles with content are preferred over those without
   - More recent articles are preferred (by creation date)

## Usage

### Dry run (recommended first)
```bash
go run main.go -db /path/to/database.db -dry-run
```

### Apply changes
```bash
go run main.go -db /path/to/database.db
```

## Example output

```
Found 150 articles to process

Found 3 duplicate articles for canonical URL: https://example.com/article
  [1] https://example.com/article?utm_source=twitter (created: 2024-01-01, archived: false)
  [2] https://example.com/article?ref=homepage (created: 2024-01-02, archived: false)  
  [3] https://example.com/article (created: 2024-01-03, archived: true)
  -> Keeping article: https://example.com/article?ref=homepage
  -> Canonicalizing kept article: https://example.com/article?ref=homepage -> https://example.com/article
  -> Removing duplicate: https://example.com/article?utm_source=twitter
  -> Removing duplicate: https://example.com/article

Canonicalization Summary:
  Total articles processed: 150
  URLs canonicalized: 45
  Duplicate articles found: 12
  Duplicate articles removed: 12
  Errors: 0
```

## Safety

- Always run with `-dry-run` first to see what changes would be made
- The tool will not modify the database during a dry run
- Backup your database before running without `-dry-run`
- The tool shows detailed logs of all actions taken

## Why this is needed

Before implementing centralized URL canonicalization in the backend, articles could be stored with different URLs for the same content:

- `https://example.com/article`
- `https://example.com/article?utm_source=twitter`  
- `https://example.com/article?ref=homepage`

This caused issues with:
- Duplicate articles in the database
- Sync system URL mismatches
- Offline article access failures

This tool cleans up existing data to ensure URL consistency going forward.