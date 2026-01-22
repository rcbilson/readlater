package www

import (
	"testing"
)

func TestValidateURLForFetch(t *testing.T) {
	tests := []struct {
		name    string
		url     string
		wantErr bool
		errMsg  string
	}{
		// Valid URLs
		{
			name:    "valid https URL",
			url:     "https://www.example.com/page",
			wantErr: false,
		},
		{
			name:    "valid http URL",
			url:     "http://example.com/path?query=value",
			wantErr: false,
		},
		{
			name:    "valid URL with port",
			url:     "https://example.com:8080/page",
			wantErr: false,
		},

		// Invalid schemes
		{
			name:    "file scheme",
			url:     "file:///etc/passwd",
			wantErr: true,
			errMsg:  "scheme \"file\" not allowed",
		},
		{
			name:    "ftp scheme",
			url:     "ftp://ftp.example.com/file",
			wantErr: true,
			errMsg:  "scheme \"ftp\" not allowed",
		},
		{
			name:    "javascript scheme",
			url:     "javascript:alert(1)",
			wantErr: true,
			errMsg:  "scheme \"javascript\" not allowed",
		},
		{
			name:    "data scheme",
			url:     "data:text/html,<h1>Hello</h1>",
			wantErr: true,
			errMsg:  "scheme \"data\" not allowed",
		},
		{
			name:    "gopher scheme",
			url:     "gopher://example.com/",
			wantErr: true,
			errMsg:  "scheme \"gopher\" not allowed",
		},

		// Localhost variants
		{
			name:    "localhost",
			url:     "http://localhost/admin",
			wantErr: true,
			errMsg:  "localhost",
		},
		{
			name:    "localhost with port",
			url:     "http://localhost:8080/api",
			wantErr: true,
			errMsg:  "localhost",
		},
		{
			name:    "LOCALHOST uppercase",
			url:     "http://LOCALHOST/admin",
			wantErr: true,
			errMsg:  "localhost",
		},
		{
			name:    "localhost.localdomain",
			url:     "http://localhost.localdomain/",
			wantErr: true,
			errMsg:  "localhost",
		},

		// Loopback IPs
		{
			name:    "127.0.0.1",
			url:     "http://127.0.0.1/",
			wantErr: true,
			errMsg:  "loopback",
		},
		{
			name:    "127.0.0.1 with port",
			url:     "http://127.0.0.1:8080/api",
			wantErr: true,
			errMsg:  "loopback",
		},
		{
			name:    "127.1.2.3",
			url:     "http://127.1.2.3/",
			wantErr: true,
			errMsg:  "loopback",
		},
		{
			name:    "IPv6 loopback",
			url:     "http://[::1]/",
			wantErr: true,
			errMsg:  "loopback",
		},

		// Private IP ranges (RFC 1918)
		{
			name:    "10.x.x.x network",
			url:     "http://10.0.0.1/internal",
			wantErr: true,
			errMsg:  "private",
		},
		{
			name:    "10.255.255.255",
			url:     "http://10.255.255.255/",
			wantErr: true,
			errMsg:  "private",
		},
		{
			name:    "172.16.x.x network",
			url:     "http://172.16.0.1/",
			wantErr: true,
			errMsg:  "private",
		},
		{
			name:    "172.31.255.255",
			url:     "http://172.31.255.255/",
			wantErr: true,
			errMsg:  "private",
		},
		{
			name:    "192.168.x.x network",
			url:     "http://192.168.1.1/router",
			wantErr: true,
			errMsg:  "private",
		},
		{
			name:    "192.168.0.1",
			url:     "http://192.168.0.1/",
			wantErr: true,
			errMsg:  "private",
		},

		// Link-local addresses (including cloud metadata)
		{
			name:    "cloud metadata endpoint",
			url:     "http://169.254.169.254/latest/meta-data/",
			wantErr: true,
			errMsg:  "link-local",
		},
		{
			name:    "link-local 169.254.1.1",
			url:     "http://169.254.1.1/",
			wantErr: true,
			errMsg:  "link-local",
		},

		// Unspecified addresses
		{
			name:    "0.0.0.0",
			url:     "http://0.0.0.0/",
			wantErr: true,
			errMsg:  "unspecified",
		},
		{
			name:    "IPv6 unspecified",
			url:     "http://[::]/",
			wantErr: true,
			errMsg:  "unspecified",
		},

		// Multicast addresses
		{
			name:    "multicast 224.0.0.1",
			url:     "http://224.0.0.1/",
			wantErr: true,
			errMsg:  "not allowed",
		},

		// Edge cases
		{
			name:    "empty URL",
			url:     "",
			wantErr: true,
			errMsg:  "scheme",
		},
		{
			name:    "no scheme",
			url:     "example.com/page",
			wantErr: true,
			errMsg:  "scheme",
		},

		// Valid public IPs (should pass)
		{
			name:    "valid public IP 8.8.8.8",
			url:     "http://8.8.8.8/",
			wantErr: false,
		},
		{
			name:    "valid public IP 1.1.1.1",
			url:     "https://1.1.1.1/dns-query",
			wantErr: false,
		},

		// Non-private 172.x addresses (172.15.x.x and 172.32.x.x are public)
		{
			name:    "172.15.0.1 is public",
			url:     "http://172.15.0.1/",
			wantErr: false,
		},
		{
			name:    "172.32.0.1 is public",
			url:     "http://172.32.0.1/",
			wantErr: false,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			err := ValidateURLForFetch(tt.url)
			if tt.wantErr {
				if err == nil {
					t.Errorf("ValidateURLForFetch(%q) expected error containing %q, got nil", tt.url, tt.errMsg)
				} else if tt.errMsg != "" && !contains(err.Error(), tt.errMsg) {
					t.Errorf("ValidateURLForFetch(%q) error = %q, want error containing %q", tt.url, err.Error(), tt.errMsg)
				}
			} else {
				if err != nil {
					t.Errorf("ValidateURLForFetch(%q) unexpected error: %v", tt.url, err)
				}
			}
		})
	}
}

func contains(s, substr string) bool {
	return len(s) >= len(substr) && (s == substr || len(substr) == 0 ||
		(len(s) > 0 && len(substr) > 0 && findSubstring(s, substr)))
}

func findSubstring(s, substr string) bool {
	for i := 0; i <= len(s)-len(substr); i++ {
		if s[i:i+len(substr)] == substr {
			return true
		}
	}
	return false
}

func TestURLValidationError(t *testing.T) {
	err := &URLValidationError{
		URL:    "http://localhost/",
		Reason: "localhost addresses are not allowed",
	}
	expected := `URL validation failed for "http://localhost/": localhost addresses are not allowed`
	if err.Error() != expected {
		t.Errorf("Error() = %q, want %q", err.Error(), expected)
	}
}
