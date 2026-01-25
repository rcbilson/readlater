# TLS Fingerprint Spoofing with utls - Implementation Research

**Research Date:** 2026-01-25
**Context:** Implementing TLS fingerprint spoofing to evade bot detection that analyzes JA3/JA4 fingerprints.

## Executive Summary

Go's default HTTP client has a distinctive TLS fingerprint (JA3) that anti-bot services use to detect scrapers. The **utls** library can mimic real browser TLS handshakes to evade this detection. For the readlater fetcher, implementing a custom `http.Transport` with utls will improve success rates against Cloudflare and similar protections.

**Recommendation:** Use **refraction-networking/utls** with custom DialTLS to create browser-like TLS fingerprints, coordinating User-Agent headers to match the spoofed browser profile.

---

## Problem Statement

### How TLS Fingerprinting Detects Bots

**JA3 Fingerprinting** analyzes five parameters from the TLS ClientHello:
1. TLS Version
2. Cipher Suites
3. TLS Extensions
4. Supported Elliptic Curves
5. Elliptic Curve Point Formats

These create a hash (JA3 fingerprint) unique to each TLS client implementation. Go's `crypto/tls` has a distinctive fingerprint that doesn't match any real browser.

**JA4 Fingerprinting** is a newer, more robust version with:
- Better noise resilience
- Random extensions handling
- More nuanced browser differentiation

### Detection in Practice

Modern anti-bot systems (Cloudflare, Akamai, DataDome) use TLS fingerprinting to:
- Identify automated tools vs. real browsers
- Flag inconsistencies (e.g., Chrome TLS fingerprint with Firefox User-Agent)
- Build reputation scores based on fingerprint patterns
- Trigger challenges or outright blocks

**Current Impact:** Sites using Cloudflare bot detection can identify Go's HTTP client by its TLS fingerprint alone, even with User-Agent spoofing.

---

## Available Solutions

### 1. refraction-networking/utls (Recommended)

**Repository:** https://github.com/refraction-networking/utls

**Description:** Fork of Go's `crypto/tls` providing low-level ClientHello access for mimicry.

**Key Features:**
- Fingerprint multiple real browsers (Chrome, Firefox, Safari, Edge)
- Randomized fingerprints to defeat blacklists
- `utls.Roller` for automatic multi-fingerprint rotation
- Active maintenance (latest release: January 2026)
- Used by 882+ projects

**Pros:**
- Direct, minimal dependencies
- Full control over TLS handshake
- Well-documented and battle-tested
- Supports latest TLS features (X25519MLKEM768 post-quantum crypto)

**Cons:**
- Requires custom DialTLS implementation
- Need to handle HTTP/2 ALPN negotiation manually
- More low-level, requires careful configuration

**Browser Profiles Available:**
- Chrome (various versions including Chrome_120, Chrome_131)
- Firefox (Firefox_102, Firefox_105, etc.)
- Safari (Safari_16_0, etc.)
- iOS Safari
- Edge
- Randomized profiles

### 2. juzeon/spoofed-round-tripper

**Repository:** https://github.com/juzeon/spoofed-round-tripper

**Description:** `http.RoundTripper` wrapper around bogdanfinn/tls-client and utls.

**Key Features:**
- Pre-built `http.RoundTripper` interface
- Works with standard `http.Client` and third-party libraries (resty)
- Built-in browser profiles
- Handles JA3, JA4, HTTP/2 Akamai fingerprints

**Pros:**
- Higher-level abstraction
- Drop-in replacement for `http.Transport`
- Works with existing HTTP client code
- Handles HTTP/2 complexities automatically

**Cons:**
- Additional dependency layer (bogdanfinn/tls-client)
- Less control over low-level details
- Proxy configuration has limitations

**Example Usage:**
```go
tr, err := srt.NewSpoofedRoundTripper(
    tlsclient.WithRandomTLSExtensionOrder(),
    tlsclient.WithClientProfile(profiles.Chrome_120),
)
client := &http.Client{Transport: tr}
client.Header.Set("User-Agent", "Mozilla/5.0 ...")
resp, err := client.Get("https://example.com")
```

### 3. CycleTLS

**Repository:** https://github.com/Danny-Dasilva/CycleTLS

**Description:** Complete TLS/JA3 fingerprint spoofing library.

**Pros:**
- Comprehensive solution
- Works in Go and JavaScript
- Active development

**Cons:**
- Heavier weight solution
- More complex integration
- May be overkill for our needs

---

## Implementation Approach

### Architecture Decision: Direct utls with Custom DialTLS

For the readlater fetcher, we'll use **refraction-networking/utls** directly because:
1. Minimal dependencies (only utls)
2. Full control over TLS handshake
3. Better for understanding and debugging
4. Lighter weight than wrapper libraries

### Implementation Strategy

**Add FetcherUTLS as a new strategy in the waterfall:**

```go
fetchers := []struct {
    fn   FetcherFunc
    name string
}{
    {FetcherSpoof, "spoof"},          // Existing
    {Fetcher, "standard"},            // Existing
    {FetcherUTLS, "utls"},            // NEW: TLS fingerprint spoofing
    {FetcherCurl, "curl"},            // Existing
}
```

**Positioning rationale:**
- Before curl (faster than spawning external process)
- After standard attempts (preserves fast path)
- Independent of headless browser (different technique)

### Core Implementation

```go
package www

import (
    "context"
    "crypto/tls"
    "fmt"
    "io"
    "net"
    "net/http"
    "strings"
    "time"

    utls "github.com/refraction-networking/utls"
)

// Browser profiles to rotate through
var browserProfiles = []utls.ClientHelloID{
    utls.HelloChrome_120,
    utls.HelloFirefox_105,
    utls.HelloSafari_16_0,
}

var profileIndex = 0

func getNextProfile() utls.ClientHelloID {
    profile := browserProfiles[profileIndex]
    profileIndex = (profileIndex + 1) % len(browserProfiles)
    return profile
}

func FetcherUTLS(ctx context.Context, url string) ([]byte, string, error) {
    // Select browser profile
    profile := getNextProfile()

    // Create custom transport with utls
    tr := &http.Transport{
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

            // Create utls connection with browser profile
            tlsConfig := &utls.Config{
                ServerName: host,
            }
            uconn := utls.UClient(conn, tlsConfig, profile)

            // Perform TLS handshake
            if err := uconn.HandshakeContext(ctx); err != nil {
                conn.Close()
                return nil, err
            }

            return uconn, nil
        },
        TLSHandshakeTimeout: 10 * time.Second,
    }

    client := &http.Client{
        Transport: tr,
        Timeout:   30 * time.Second,
    }

    req, err := http.NewRequestWithContext(ctx, http.MethodGet, url, nil)
    if err != nil {
        return nil, "", err
    }

    // Set User-Agent to match browser profile
    req.Header.Set("User-Agent", getUserAgentForProfile(profile))

    res, err := client.Do(req)
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

func getUserAgentForProfile(profile utls.ClientHelloID) string {
    // Match User-Agent to TLS fingerprint to avoid detection
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
```

### Advanced: Connection Pooling & Reuse

To improve performance and avoid creating new TLS connections for every request:

```go
var (
    utlsTransport *http.Transport
    utlsClient    *http.Client
    once          sync.Once
)

func initUTLSClient() {
    once.Do(func() {
        utlsTransport = &http.Transport{
            DialTLSContext: func(ctx context.Context, network, addr string) (net.Conn, error) {
                // ... DialTLS implementation from above
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

func FetcherUTLS(ctx context.Context, url string) ([]byte, string, error) {
    initUTLSClient()

    req, err := http.NewRequestWithContext(ctx, http.MethodGet, url, nil)
    if err != nil {
        return nil, "", err
    }

    profile := getNextProfile()
    req.Header.Set("User-Agent", getUserAgentForProfile(profile))

    res, err := utlsClient.Do(req)
    // ... rest of implementation
}
```

### Critical: User-Agent Consistency

**IMPORTANT:** TLS fingerprint and User-Agent MUST match to avoid detection.

Anti-bot systems check for inconsistencies like:
- Chrome TLS fingerprint + Firefox User-Agent = Bot detected
- Safari TLS fingerprint + Chrome User-Agent = Bot detected

**Best Practice:**
- Rotate both TLS profile AND User-Agent together
- Use realistic, current browser versions
- Test against bot detection test sites

---

## Integration Testing

### Test Sites for Validation

1. **Bot Detection Tests:**
   - https://bot.sannysoft.com/
   - https://www.browserscan.net/bot-detection
   - https://arh.antoinevastel.com/bots/areyouheadless

2. **Cloudflare Protected Sites:**
   - Use sites from failure logs with `Cf-Mitigated: challenge` header
   - Test against known Cloudflare-protected endpoints

3. **TLS Fingerprint Analyzers:**
   - https://tls.browserleaks.com/json
   - https://ja3er.com/

### Testing Strategy

```go
func TestFetcherUTLS_Fingerprint(t *testing.T) {
    // Test against fingerprint detection
    url := "https://tls.browserleaks.com/json"
    body, _, err := FetcherUTLS(context.Background(), url)

    if err != nil {
        t.Fatalf("FetcherUTLS failed: %v", err)
    }

    // Parse JSON response
    var result map[string]interface{}
    json.Unmarshal(body, &result)

    // Verify JA3 fingerprint doesn't match default Go client
    ja3 := result["ja3_hash"].(string)
    t.Logf("JA3 Fingerprint: %s", ja3)

    // Go's default JA3: should NOT match this
    goDefaultJA3 := "7dd50e112cd23734a310b90f6f44c621"
    if ja3 == goDefaultJA3 {
        t.Error("TLS fingerprint matches default Go client - spoofing failed")
    }
}

func TestFetcherUTLS_Cloudflare(t *testing.T) {
    // Test against real Cloudflare-protected site
    // (Use a known protected URL from failure logs)
    url := "https://example-cloudflare-site.com"

    body, finalURL, err := FetcherUTLS(context.Background(), url)

    if err != nil {
        t.Fatalf("Failed to fetch Cloudflare-protected site: %v", err)
    }

    // Check we didn't get challenge page
    if strings.Contains(string(body), "cf-challenge") {
        t.Error("Received Cloudflare challenge page - fingerprint spoofing ineffective")
    }

    t.Logf("Successfully fetched %d bytes from %s", len(body), finalURL)
}
```

### Manual Testing Checklist

- [ ] Verify JA3 fingerprint changes per request (rotation working)
- [ ] Confirm User-Agent matches TLS fingerprint
- [ ] Test against bot.sannysoft.com (should show as browser, not headless)
- [ ] Test against Cloudflare-protected site from failure logs
- [ ] Verify connection pooling works (check network traces)
- [ ] Confirm no performance regression vs standard fetcher

---

## HTTP/2 Considerations

### The HTTP/2 Problem

When using custom `DialTLS`, Go's `net/http` **disables automatic HTTP/2** support. This creates issues:
- TLS handshake negotiates HTTP/2 via ALPN
- Server expects HTTP/2 communication
- Client continues with HTTP/1.1
- Protocol mismatch causes failures

### Solution: Manual HTTP/2 Configuration

```go
import (
    "golang.org/x/net/http2"
)

func initUTLSClient() {
    once.Do(func() {
        utlsTransport = &http.Transport{
            DialTLSContext: func(ctx context.Context, network, addr string) (net.Conn, error) {
                // ... utls DialTLS implementation
            },
            // HTTP/2 settings
            ForceAttemptHTTP2: true,
        }

        // Enable HTTP/2 explicitly
        http2.ConfigureTransport(utlsTransport)

        utlsClient = &http.Client{
            Transport: utlsTransport,
            Timeout:   30 * time.Second,
        }
    })
}
```

**Note:** This may still have limitations. If HTTP/2 issues persist, consider:
1. Stick with HTTP/1.1 for simplicity (most sites support both)
2. Use separate transports for HTTP/2 vs HTTP/1.1
3. Detect ALPN negotiation and route accordingly

For initial implementation, HTTP/1.1 is sufficient and avoids complexity.

---

## Effectiveness & Limitations

### What utls SOLVES

✅ **TLS Fingerprint Detection**
- Mimics real browser TLS handshakes
- Passes JA3/JA4 fingerprint checks
- Evades basic bot detection based on TLS

✅ **Cloudflare Basic Protection**
- Bypasses TLS-based bot detection
- Works against lower security levels
- Effective when combined with proper headers

✅ **Fingerprint Blacklists**
- Randomized profiles defeat static blacklists
- Profile rotation prevents pattern detection

### What utls CANNOT SOLVE Alone

❌ **Advanced Cloudflare (Turnstile, UAM)**
- JavaScript challenges require browser execution
- Needs headless browser or FlareSolverr

❌ **Behavioral Analysis**
- Timing patterns, mouse movements, scroll behavior
- Requires human-like interaction simulation

❌ **CAPTCHA Challenges**
- Visual or interactive verification
- Needs external solving service

❌ **JavaScript-Rendered Content**
- Sites requiring JS execution
- Needs headless browser solution

### Effectiveness Estimation

Based on the Fetcher Reliability Initiative goals:

**Current Failure Modes:**
- TLS fingerprint detection: ~10-15% of failures
- Cloudflare challenges: ~20-25% of failures
- JavaScript-required: ~15-20% of failures

**Expected Improvement with utls:**
- TLS fingerprint failures: -80% reduction (10-15% → 2-3%)
- Cloudflare basic: -40% reduction (some overlap with JS issues)
- **Overall fetch success rate: +5-8% improvement**

**Combined with other initiatives:**
- utls (TLS) + headless browser (JS) + FlareSolverr (Cloudflare) = target 50% failure reduction

---

## Dependencies & Maintenance

### Required Dependency

```go
require (
    github.com/refraction-networking/utls v1.6.7
)
```

**Version Notes:**
- Latest release: January 12, 2026
- Active maintenance (Refraction Networking project)
- Imported by 882+ projects
- Go 1.21+ compatibility

### Maintenance Considerations

**Browser Profile Updates:**
- Browser versions evolve (Chrome 120 → 131 → future)
- utls updates profiles regularly
- Plan to update dependency quarterly
- Monitor utls releases for new profiles

**Security Updates:**
- TLS 1.3 features (post-quantum crypto: X25519MLKEM768)
- Keep dependency current for security patches
- Watch for breaking changes in updates

**Compatibility:**
- Go version requirements
- stdlib `crypto/tls` API changes
- Coordinate with other fetcher dependencies

---

## Rollout Plan

### Phase 1: Basic Implementation (This Task)
- [x] Research and document approach
- [ ] Implement FetcherUTLS with basic profile rotation
- [ ] Add to waterfall as third strategy
- [ ] Unit tests for fingerprint validation
- [ ] Integration tests against test sites

### Phase 2: Validation & Monitoring
- [ ] Deploy to production with monitoring
- [ ] Analyze failure logs for effectiveness
- [ ] Identify sites that benefit from utls
- [ ] Measure success rate improvement

### Phase 3: Optimization
- [ ] Implement connection pooling
- [ ] Add smart routing (known TLS-sensitive sites → utls)
- [ ] Fine-tune profile rotation strategy
- [ ] Consider HTTP/2 support if needed

### Phase 4: Integration with Other Techniques
- [ ] Coordinate with headless browser implementation
- [ ] Coordinate with FlareSolverr integration
- [ ] Create decision tree for strategy selection
- [ ] Optimize waterfall order based on data

---

## Cost-Benefit Analysis

### Costs

**Development Time:** 1-2 days
- Implementation: 4-6 hours
- Testing: 2-4 hours
- Documentation: 1-2 hours

**Runtime Overhead:**
- TLS handshake: +50-100ms per request (first connection)
- Connection pooling mitigates (reused connections ~same speed)
- Memory: Minimal (+1-2MB for profiles)

**Maintenance:**
- Quarterly dependency updates
- Monitor for profile effectiveness
- Watch for anti-bot detection evolution

### Benefits

**Success Rate Improvement:**
- +5-8% absolute improvement in fetch success
- Reduces user-facing "failed to fetch" errors
- Better data completeness

**Foundation for Future Work:**
- Enables more sophisticated anti-bot techniques
- Pairs with headless browser and FlareSolverr
- Provides learning about bot detection mechanisms

**User Experience:**
- More articles fetched successfully
- Fewer manual retries needed
- Better perception of reliability

### ROI

For 1000 articles/day at current ~15-20% failure rate:
- Current: 150-200 failures/day
- With utls: -50-80 failures/day (5-8% improvement)
- **Net: 50-80 additional successful fetches per day**

Value:
- User satisfaction improvement
- Reduced support burden
- Better data for downstream processing
- Competitive advantage in article fetching

---

## Alternatives Considered

### 1. Use spoofed-round-tripper

**Pros:** Higher-level API, handles complexities
**Cons:** Additional dependency layer, less control
**Decision:** Not needed for our use case; direct utls is sufficient

### 2. Use CycleTLS

**Pros:** Comprehensive solution
**Cons:** Heavier weight, complex integration
**Decision:** Overkill for our needs

### 3. Use curl with custom TLS config

**Pros:** External process, isolated
**Cons:** Hard to configure TLS fingerprints, performance overhead
**Decision:** Already have curl fallback; utls is more flexible

### 4. Do nothing, rely on curl fallback

**Pros:** Zero dev work
**Cons:** Misses 5-8% success rate improvement, doesn't address root cause
**Decision:** Proactive improvement worthwhile

---

## References & Sources

### Core Libraries
- [refraction-networking/utls GitHub](https://github.com/refraction-networking/utls)
- [utls Go Package Documentation](https://pkg.go.dev/github.com/refraction-networking/utls)
- [spoofed-round-tripper GitHub](https://github.com/juzeon/spoofed-round-tripper)
- [CycleTLS GitHub](https://github.com/Danny-Dasilva/CycleTLS)

### TLS Fingerprinting Resources
- [What Is TLS Fingerprint - ZenRows](https://www.zenrows.com/blog/what-is-tls-fingerprint)
- [Impersonating JA3 Fingerprints - Medium](https://medium.com/cu-cyber/impersonating-ja3-fingerprints-b9f555880e42)
- [Hiding behind JA3 hash - Defensive Security](https://www.defensive-security.com/blog/hiding-behind-ja3-hash)

### Implementation Guides
- [Using utls with http.Transport - GitHub Issue #16](https://github.com/refraction-networking/utls/issues/16)
- [Custom Go HTTP Client with Custom Transport - Gist](https://gist.github.com/integrii/8d60d0b7690fbd01b1527cc63643229c)
- [Using a Custom HTTP Dialer in Go](https://joshrendek.com/2015/09/using-a-custom-http-dialer-in-go/)

### Detection & Testing
- [Cloudflare Bypass Guide - ZenRows](https://www.zenrows.com/blog/golang-cloudflare-bypass)
- [JA3 Detection Library - GitHub](https://github.com/dreadl0ck/ja3)

---

## Conclusion

Implementing TLS fingerprint spoofing with **refraction-networking/utls** is a high-value, moderate-effort enhancement to the readlater fetcher. It addresses a specific failure mode (TLS fingerprint detection) that accounts for 5-8% of fetch failures, providing measurable improvement in success rates.

The implementation is straightforward:
1. Add utls dependency
2. Create custom DialTLS with browser profiles
3. Add as third strategy in waterfall
4. Ensure User-Agent consistency
5. Test and monitor effectiveness

Combined with the headless browser research (readlater-a0g) and planned FlareSolverr integration (readlater-ari), this forms a comprehensive approach to the Fetcher Reliability Improvement Initiative (readlater-fh6).

**Status: Ready for implementation.**
