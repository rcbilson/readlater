import { describe, it, expect } from 'vitest';
import {
  canonicalizeUrl,
  urlsMatch,
  getHostname,
  displayUrl,
  isValidUrl,
  getUrlVariants,
} from './urlCanonicalizer';

describe('urlCanonicalizer', () => {
  describe('canonicalizeUrl', () => {
    it('removes query parameters', () => {
      expect(canonicalizeUrl('https://example.com/page?foo=bar')).toBe(
        'https://example.com/page'
      );
    });

    it('removes fragment', () => {
      expect(canonicalizeUrl('https://example.com/page#section')).toBe(
        'https://example.com/page'
      );
    });

    it('removes both query and fragment', () => {
      expect(canonicalizeUrl('https://example.com/page?foo=bar#section')).toBe(
        'https://example.com/page'
      );
    });

    it('preserves the path', () => {
      expect(canonicalizeUrl('https://example.com/path/to/page')).toBe(
        'https://example.com/path/to/page'
      );
    });

    it('preserves trailing slash', () => {
      expect(canonicalizeUrl('https://example.com/path/')).toBe(
        'https://example.com/path/'
      );
    });

    it('handles root URL', () => {
      expect(canonicalizeUrl('https://example.com/')).toBe('https://example.com/');
    });

    it('handles URL without path', () => {
      expect(canonicalizeUrl('https://example.com')).toBe('https://example.com/');
    });

    it('returns invalid URLs as-is', () => {
      expect(canonicalizeUrl('not-a-url')).toBe('not-a-url');
    });

    it('handles complex query strings', () => {
      expect(
        canonicalizeUrl(
          'https://example.com/page?utm_source=google&utm_medium=cpc&id=123'
        )
      ).toBe('https://example.com/page');
    });
  });

  describe('urlsMatch', () => {
    it('returns true for identical URLs', () => {
      expect(urlsMatch('https://example.com/page', 'https://example.com/page')).toBe(
        true
      );
    });

    it('returns true for URLs differing only in query params', () => {
      expect(
        urlsMatch('https://example.com/page?a=1', 'https://example.com/page?b=2')
      ).toBe(true);
    });

    it('returns true for URLs differing only in fragment', () => {
      expect(
        urlsMatch('https://example.com/page#a', 'https://example.com/page#b')
      ).toBe(true);
    });

    it('returns false for different paths', () => {
      expect(
        urlsMatch('https://example.com/page1', 'https://example.com/page2')
      ).toBe(false);
    });

    it('returns false for different domains', () => {
      expect(urlsMatch('https://example.com/page', 'https://other.com/page')).toBe(
        false
      );
    });
  });

  describe('getHostname', () => {
    it('extracts hostname from URL', () => {
      expect(getHostname('https://example.com/page')).toBe('example.com');
    });

    it('extracts subdomain', () => {
      expect(getHostname('https://blog.example.com/page')).toBe('blog.example.com');
    });

    it('returns original string for invalid URL', () => {
      expect(getHostname('not-a-url')).toBe('not-a-url');
    });
  });

  describe('displayUrl', () => {
    it('removes protocol and trailing slash', () => {
      expect(displayUrl('https://example.com/')).toBe('example.com/');
    });

    it('keeps path', () => {
      expect(displayUrl('https://example.com/page')).toBe('example.com/page');
    });

    it('removes trailing slash from path', () => {
      expect(displayUrl('https://example.com/page/')).toBe('example.com/page');
    });

    it('returns original string for invalid URL', () => {
      expect(displayUrl('not-a-url')).toBe('not-a-url');
    });
  });

  describe('isValidUrl', () => {
    it('returns true for valid URLs', () => {
      expect(isValidUrl('https://example.com')).toBe(true);
      expect(isValidUrl('http://example.com/page')).toBe(true);
      expect(isValidUrl('https://example.com/page?foo=bar')).toBe(true);
    });

    it('returns false for invalid URLs', () => {
      expect(isValidUrl('not-a-url')).toBe(false);
      expect(isValidUrl('example.com')).toBe(false);
      expect(isValidUrl('')).toBe(false);
    });
  });

  describe('getUrlVariants', () => {
    it('returns original and canonical URLs', () => {
      const result = getUrlVariants('https://example.com/page?foo=bar');
      expect(result.original).toBe('https://example.com/page?foo=bar');
      expect(result.canonical).toBe('https://example.com/page');
    });

    it('returns same URL when already canonical', () => {
      const result = getUrlVariants('https://example.com/page');
      expect(result.original).toBe('https://example.com/page');
      expect(result.canonical).toBe('https://example.com/page');
    });
  });
});
