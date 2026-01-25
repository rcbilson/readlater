package www

import (
	"bytes"
	"io"
	"strings"

	"github.com/markusmobius/go-trafilatura"
	"golang.org/x/net/html"
	"golang.org/x/net/html/atom"
)

func findChild(n *html.Node, dataAtom atom.Atom) *html.Node {
	for c := n.FirstChild; c != nil; c = c.NextSibling {
		if c.Type == html.ElementNode && c.DataAtom == dataAtom {
			return c
		}
	}
	return nil
}

func HtmlTitle(page []byte) string {
	// parse the html in the page and extract the title
	doc, err := html.Parse(bytes.NewReader(page))
	if err != nil {
		return ""
	}

	htmlNode := findChild(doc, atom.Html)
	if htmlNode == nil {
		return ""
	}
	headNode := findChild(htmlNode, atom.Head)
	if headNode == nil {
		return ""
	}
	for n := headNode.FirstChild; n != nil; n = n.NextSibling {
		if n.Type == html.ElementNode && n.DataAtom == atom.Title {
			return n.FirstChild.Data
		}
	}
	return ""
}

// ArticleMetadata contains extracted article information
type ArticleMetadata struct {
	Title   string
	Content string
	Author  string
	Date    string
}

// ExtractArticle extracts article content and metadata using go-trafilatura
// Falls back to simple title extraction if trafilatura fails
func ExtractArticle(page []byte) ArticleMetadata {
	result := ArticleMetadata{}

	// Try trafilatura extraction
	reader := bytes.NewReader(page)
	opts := trafilatura.Options{
		OriginalURL:     nil,
		EnableFallback:  true, // Enable fallback to readability and dom distiller
		IncludeImages:   false,
		IncludeLinks:    false,
		ExcludeComments: true,
		ExcludeTables:   false,
	}

	extracted, err := trafilatura.Extract(reader, opts)
	if err == nil && extracted != nil {
		result.Title = strings.TrimSpace(extracted.Metadata.Title)
		result.Content = strings.TrimSpace(extracted.ContentText)
		result.Author = strings.TrimSpace(extracted.Metadata.Author)
		if !extracted.Metadata.Date.IsZero() {
			result.Date = extracted.Metadata.Date.Format("2006-01-02")
		}
	}

	// Fallback to simple title extraction if trafilatura didn't find a title
	if result.Title == "" {
		result.Title = HtmlTitle(page)
	}

	return result
}

// ExtractArticleContent is a convenience function that returns just the content text
func ExtractArticleContent(page []byte) string {
	metadata := ExtractArticle(page)
	return metadata.Content
}

// ExtractArticleReader extracts article content from an io.Reader
func ExtractArticleReader(reader io.Reader) ArticleMetadata {
	result := ArticleMetadata{}

	opts := trafilatura.Options{
		OriginalURL:     nil,
		EnableFallback:  true,
		IncludeImages:   false,
		IncludeLinks:    false,
		ExcludeComments: true,
		ExcludeTables:   false,
	}

	extracted, err := trafilatura.Extract(reader, opts)
	if err == nil && extracted != nil {
		result.Title = strings.TrimSpace(extracted.Metadata.Title)
		result.Content = strings.TrimSpace(extracted.ContentText)
		result.Author = strings.TrimSpace(extracted.Metadata.Author)
		if !extracted.Metadata.Date.IsZero() {
			result.Date = extracted.Metadata.Date.Format("2006-01-02")
		}
	}

	return result
}
