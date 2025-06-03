package www

import (
	"bytes"

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
