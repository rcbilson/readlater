// URL canonicalization - matches backend's canonicalization exactly
// See backend/cmd/canonicalize/main.go

/**
 * Canonicalize a URL by removing query parameters and fragments.
 * This matches the backend's canonicalizeURL function exactly.
 */
export function canonicalizeUrl(rawUrl: string): string {
  try {
    const parsed = new URL(rawUrl);
    // Remove query parameters and fragment (hash)
    parsed.search = '';
    parsed.hash = '';
    return parsed.toString();
  } catch {
    // If URL is invalid, return as-is
    return rawUrl;
  }
}

/**
 * Check if two URLs are equivalent after canonicalization
 */
export function urlsMatch(url1: string, url2: string): boolean {
  return canonicalizeUrl(url1) === canonicalizeUrl(url2);
}

/**
 * Extract the hostname from a URL
 */
export function getHostname(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return url;
  }
}

/**
 * Normalize a URL for display (remove protocol, trailing slashes)
 */
export function displayUrl(url: string): string {
  try {
    const parsed = new URL(url);
    let display = parsed.hostname + parsed.pathname;
    // Remove trailing slash unless it's the root
    if (display.endsWith('/') && display !== parsed.hostname + '/') {
      display = display.slice(0, -1);
    }
    return display;
  } catch {
    return url;
  }
}

/**
 * Check if a URL is valid
 */
export function isValidUrl(url: string): boolean {
  try {
    new URL(url);
    return true;
  } catch {
    return false;
  }
}

/**
 * Get the canonical URL and the original URL for storage/lookup
 * Returns both so we can store with canonical but lookup with either
 */
export function getUrlVariants(url: string): { original: string; canonical: string } {
  return {
    original: url,
    canonical: canonicalizeUrl(url),
  };
}
