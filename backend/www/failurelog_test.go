package www

import (
	"encoding/json"
	"net/http"
	"os"
	"strings"
	"testing"
)

func TestFailureLogWriting(t *testing.T) {
	// Create a temporary log file
	tmpFile := "test_fail.log"
	defer os.Remove(tmpFile)

	// Initialize the failure log
	err := InitFailureLog(tmpFile)
	if err != nil {
		t.Fatalf("Failed to initialize failure log: %v", err)
	}
	defer CloseFailureLog()

	// Create test headers with Cloudflare mitigation
	headers := http.Header{}
	headers.Set("Cf-Mitigated", "challenge")
	headers.Set("Server", "cloudflare")

	// Log a failure
	testURL := "https://example.com/article"
	LogFailure(testURL, 403, headers, "response failed with status code: 403", []string{"spoof", "standard"})

	// Close the file to flush writes
	CloseFailureLog()

	// Read and verify the log file
	content, err := os.ReadFile(tmpFile)
	if err != nil {
		t.Fatalf("Failed to read log file: %v", err)
	}

	// Parse the JSON line
	var entry FailureLog
	err = json.Unmarshal(content, &entry)
	if err != nil {
		t.Fatalf("Failed to parse JSON log entry: %v", err)
	}

	// Verify the entry
	if entry.URL != testURL {
		t.Errorf("Expected URL %s, got %s", testURL, entry.URL)
	}
	if entry.Domain != "example.com" {
		t.Errorf("Expected domain example.com, got %s", entry.Domain)
	}
	if entry.FailureCategory != CloudflareChallenge {
		t.Errorf("Expected category %s, got %s", CloudflareChallenge, entry.FailureCategory)
	}
	if entry.HTTPStatus != 403 {
		t.Errorf("Expected status 403, got %d", entry.HTTPStatus)
	}
	if !entry.CloudflareMitigated {
		t.Error("Expected CloudflareMitigated to be true")
	}
	if len(entry.StrategiesAttempted) != 2 {
		t.Errorf("Expected 2 strategies, got %d", len(entry.StrategiesAttempted))
	}
	if entry.ResponseHeaders["Cf-Mitigated"][0] != "challenge" {
		t.Error("Expected Cf-Mitigated header to be preserved")
	}
}

func TestFailureCategories(t *testing.T) {
	tests := []struct {
		name       string
		status     int
		headers    http.Header
		errMsg     string
		expected   FailureCategory
	}{
		{
			name:     "Cloudflare challenge",
			status:   403,
			headers:  http.Header{"Cf-Mitigated": []string{"challenge"}},
			errMsg:   "blocked",
			expected: CloudflareChallenge,
		},
		{
			name:     "Bot detection",
			status:   403,
			headers:  http.Header{},
			errMsg:   "blocked",
			expected: BotDetection,
		},
		{
			name:     "Timeout",
			status:   0,
			headers:  http.Header{},
			errMsg:   "context deadline exceeded",
			expected: Timeout,
		},
		{
			name:     "Network error",
			status:   0,
			headers:  http.Header{},
			errMsg:   "connection refused",
			expected: NetworkError,
		},
		{
			name:     "HTTP error",
			status:   404,
			headers:  http.Header{},
			errMsg:   "not found",
			expected: HTTPError,
		},
		{
			name:     "Redirect loop",
			status:   0,
			headers:  http.Header{},
			errMsg:   "stopped after 10 redirects",
			expected: RedirectLoop,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			category := categorizeFailure(tt.status, tt.headers, tt.errMsg)
			if category != tt.expected {
				t.Errorf("Expected category %s, got %s", tt.expected, category)
			}
		})
	}
}

func TestExtractDomain(t *testing.T) {
	tests := []struct {
		url      string
		expected string
	}{
		{"https://example.com/path", "example.com"},
		{"http://subdomain.example.com:8080/path", "subdomain.example.com:8080"},
		{"https://example.com", "example.com"},
		{"invalid-url", ""},
	}

	for _, tt := range tests {
		t.Run(tt.url, func(t *testing.T) {
			domain := extractDomain(tt.url)
			if domain != tt.expected {
				t.Errorf("Expected domain %s, got %s", tt.expected, domain)
			}
		})
	}
}

func TestLogFailureWithoutInitialization(t *testing.T) {
	// Close any existing log file
	CloseFailureLog()

	// This should not panic or cause errors
	LogFailure("https://example.com", 500, nil, "test error", []string{"test"})
}

func TestMultipleLogEntries(t *testing.T) {
	tmpFile := "test_fail_multiple.log"
	defer os.Remove(tmpFile)

	err := InitFailureLog(tmpFile)
	if err != nil {
		t.Fatalf("Failed to initialize failure log: %v", err)
	}
	defer CloseFailureLog()

	// Log multiple failures
	LogFailure("https://site1.com", 403, http.Header{"Cf-Mitigated": []string{"challenge"}}, "error1", []string{"spoof"})
	LogFailure("https://site2.com", 404, http.Header{}, "error2", []string{"standard"})
	LogFailure("https://site3.com", 429, http.Header{}, "error3", []string{"curl"})

	CloseFailureLog()

	// Read the log file
	content, err := os.ReadFile(tmpFile)
	if err != nil {
		t.Fatalf("Failed to read log file: %v", err)
	}

	// Count the number of JSON lines
	lines := strings.Split(strings.TrimSpace(string(content)), "\n")
	if len(lines) != 3 {
		t.Errorf("Expected 3 log entries, got %d", len(lines))
	}

	// Verify each line is valid JSON
	for i, line := range lines {
		var entry FailureLog
		err = json.Unmarshal([]byte(line), &entry)
		if err != nil {
			t.Errorf("Line %d is not valid JSON: %v", i+1, err)
		}
	}
}
