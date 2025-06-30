package main

import (
	"context"
	"strings"

	md "github.com/JohannesKaufmann/html-to-markdown"
)

type summarizeFunc func(ctx context.Context, article []byte) (string, error)

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

// Legacy function name for compatibility
func pandocSummarizer() summarizeFunc {
	return htmlToMarkdownSummarizer()
}