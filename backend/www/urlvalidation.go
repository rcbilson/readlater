package www

import (
	"fmt"
	"net"
	"net/url"
	"strings"
)

// URLValidationError represents an error from URL validation
type URLValidationError struct {
	URL     string
	Reason  string
}

func (e *URLValidationError) Error() string {
	return fmt.Sprintf("URL validation failed for %q: %s", e.URL, e.Reason)
}

// ValidateURLForFetch checks if a URL is safe to fetch server-side.
// It prevents SSRF (Server-Side Request Forgery) attacks by:
// - Only allowing http and https schemes
// - Blocking private IP ranges (RFC 1918)
// - Blocking loopback addresses (127.x.x.x, localhost)
// - Blocking link-local addresses (169.254.x.x)
// - Blocking cloud metadata endpoints (169.254.169.254)
func ValidateURLForFetch(rawURL string) error {
	parsed, err := url.Parse(rawURL)
	if err != nil {
		return &URLValidationError{URL: rawURL, Reason: "invalid URL format"}
	}

	// Check scheme - only allow http and https
	scheme := strings.ToLower(parsed.Scheme)
	if scheme != "http" && scheme != "https" {
		return &URLValidationError{URL: rawURL, Reason: fmt.Sprintf("scheme %q not allowed, only http and https are permitted", parsed.Scheme)}
	}

	// Get hostname (without port)
	hostname := parsed.Hostname()
	if hostname == "" {
		return &URLValidationError{URL: rawURL, Reason: "empty hostname"}
	}

	// Check for localhost variants
	lowerHost := strings.ToLower(hostname)
	if lowerHost == "localhost" || lowerHost == "localhost.localdomain" {
		return &URLValidationError{URL: rawURL, Reason: "localhost addresses are not allowed"}
	}

	// Try to parse as IP address
	ip := net.ParseIP(hostname)
	if ip != nil {
		if err := validateIP(ip); err != nil {
			return &URLValidationError{URL: rawURL, Reason: err.Error()}
		}
	}

	return nil
}

// validateIP checks if an IP address is safe to fetch
func validateIP(ip net.IP) error {
	// Check for loopback (127.0.0.0/8 for IPv4, ::1 for IPv6)
	if ip.IsLoopback() {
		return fmt.Errorf("loopback addresses are not allowed")
	}

	// Check for private addresses (RFC 1918)
	// 10.0.0.0/8, 172.16.0.0/12, 192.168.0.0/16
	if ip.IsPrivate() {
		return fmt.Errorf("private IP addresses are not allowed")
	}

	// Check for link-local addresses (169.254.0.0/16 for IPv4, fe80::/10 for IPv6)
	if ip.IsLinkLocalUnicast() || ip.IsLinkLocalMulticast() {
		return fmt.Errorf("link-local addresses are not allowed")
	}

	// Check for unspecified addresses (0.0.0.0, ::)
	if ip.IsUnspecified() {
		return fmt.Errorf("unspecified addresses are not allowed")
	}

	// Check for multicast addresses
	if ip.IsMulticast() {
		return fmt.Errorf("multicast addresses are not allowed")
	}

	// Explicitly check for cloud metadata IP (169.254.169.254)
	// This is technically covered by IsLinkLocalUnicast, but we make it explicit
	// for clarity and in case of any edge cases
	cloudMetadataIP := net.ParseIP("169.254.169.254")
	if ip.Equal(cloudMetadataIP) {
		return fmt.Errorf("cloud metadata endpoint is not allowed")
	}

	// Check for IPv6 loopback
	ipv6Loopback := net.ParseIP("::1")
	if ip.Equal(ipv6Loopback) {
		return fmt.Errorf("IPv6 loopback addresses are not allowed")
	}

	return nil
}
