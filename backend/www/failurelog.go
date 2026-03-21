package www

import (
	"encoding/json"
	"log"
	"maps"
	"net/http"
	"net/url"
	"os"
	"strings"
	"sync"
	"time"
)

// FailureCategory represents the type of fetch failure
type FailureCategory string

const (
	CloudflareChallenge FailureCategory = "cloudflare_challenge"
	BotDetection        FailureCategory = "bot_detection"
	Timeout             FailureCategory = "timeout"
	NetworkError        FailureCategory = "network_error"
	HTTPError           FailureCategory = "http_error"
	ContentExtraction   FailureCategory = "content_extraction"
	RedirectLoop        FailureCategory = "redirect_loop"
	InvalidURL          FailureCategory = "invalid_url"
)

// FailureLog represents a structured log entry for fetch failures
type FailureLog struct {
	Timestamp           string              `json:"timestamp"`
	URL                 string              `json:"url"`
	Domain              string              `json:"domain"`
	FailureCategory     FailureCategory     `json:"failure_category"`
	HTTPStatus          int                 `json:"http_status,omitempty"`
	StrategiesAttempted []string            `json:"strategies_attempted"`
	CloudflareMitigated bool                `json:"cloudflare_mitigated"`
	ErrorMessage        string              `json:"error_message"`
	ResponseHeaders     map[string][]string `json:"response_headers,omitempty"`
}

var (
	failureLogFile *os.File
	failureLogMu   sync.Mutex
)

// InitFailureLog opens the failure log file for writing
func InitFailureLog(filename string) error {
	var err error
	failureLogMu.Lock()
	defer failureLogMu.Unlock()

	// Open in append mode, create if doesn't exist
	failureLogFile, err = os.OpenFile(filename, os.O_APPEND|os.O_CREATE|os.O_WRONLY, 0644)
	return err
}

// CloseFailureLog closes the failure log file
func CloseFailureLog() error {
	failureLogMu.Lock()
	defer failureLogMu.Unlock()

	if failureLogFile != nil {
		return failureLogFile.Close()
	}
	return nil
}

// extractDomain extracts the domain from a URL
func extractDomain(rawURL string) string {
	parsedURL, err := url.Parse(rawURL)
	if err != nil {
		return ""
	}
	return parsedURL.Host
}

// categorizeFailure determines the failure category based on error details
func categorizeFailure(httpStatus int, headers http.Header, errMsg string) FailureCategory {
	// Check for Cloudflare challenge
	if headers.Get("Cf-Mitigated") != "" {
		return CloudflareChallenge
	}

	// Check for timeouts
	if strings.Contains(strings.ToLower(errMsg), "timeout") ||
		strings.Contains(strings.ToLower(errMsg), "deadline exceeded") {
		return Timeout
	}

	// Check for redirect loops
	if strings.Contains(strings.ToLower(errMsg), "redirect") &&
		(strings.Contains(strings.ToLower(errMsg), "stopped") ||
			strings.Contains(strings.ToLower(errMsg), "too many")) {
		return RedirectLoop
	}

	// Check for network errors
	if strings.Contains(strings.ToLower(errMsg), "connection") ||
		strings.Contains(strings.ToLower(errMsg), "network") ||
		strings.Contains(strings.ToLower(errMsg), "dns") ||
		strings.Contains(strings.ToLower(errMsg), "no such host") {
		return NetworkError
	}

	// Check for URL parsing errors
	if strings.Contains(strings.ToLower(errMsg), "invalid url") ||
		strings.Contains(strings.ToLower(errMsg), "parse") {
		return InvalidURL
	}

	// Bot detection (403/429 without Cloudflare)
	if httpStatus == 403 || httpStatus == 429 {
		return BotDetection
	}

	// Other HTTP errors
	if httpStatus >= 400 {
		return HTTPError
	}

	// Default to network error
	return NetworkError
}

// LogFailure writes a structured failure log entry
func LogFailure(urlStr string, httpStatus int, headers http.Header, errMsg string, strategies []string) {
	failureLogMu.Lock()
	defer failureLogMu.Unlock()

	// If file not initialized, fall back to standard logging
	if failureLogFile == nil {
		log.Printf("Failure logging not initialized, falling back to standard log: %s", errMsg)
		return
	}

	// Convert headers to map for JSON serialization
	headerMap := make(map[string][]string)
	if headers != nil {
		maps.Copy(headerMap, headers)
	}

	entry := FailureLog{
		Timestamp:           time.Now().UTC().Format(time.RFC3339),
		URL:                 urlStr,
		Domain:              extractDomain(urlStr),
		FailureCategory:     categorizeFailure(httpStatus, headers, errMsg),
		HTTPStatus:          httpStatus,
		StrategiesAttempted: strategies,
		CloudflareMitigated: headers != nil && headers.Get("Cf-Mitigated") != "",
		ErrorMessage:        errMsg,
		ResponseHeaders:     headerMap,
	}

	// Encode as JSON and write to file
	encoder := json.NewEncoder(failureLogFile)
	if err := encoder.Encode(entry); err != nil {
		log.Printf("Error writing failure log: %v", err)
	}
}
