package www

import (
	"context"
	"fmt"
	"io"
	"log"
	"net/http"
	"os/exec"
	"strings"
)

type FetcherFunc func(ctx context.Context, url string) ([]byte, string, error)

func doFetch(ctx context.Context, req *http.Request) ([]byte, string, error) {
	var httpClient http.Client

	res, err := httpClient.Do(req)
	if err != nil {
		return nil, "", err
	}

	body, err := io.ReadAll(res.Body)
	res.Body.Close()
	if res.StatusCode > 299 {
		log.Println("Headers:")
		for k, v := range res.Header {
			log.Println("    ", k, ":", v)
		}
		return nil, "", fmt.Errorf("response failed with status code: %d and\nbody: %s", res.StatusCode, body)
	}
	if err != nil {
		return nil, "", err
	}
	return body, res.Request.URL.String(), nil
}

func Fetcher(ctx context.Context, url string) ([]byte, string, error) {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, url, nil)
	if err != nil {
		return nil, "", err
	}
	return doFetch(ctx, req)
}

func FetcherSpoof(ctx context.Context, url string) ([]byte, string, error) {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, url, nil)
	if err != nil {
		return nil, "", err
	}
	// spoof user agent to work around bot detection
	req.Header["User-Agent"] = []string{"User-Agent: Mozilla/5.0 (X11; CrOS x86_64 14541.0.0) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/136.0.0.0 Safari/537.36"}
	return doFetch(ctx, req)
}

func FetcherCurl(ctx context.Context, url string) ([]byte, string, error) {
	// Use os/exec to run curl with -w flag to get final URL
	cmd := exec.CommandContext(ctx, "curl", "--fail", "--location", "-w", "%{url_effective}", url)
	stdout, err := cmd.StdoutPipe()
	if err != nil {
		return nil, "", fmt.Errorf("failed to get stdout pipe: %w", err)
	}
	if err := cmd.Start(); err != nil {
		return nil, "", fmt.Errorf("failed to start curl: %w", err)
	}
	output, err := io.ReadAll(stdout)
	if err != nil {
		return nil, "", fmt.Errorf("failed to read curl output: %w", err)
	}
	if err := cmd.Wait(); err != nil {
		return nil, "", fmt.Errorf("curl failed: %w", err)
	}
	
	// The final URL is appended at the end due to -w flag
	// We need to separate the HTML content from the final URL
	outputStr := string(output)
	
	// Look for common HTML end patterns to separate content from the URL
	htmlEndMarkers := []string{"</html>", "</HTML>"}
	var content []byte
	var finalURL string
	
	for _, marker := range htmlEndMarkers {
		if idx := strings.LastIndex(outputStr, marker); idx != -1 {
			endIdx := idx + len(marker)
			content = []byte(outputStr[:endIdx])
			finalURL = strings.TrimSpace(outputStr[endIdx:])
			return content, finalURL, nil
		}
	}
	
	// If no HTML end marker found, assume entire output is content and URL is the original
	// This shouldn't happen with proper HTML, but is a fallback
	return output, url, nil
}

func FetcherCombined(ctx context.Context, url string) ([]byte, string, error) {
        fetchers := []FetcherFunc{ FetcherSpoof, Fetcher, FetcherCurl }
        var err error
        for _, fetcher := range fetchers {
                var bytes []byte
                var finalURL string
                bytes, finalURL, err = fetcher(ctx, url)
                if err == nil {
                        return bytes, finalURL, nil
                }
        }
        return nil, "", err
}
