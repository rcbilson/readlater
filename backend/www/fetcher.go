package www

import (
	"context"
	"fmt"
	"io"
	"net/http"
	"os/exec"
	"strings"
	"time"
)

type FetcherFunc func(ctx context.Context, url string) ([]byte, string, error)

// httpClient is a shared HTTP client with timeout configuration
// to prevent requests from hanging indefinitely
var httpClient = &http.Client{
	Timeout: 30 * time.Second,
}

func doFetch(ctx context.Context, req *http.Request, strategy string) ([]byte, string, error) {
	res, err := httpClient.Do(req)
	if err != nil {
		return nil, "", err
	}

	body, err := io.ReadAll(res.Body)
	res.Body.Close()
	if res.StatusCode > 299 {
		errMsg := fmt.Sprintf("response failed with status code: %d", res.StatusCode)
		LogFailure(req.URL.String(), res.StatusCode, res.Header, errMsg, []string{strategy})
		return nil, "", fmt.Errorf("%s and\nbody: %s", errMsg, body)
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
	return doFetch(ctx, req, "standard")
}

func FetcherSpoof(ctx context.Context, url string) ([]byte, string, error) {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, url, nil)
	if err != nil {
		return nil, "", err
	}
	// spoof user agent to work around bot detection
	req.Header["User-Agent"] = []string{"User-Agent: Mozilla/5.0 (X11; CrOS x86_64 14541.0.0) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/136.0.0.0 Safari/537.36"}
	return doFetch(ctx, req, "spoof")
}

func FetcherCurl(ctx context.Context, url string) ([]byte, string, error) {
	// Use os/exec to run curl with -w flag to get final URL
	cmd := exec.CommandContext(ctx, "curl", "--fail", "--location", "-w", "%{url_effective}", url)
	stdout, err := cmd.StdoutPipe()
	if err != nil {
		errMsg := fmt.Sprintf("failed to get stdout pipe: %v", err)
		LogFailure(url, 0, nil, errMsg, []string{"curl"})
		return nil, "", fmt.Errorf("failed to get stdout pipe: %w", err)
	}
	if err := cmd.Start(); err != nil {
		errMsg := fmt.Sprintf("failed to start curl: %v", err)
		LogFailure(url, 0, nil, errMsg, []string{"curl"})
		return nil, "", fmt.Errorf("failed to start curl: %w", err)
	}
	output, err := io.ReadAll(stdout)
	if err != nil {
		errMsg := fmt.Sprintf("failed to read curl output: %v", err)
		LogFailure(url, 0, nil, errMsg, []string{"curl"})
		return nil, "", fmt.Errorf("failed to read curl output: %w", err)
	}
	if err := cmd.Wait(); err != nil {
		errMsg := fmt.Sprintf("curl failed: %v", err)
		LogFailure(url, 0, nil, errMsg, []string{"curl"})
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
        fetchers := []struct {
                fn   FetcherFunc
                name string
        }{
                {FetcherSpoof, "spoof"},
                {Fetcher, "standard"},
                {FetcherCurl, "curl"},
        }

        var lastErr error
        var strategies []string

        for _, fetcher := range fetchers {
                strategies = append(strategies, fetcher.name)
                var bytes []byte
                var finalURL string
                bytes, finalURL, lastErr = fetcher.fn(ctx, url)
                if lastErr == nil {
                        return bytes, finalURL, nil
                }
        }

        // All strategies failed - log with all attempted strategies
        if lastErr != nil {
                LogFailure(url, 0, nil, lastErr.Error(), strategies)
        }

        return nil, "", lastErr
}
