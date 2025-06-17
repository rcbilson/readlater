package www

import (
	"context"
	"fmt"
	"io"
	"log"
	"net/http"
	"os/exec"
)

type FetcherFunc func(ctx context.Context, url string) ([]byte, error)

func doFetch(ctx context.Context, req *http.Request) ([]byte, error) {
	var httpClient http.Client

	res, err := httpClient.Do(req)
	if err != nil {
		return nil, err
	}

	body, err := io.ReadAll(res.Body)
	res.Body.Close()
	if res.StatusCode > 299 {
		log.Println("Headers:")
		for k, v := range res.Header {
			log.Println("    ", k, ":", v)
		}
		return nil, fmt.Errorf("response failed with status code: %d and\nbody: %s", res.StatusCode, body)
	}
	if err != nil {
		return nil, err
	}
	return body, nil
}

func Fetcher(ctx context.Context, url string) ([]byte, error) {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, url, nil)
	if err != nil {
		return nil, err
	}
	return doFetch(ctx, req)
}

func FetcherSpoof(ctx context.Context, url string) ([]byte, error) {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, url, nil)
	if err != nil {
		return nil, err
	}
	// spoof user agent to work around bot detection
	req.Header["User-Agent"] = []string{"User-Agent: Mozilla/5.0 (X11; CrOS x86_64 14541.0.0) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/136.0.0.0 Safari/537.36"}
	return doFetch(ctx, req)
}

func FetcherCurl(ctx context.Context, url string) ([]byte, error) {
	// Use os/exec to run curl
	cmd := exec.CommandContext(ctx, "curl", "--fail", "--location", url)
	stdout, err := cmd.StdoutPipe()
	if err != nil {
		return nil, fmt.Errorf("failed to get stdout pipe: %w", err)
	}
	if err := cmd.Start(); err != nil {
		return nil, fmt.Errorf("failed to start curl: %w", err)
	}
	output, err := io.ReadAll(stdout)
	if err != nil {
		return nil, fmt.Errorf("failed to read curl output: %w", err)
	}
	if err := cmd.Wait(); err != nil {
		return nil, fmt.Errorf("curl failed: %w", err)
	}
	return output, nil
}

func FetcherCombined(ctx context.Context, url string) ([]byte, error) {
        fetchers := []FetcherFunc{ FetcherSpoof, Fetcher, FetcherCurl }
        var err error
        for _, fetcher := range fetchers {
                var bytes []byte
                bytes, err = fetcher(ctx, url)
                if err == nil {
                        return bytes, nil
                }
        }
        return nil, err
}
