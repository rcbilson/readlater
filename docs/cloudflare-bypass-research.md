# Cloudflare Bypass Research - FlareSolverr Alternatives

**Research Date:** 2026-01-25
**Context:** Evaluating solutions for bypassing Cloudflare protection on article fetching.

## Executive Summary

**FlareSolverr is deprecated and no longer effective** as of 2026. The original maintainers discontinued the project because it could not solve modern Cloudflare challenges. For the readlater fetcher, a **layered approach combining Rod (headless browser) + utls (TLS fingerprinting) + smart retry logic** is recommended instead of relying on FlareSolverr.

**Status:** FlareSolverr task (readlater-ari) should be **closed as obsolete** and replaced with headless browser implementation using Rod + go-rod/stealth from research task readlater-a0g.

---

## FlareSolverr Status in 2026

### Deprecation Notice

FlareSolverr's support team communicated via GitHub issue that they **deprecated the tool and will no longer maintain it**, solely because **the tool couldn't solve the Cloudflare challenge anymore**. Key issues:

- CAPTCHA solvers are nonfunctional as of January 2026
- Cannot bypass modern Cloudflare challenges (Turnstile, UAM)
- No active maintenance or updates
- Cloudflare's continuous updates make it challenging for open-source tools to keep pace

### What FlareSolverr Was

- **Proxy server** that solved Cloudflare challenges using Puppeteer/Selenium with stealth plugins
- Returned valid Cloudflare cookies for reuse
- Ran as sidecar service (typically Docker on port 8191)
- Used browser automation to solve JavaScript challenges

### Why It Failed

1. **Detection Evolution:** Cloudflare improved bot detection faster than open-source tools could adapt
2. **Maintenance Burden:** Keeping stealth techniques current requires constant updates
3. **Browser Fingerprinting:** Modern Cloudflare uses sophisticated fingerprinting beyond JavaScript challenges
4. **Behavioral Analysis:** Cloudflare analyzes timing, mouse movements, and interaction patterns

---

## Modern Cloudflare Protection (2026)

### Protection Layers

1. **TLS Fingerprinting (JA3/JA4)**
   - Detects Go's crypto/tls vs real browsers
   - **Solution:** utls library (already implemented in readlater-592)

2. **HTTP/2 Fingerprinting (Akamai)**
   - Analyzes HTTP/2 frame patterns
   - **Solution:** Proper HTTP/2 configuration with utls

3. **JavaScript Challenges**
   - Requires browser JavaScript engine execution
   - **Solution:** Headless browser (Rod with stealth)

4. **Turnstile CAPTCHA**
   - Interactive verification widget
   - **Solution:** Third-party solving service OR headless browser with stealth

5. **Behavioral Analysis**
   - Mouse movements, timing patterns, scroll behavior
   - **Solution:** Randomized delays, realistic interaction simulation

6. **IP Reputation**
   - Blocks datacenter IPs, rate limiting
   - **Solution:** Residential proxies, rate limiting

---

## Current Best Practices for Cloudflare Bypass (2026)

### Layered Defense Approach

**Tier 1: Basic Protection (Implemented ✅)**
- Standard HTTP client
- User-Agent spoofing
- TLS fingerprinting (utls)

**Tier 2: JavaScript Challenges (Recommended)**
- Headless browser (Rod + go-rod/stealth)
- Stealth plugins to hide automation markers
- Cookie persistence

**Tier 3: Advanced Protection (Future)**
- Commercial APIs (ZenRows, ScrapFly, BrightData)
- CAPTCHA solving services
- Residential proxy rotation

### Recommended Tools for Golang

| Tool/Approach | Use Case | Complexity | Effectiveness | Cost |
|--------------|----------|------------|---------------|------|
| **utls** | TLS fingerprinting | Low | Medium (60-70%) | Free |
| **Rod + stealth** | JS challenges, basic Cloudflare | Medium | Medium-High (70-85%) | Free |
| **Residential Proxies** | IP reputation | Low | High (when combined) | $$ |
| **Commercial APIs** | All Cloudflare types | Low | Very High (95%+) | $$$ |
| **FlareSolverr** | ❌ DEPRECATED | - | Low (0-20%) | Free |

---

## Alternatives Analysis

### 1. Rod with go-rod/stealth (RECOMMENDED)

**Already researched in readlater-a0g**

**Capabilities:**
- Execute JavaScript (handles JS challenges)
- Apply stealth evasions (hide automation markers)
- Manage cookies and sessions
- Realistic browser fingerprint

**Golang Implementation:**
```go
import (
    "github.com/go-rod/rod"
    "github.com/go-rod/stealth"
)

func FetcherHeadless(ctx context.Context, url string) ([]byte, string, error) {
    browser := initBrowser()
    page := browser.MustPage()
    defer page.MustClose()

    // Apply stealth evasions
    stealth.Apply(page)

    // Navigate and wait for Cloudflare challenge to resolve
    page.MustNavigate(url).MustWaitLoad()

    // Optional: Wait for specific element indicating challenge passed
    page.Timeout(30 * time.Second).MustElement("body")

    html := page.MustHTML()
    finalURL := page.MustInfo().URL

    return []byte(html), finalURL, nil
}
```

**Pros:**
- Free and open source
- Active maintenance
- Golang native
- Handles JavaScript challenges
- Stealth plugin actively maintained

**Cons:**
- Slower than HTTP (5-10s vs 1-2s)
- Higher memory usage (50-100MB per browser)
- May not bypass all Cloudflare protections
- No CAPTCHA solving

**Effectiveness:**
- Basic Cloudflare: 70-85% success rate
- JavaScript challenges: 90%+ success rate
- Turnstile CAPTCHA: 0% (requires human interaction or solving service)

### 2. Nodriver (Python Only)

**Status:** Successor to undetected-chromedriver, highly effective for Python

**Baseline Performance (2026 testing):**
- Nodriver: 25% success rate (default config)
- ZenDriver (Nodriver fork): 75% success rate
- Playwright: 25% success rate (default)

**Golang Availability:** ❌ None - Python only

### 3. Playwright-Go with Stealth

**Repository:** https://github.com/playwright-community/playwright-go

**Status:** Community-maintained Playwright bindings for Go

**Stealth:** No official stealth plugin for Golang (exists for Node.js/Python)

**Effectiveness:** Low without stealth modifications (25% baseline)

**Recommendation:** Not recommended - Rod + stealth is better for Golang

### 4. Commercial APIs

#### ZenRows
- **API:** REST API for web scraping with Cloudflare bypass
- **Pricing:** Pay-per-request (~$0.01-0.05 per request)
- **Effectiveness:** 95%+ including Turnstile
- **Golang Client:** Standard HTTP client

#### ScrapFly
- **API:** Similar to ZenRows
- **Pricing:** Pay-per-request
- **Effectiveness:** 95%+
- **Features:** Rotating proxies, browser rendering, anti-bot bypass

#### BrightData
- **Product:** Scraping Browser (managed headless browsers)
- **Pricing:** Enterprise pricing
- **Effectiveness:** 98%+
- **Features:** CAPTCHA solving, residential proxies, full rendering

**Pros:**
- Highest success rates
- No maintenance burden
- Handles all Cloudflare types
- Professional support

**Cons:**
- Recurring costs (can be significant at scale)
- External dependency
- Privacy considerations (data sent to third party)
- API rate limits

### 5. Cloudscraper (Python Library)

**Status:** Python library for Cloudflare bypass

**Mechanism:** Solves JavaScript challenges programmatically (no browser)

**Golang Equivalent:** None available

**Effectiveness:** Declining (Cloudflare evolved beyond simple JS challenges)

### 6. CycleTLS (Golang)

**Repository:** https://github.com/Danny-Dasilva/CycleTLS

**Capability:** TLS/JA3 fingerprint spoofing

**Overlap:** Similar to utls (already implemented)

**Recommendation:** utls is more mature; CycleTLS doesn't add significant value

---

## Recommended Implementation Strategy

### Phase 1: Implement Rod + Stealth (Immediate)

**Action:** Complete implementation from readlater-a0g research

**Integration:**
```go
fetchers := []struct {
    fn   FetcherFunc
    name string
}{
    {FetcherSpoof, "spoof"},
    {Fetcher, "standard"},
    {FetcherUTLS, "utls"},
    {FetcherHeadless, "headless"},  // NEW: Rod + stealth
    {FetcherCurl, "curl"},
}
```

**Expected Impact:**
- +20-30% success rate on Cloudflare-protected sites
- Handles JavaScript challenges
- Free and self-hosted

### Phase 2: Smart Routing (Short-term)

**Detection Logic:**
```go
func detectCloudflare(headers http.Header) bool {
    // Check for Cloudflare headers
    if headers.Get("Cf-Ray") != "" {
        return true
    }
    if headers.Get("Cf-Mitigated") == "challenge" {
        return true
    }
    return false
}

func FetcherCombinedSmart(ctx context.Context, url string) ([]byte, string, error) {
    // Try fast path first
    body, finalURL, err := FetcherUTLS(ctx, url)
    if err == nil {
        return body, finalURL, nil
    }

    // Check if Cloudflare-protected
    // (Could maintain a cache of known Cloudflare domains)

    // Escalate to headless browser
    return FetcherHeadless(ctx, url)
}
```

**Benefits:**
- Fast path for non-protected sites
- Automatic escalation for Cloudflare
- Optimizes resource usage

### Phase 3: Cookie Caching (Medium-term)

**Concept:** Cache valid Cloudflare cookies per domain

```go
type CookieCache struct {
    mu      sync.RWMutex
    cookies map[string][]*http.Cookie  // domain -> cookies
    expiry  map[string]time.Time
}

func (c *CookieCache) Get(domain string) []*http.Cookie {
    c.mu.RLock()
    defer c.mu.RUnlock()

    if exp, ok := c.expiry[domain]; ok && time.Now().Before(exp) {
        return c.cookies[domain]
    }
    return nil
}

func (c *CookieCache) Set(domain string, cookies []*http.Cookie, ttl time.Duration) {
    c.mu.Lock()
    defer c.mu.Unlock()

    c.cookies[domain] = cookies
    c.expiry[domain] = time.Now().Add(ttl)
}
```

**Workflow:**
1. Check cookie cache for domain
2. If valid cookies exist, use with HTTP client
3. If no cookies or expired, use headless browser
4. Cache resulting cookies (typically valid 30-60 min)

**Benefits:**
- Only need headless browser once per domain per hour
- Subsequent requests use fast HTTP client
- Significant performance improvement

### Phase 4: Commercial Fallback (Optional)

**For Critical Sites:**
- Maintain list of high-value domains (e.g., NYTimes, WSJ)
- If headless browser fails, escalate to commercial API
- Cost containment via allowlist

```go
var criticalDomains = map[string]bool{
    "nytimes.com": true,
    "wsj.com": true,
    // ... high-value sources
}

func FetcherWithFallback(ctx context.Context, url string) ([]byte, string, error) {
    // Try all self-hosted methods
    body, finalURL, err := FetcherCombined(ctx, url)
    if err == nil {
        return body, finalURL, nil
    }

    // Check if critical domain
    domain := extractDomain(url)
    if !criticalDomains[domain] {
        return nil, "", err  // Don't pay for non-critical
    }

    // Escalate to commercial API
    return FetcherCommercialAPI(ctx, url)
}
```

---

## Cloudflare Detection Heuristics

### Response Headers Indicating Cloudflare

```go
func isCloudflareProtected(resp *http.Response) bool {
    // Cloudflare Ray ID present
    if resp.Header.Get("Cf-Ray") != "" {
        return true
    }

    // Challenge page
    if resp.Header.Get("Cf-Mitigated") == "challenge" {
        return true
    }

    // Status codes
    if resp.StatusCode == 403 || resp.StatusCode == 503 {
        // Could be Cloudflare block/challenge
        // Check response body for Cloudflare markers
        return true
    }

    return false
}
```

### Response Body Markers

```go
func detectCloudflareChallengeInBody(body []byte) bool {
    bodyStr := string(body)

    markers := []string{
        "cf-challenge",
        "cf_challenge_response",
        "ray_id",
        "cloudflare-static",
        "Checking your browser",
        "cf-browser-verification",
    }

    for _, marker := range markers {
        if strings.Contains(bodyStr, marker) {
            return true
        }
    }

    return false
}
```

---

## Testing Strategy

### Test Against Known Cloudflare Sites

```go
var cloudflareTestSites = []string{
    "https://nowsecure.nl",  // Cloudflare test site
    "https://bot.sannysoft.com/",  // Bot detection test
    "https://www.browserscan.net/bot-detection",  // Fingerprint test
}

func TestCloudflareBypass(t *testing.T) {
    for _, url := range cloudflareTestSites {
        body, _, err := FetcherHeadless(context.Background(), url)

        if err != nil {
            t.Errorf("Failed to fetch %s: %v", url, err)
            continue
        }

        // Verify we didn't get challenge page
        if detectCloudflareChallengeInBody(body) {
            t.Errorf("Received Cloudflare challenge for %s", url)
        }
    }
}
```

### Success Metrics

Track via failure logging:
- Before Rod+stealth implementation: X% Cloudflare failures
- After Rod+stealth implementation: Y% Cloudflare failures
- Target: 50% reduction in Cloudflare-attributed failures

---

## Cost-Benefit Analysis

### Self-Hosted Approach (Rod + Stealth)

**Costs:**
- Development: 2-3 days
- Runtime: +2-5s per request, +50-100MB memory per browser
- Maintenance: Quarterly updates to stealth plugins

**Benefits:**
- Free (no per-request costs)
- Full control
- No data sharing with third parties
- +20-30% success rate improvement

**ROI:**
- At 1000 articles/day, 15% Cloudflare failures
- 150 failures/day → ~100 failures/day (33% improvement)
- **50 additional successful fetches/day**
- Cost: $0 recurring

### Commercial API Approach

**Costs:**
- ZenRows: $0.01-0.05 per request
- At 1000 articles/day: $10-50/day = $300-1500/month
- Potentially higher for premium features

**Benefits:**
- Highest success rate (95%+)
- No maintenance
- Handles CAPTCHA
- Professional support

**ROI:**
- 150 failures/day → ~10 failures/day (93% improvement)
- **140 additional successful fetches/day**
- Cost: $300-1500/month

**Recommendation:** Start with self-hosted Rod+stealth. Consider commercial API for specific high-value domains or if self-hosted effectiveness proves insufficient.

---

## Migration from FlareSolverr Plan

### Original Plan (Now Obsolete)

```
readlater-ari: Add FlareSolverr integration
├─ Run FlareSolverr as sidecar (Docker)
├─ Detect Cloudflare challenges
├─ Call FlareSolverr API to solve
├─ Cache cookies
└─ Retry with cookies
```

### Revised Plan (Recommended)

```
Close readlater-ari (obsolete - FlareSolverr deprecated)

Create new task: Implement Rod + go-rod/stealth for Cloudflare bypass
├─ Complete implementation from readlater-a0g research
├─ Add FetcherHeadless to waterfall
├─ Implement cookie caching
├─ Add Cloudflare detection logic
└─ Monitor effectiveness via failure logs

Optional future task: Commercial API fallback for critical domains
```

---

## Existing Golang FlareSolverr Clients (Academic Interest)

While FlareSolverr is deprecated, several Golang clients exist:

1. **github.com/SkYNewZ/go-flaresolverr**
   - Most mature client
   - Session management
   - Last updated: 2024

2. **github.com/astrocode-id/go-flaresolverr**
   - FlareSolverr v3 support
   - Simple API wrapper

3. **github.com/fahimbagar/go-flaresolverr**
   - Alternative client
   - v3 version available

4. **github.com/phd59fr/flaresolverr**
   - Handles GET, POST, PUT, DELETE
   - Routes through FlareSolverr

**Note:** These clients are functional but **not recommended** since FlareSolverr itself is deprecated and ineffective.

---

## References & Sources

### FlareSolverr Deprecation
- [FlareSolverr GitHub](https://github.com/FlareSolverr/FlareSolverr)
- [FlareSolverr Complete Guide 2026 - ZenRows](https://www.zenrows.com/blog/flaresolverr)
- [FlareSolverr Guide - RapidSeedbox](https://www.rapidseedbox.com/blog/flaresolverr-guide)
- [How to use FlareSolverr - RoundProxies](https://roundproxies.com/blog/flaresolverr/)

### Cloudflare Bypass Methods 2026
- [How to Bypass Cloudflare in 2026 - ZenRows](https://www.zenrows.com/blog/bypass-cloudflare)
- [Top Cloudflare Challenge Solvers 2026 - CapSolver](https://www.capsolver.com/blog/Cloudflare/top-challenge-solver-ranking)
- [How to Bypass Cloudflare 2026 - RoundProxies](https://roundproxies.com/blog/bypass-cloudflare/)
- [Solve Cloudflare in 2026 - CapSolver](https://www.capsolver.com/blog/Cloudflare/solve-cloudflare-in-2026)

### Golang Clients (Historical)
- [go-flaresolverr by SkYNewZ](https://github.com/SkYNewZ/go-flaresolverr)
- [go-flaresolverr by astrocode-id](https://github.com/astrocode-id/go-flaresolverr)
- [go-flaresolverr by fahimbagar](https://pkg.go.dev/github.com/fahimbagar/go-flaresolverr)
- [flaresolverr by phd59fr](https://pkg.go.dev/github.com/phd59fr/flaresolverr)

### Modern Alternatives
- [Playwright Cloudflare Bypass 2026 - BrowserStack](https://www.browserstack.com/guide/playwright-cloudflare)
- [Playwright Cloudflare Bypass - ZenRows](https://www.zenrows.com/blog/playwright-cloudflare-bypass)
- [How to Bypass Cloudflare - ScrapFly](https://scrapfly.io/blog/posts/how-to-bypass-cloudflare-anti-scraping)
- [Nodriver Performance Comparison - Medium](https://medium.com/@dimakynal/baseline-performance-comparison-of-nodriver-zendriver-selenium-and-playwright-against-anti-bot-2e593db4b243)

### Golang Scraping
- [Golang Cloudflare Bypass - ZenRows](https://www.zenrows.com/blog/golang-cloudflare-bypass)
- [How To Bypass Cloudflare - ScrapeOps](https://scrapeops.io/web-scraping-playbook/how-to-bypass-cloudflare/)

---

## Conclusion

**FlareSolverr is obsolete** for Cloudflare bypass in 2026. The recommended approach for the readlater fetcher is:

1. **Close readlater-ari** (FlareSolverr task) as obsolete
2. **Prioritize Rod + go-rod/stealth** implementation (already researched in readlater-a0g)
3. **Layer with utls** (already implemented in readlater-592)
4. **Implement cookie caching** for performance
5. **Consider commercial APIs** for critical high-value domains only

This layered approach provides:
- ✅ TLS fingerprinting (utls) - implemented
- ✅ JavaScript challenge handling (Rod+stealth) - researched, ready to implement
- ✅ Cookie persistence - straightforward addition
- ✅ Cost-effective (self-hosted, free)
- ✅ Privacy-friendly (no data sharing)
- ✅ Maintenance burden manageable

Expected overall improvement: **30-40% reduction in fetch failures** from combined techniques, meeting the Fetcher Reliability Initiative goal of 50% reduction when combined with header improvements and smart retry logic.

**Status:** Ready to close readlater-ari and create new implementation task for Rod+stealth.
