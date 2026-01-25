package www

import (
	"strings"
	"testing"
)

func TestHtmlTitle(t *testing.T) {
	html := []byte(`
		<html>
			<head>
				<title>Test Article Title</title>
			</head>
			<body>
				<p>Content</p>
			</body>
		</html>
	`)

	title := HtmlTitle(html)
	if title != "Test Article Title" {
		t.Errorf("Expected 'Test Article Title', got '%s'", title)
	}
}

func TestHtmlTitleMissing(t *testing.T) {
	html := []byte(`
		<html>
			<head>
			</head>
			<body>
				<p>Content</p>
			</body>
		</html>
	`)

	title := HtmlTitle(html)
	if title != "" {
		t.Errorf("Expected empty string, got '%s'", title)
	}
}

func TestExtractArticle(t *testing.T) {
	html := []byte(`
		<html>
			<head>
				<title>Test Article</title>
				<meta name="author" content="John Doe">
			</head>
			<body>
				<article>
					<h1>Main Article Title</h1>
					<p>This is the first paragraph of the article.</p>
					<p>This is the second paragraph with more content.</p>
				</article>
				<aside>
					<p>This is sidebar content that should be excluded.</p>
				</aside>
			</body>
		</html>
	`)

	metadata := ExtractArticle(html)

	// Should extract a title (either from trafilatura or fallback)
	if metadata.Title == "" {
		t.Error("Expected non-empty title")
	}

	// Should extract some content
	if metadata.Content == "" {
		t.Error("Expected non-empty content")
	}

	// Content should contain main article text
	if !strings.Contains(metadata.Content, "first paragraph") {
		t.Error("Expected content to contain main article text")
	}
}

func TestExtractArticleContent(t *testing.T) {
	html := []byte(`
		<html>
			<head>
				<title>Simple Test</title>
			</head>
			<body>
				<article>
					<p>Article content here.</p>
				</article>
			</body>
		</html>
	`)

	content := ExtractArticleContent(html)

	// Should extract some content
	if content == "" {
		t.Error("Expected non-empty content")
	}
}

func TestExtractArticleWithMetadata(t *testing.T) {
	html := []byte(`
		<html>
			<head>
				<title>Article with Metadata</title>
				<meta property="article:author" content="Jane Smith">
				<meta property="article:published_time" content="2026-01-25">
			</head>
			<body>
				<article>
					<h1>Article Title</h1>
					<p>Main content goes here.</p>
				</article>
			</body>
		</html>
	`)

	metadata := ExtractArticle(html)

	if metadata.Title == "" {
		t.Error("Expected title to be extracted")
	}

	if metadata.Content == "" {
		t.Error("Expected content to be extracted")
	}

	// Note: Author and date extraction depends on trafilatura's ability to find them
	// We don't strictly require them as they may not always be present
}

func TestExtractArticleMalformed(t *testing.T) {
	// Test with malformed HTML
	html := []byte(`
		<html>
			<title>Broken HTML
			<p>Some content
		</html>
	`)

	// Should not panic
	metadata := ExtractArticle(html)

	// Should still try to extract something
	// Even if extraction fails, it should return empty strings, not crash
	_ = metadata.Title
	_ = metadata.Content
}

func TestExtractArticleEmpty(t *testing.T) {
	html := []byte(``)

	metadata := ExtractArticle(html)

	// Should handle empty input gracefully
	if metadata.Title != "" {
		t.Error("Expected empty title for empty input")
	}
	if metadata.Content != "" {
		t.Error("Expected empty content for empty input")
	}
}

func TestExtractArticleFallbackTitle(t *testing.T) {
	// HTML where trafilatura might not find the title in the body
	// but it exists in the <title> tag
	html := []byte(`
		<html>
			<head>
				<title>Fallback Title Test</title>
			</head>
			<body>
				<div>
					<p>Some content without proper article structure.</p>
				</div>
			</body>
		</html>
	`)

	metadata := ExtractArticle(html)

	// Should have a title (either from trafilatura or fallback)
	if metadata.Title == "" {
		t.Error("Expected title to be extracted via fallback")
	}
}
