package www

import (
	"context"
	"fmt"
	"io"
	"net"
	"net/http"
	"net/url"
	"os/exec"
	"strings"
	"sync"
	"time"

	utls "github.com/refraction-networking/utls"
)

type FetcherFunc func(ctx context.Context, url string) ([]byte, string, error)

// httpClient is a shared HTTP client with timeout configuration
// to prevent requests from hanging indefinitely
var httpClient = &http.Client{
	Timeout: 30 * time.Second,
}

// noFollowClient is used to resolve redirects one hop at a time
var noFollowClient = &http.Client{
	Timeout: 10 * time.Second,
	CheckRedirect: func(req *http.Request, via []*http.Request) error {
		return http.ErrUseLastResponse
	},
}

// ResolveRedirects follows HTTP redirects and returns the final URL.
// Used when the main fetch fails on redirect/tracking URLs — we resolve
// the redirect chain to get the destination URL and fetch that instead.
func ResolveRedirects(ctx context.Context, rawURL string) (string, error) {
	current := rawURL
	for range 10 {
		req, err := http.NewRequestWithContext(ctx, http.MethodHead, current, nil)
		if err != nil {
			return "", err
		}
		req.Header.Set("User-Agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36")

		resp, err := noFollowClient.Do(req)
		if err != nil {
			return "", err
		}
		resp.Body.Close()

		if resp.StatusCode >= 300 && resp.StatusCode < 400 {
			loc := resp.Header.Get("Location")
			if loc == "" {
				return current, nil
			}
			// Handle relative redirects
			base, _ := url.Parse(current)
			ref, err := url.Parse(loc)
			if err != nil {
				return "", err
			}
			current = base.ResolveReference(ref).String()
			continue
		}
		return current, nil
	}
	return "", fmt.Errorf("too many redirects resolving %s", rawURL)
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

// Browser profiles to rotate through for TLS fingerprint spoofing
var browserProfiles = []utls.ClientHelloID{
	utls.HelloChrome_120,
	utls.HelloFirefox_105,
	utls.HelloSafari_16_0,
}

var (
	profileIndex  int
	profileMutex  sync.Mutex
	utlsTransport *http.Transport
	utlsClient    *http.Client
	utlsOnce      sync.Once
)

// getNextProfile returns the next browser profile in rotation
func getNextProfile() utls.ClientHelloID {
	profileMutex.Lock()
	defer profileMutex.Unlock()
	profile := browserProfiles[profileIndex]
	profileIndex = (profileIndex + 1) % len(browserProfiles)
	return profile
}

// getUserAgentForProfile returns a matching User-Agent for the TLS profile
// to avoid detection via fingerprint/UA mismatch
func getUserAgentForProfile(profile utls.ClientHelloID) string {
	switch profile {
	case utls.HelloChrome_120:
		return "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
	case utls.HelloFirefox_105:
		return "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:105.0) Gecko/20100101 Firefox/105.0"
	case utls.HelloSafari_16_0:
		return "Mozilla/5.0 (Macintosh; Intel Mac OS X 13_0) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.0 Safari/605.1.15"
	default:
		return "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
	}
}

// initUTLSClient initializes the shared UTLS client with connection pooling
func initUTLSClient() {
	utlsOnce.Do(func() {
		utlsTransport = &http.Transport{
			DialTLSContext: func(ctx context.Context, network, addr string) (net.Conn, error) {
				// Establish TCP connection
				conn, err := net.Dial(network, addr)
				if err != nil {
					return nil, err
				}

				// Extract hostname for SNI
				host, _, err := net.SplitHostPort(addr)
				if err != nil {
					host = addr
				}

				// Select browser profile for this connection
				profile := getNextProfile()

				// Create utls connection with browser profile
				// Disable HTTP/2 via ALPN to avoid protocol mismatch issues
				// (utls negotiates HTTP/2 but Go's http.Transport doesn't handle it properly with custom DialTLS)
				tlsConfig := &utls.Config{
					ServerName: host,
					NextProtos: []string{"http/1.1"},
				}
				uconn := utls.UClient(conn, tlsConfig, profile)

				// Perform TLS handshake
				if err := uconn.HandshakeContext(ctx); err != nil {
					conn.Close()
					return nil, err
				}

				return uconn, nil
			},
			MaxIdleConns:        100,
			MaxIdleConnsPerHost: 10,
			IdleConnTimeout:     90 * time.Second,
			TLSHandshakeTimeout: 10 * time.Second,
		}

		utlsClient = &http.Client{
			Transport: utlsTransport,
			Timeout:   30 * time.Second,
		}
	})
}

// FetcherUTLS uses TLS fingerprint spoofing to evade bot detection
// It rotates between Chrome, Firefox, and Safari TLS fingerprints
//
// Known Limitation: HTTP/2 sites may fail due to protocol mismatch.
// The browser profiles include HTTP/2 in ALPN but Go's http.Transport
// doesn't properly handle HTTP/2 with custom DialTLS. Sites that require
// HTTP/2 will fall back to FetcherCurl in the waterfall.
func FetcherUTLS(ctx context.Context, url string) ([]byte, string, error) {
	initUTLSClient()

	req, err := http.NewRequestWithContext(ctx, http.MethodGet, url, nil)
	if err != nil {
		return nil, "", err
	}

	// Set User-Agent to match TLS fingerprint
	// Note: Profile is selected in DialTLS, so we use a default Chrome UA
	// For production, consider passing profile through context or using Chrome consistently
	profile := utls.HelloChrome_120
	req.Header.Set("User-Agent", getUserAgentForProfile(profile))

	res, err := utlsClient.Do(req)
	if err != nil {
		LogFailure(url, 0, nil, fmt.Sprintf("utls request failed: %v", err), []string{"utls"})
		return nil, "", err
	}

	body, err := io.ReadAll(res.Body)
	res.Body.Close()

	if res.StatusCode > 299 {
		errMsg := fmt.Sprintf("response failed with status code: %d", res.StatusCode)
		LogFailure(url, res.StatusCode, res.Header, errMsg, []string{"utls"})
		return nil, "", fmt.Errorf("%s and\nbody: %s", errMsg, body)
	}

	if err != nil {
		return nil, "", err
	}

	return body, res.Request.URL.String(), nil
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
		{FetcherUTLS, "utls"},
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
