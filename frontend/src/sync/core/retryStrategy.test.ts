import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  calculateRetryDelay,
  shouldRetry,
  createRetryState,
  recordFailure,
  recordSuccess,
  isTimeToRetry,
  getRetryStatus,
  isRetryableError,
  DEFAULT_RETRY_CONFIG,
} from './retryStrategy';

describe('retryStrategy', () => {
  beforeEach(() => {
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('calculateRetryDelay', () => {
    it('calculates exponential backoff', () => {
      // With random = 0.5, jitter = 0
      expect(calculateRetryDelay(0)).toBe(1000); // 1000 * 2^0 = 1000
      expect(calculateRetryDelay(1)).toBe(2000); // 1000 * 2^1 = 2000
      expect(calculateRetryDelay(2)).toBe(4000); // 1000 * 2^2 = 4000
      expect(calculateRetryDelay(3)).toBe(8000); // 1000 * 2^3 = 8000
    });

    it('caps at max delay', () => {
      expect(calculateRetryDelay(10)).toBe(60000); // Capped at maxDelayMs
    });

    it('applies jitter', () => {
      vi.spyOn(Math, 'random').mockReturnValue(0); // -30% jitter
      expect(calculateRetryDelay(0)).toBe(700); // 1000 - 300

      vi.spyOn(Math, 'random').mockReturnValue(1); // +30% jitter
      expect(calculateRetryDelay(0)).toBe(1300); // 1000 + 300
    });
  });

  describe('shouldRetry', () => {
    it('returns true when under max retries', () => {
      expect(shouldRetry(0)).toBe(true);
      expect(shouldRetry(4)).toBe(true);
    });

    it('returns false when at or over max retries', () => {
      expect(shouldRetry(5)).toBe(false);
      expect(shouldRetry(10)).toBe(false);
    });

    it('respects custom config', () => {
      const config = { ...DEFAULT_RETRY_CONFIG, maxRetries: 3 };
      expect(shouldRetry(2, config)).toBe(true);
      expect(shouldRetry(3, config)).toBe(false);
    });
  });

  describe('createRetryState', () => {
    it('creates initial state with attempt 0', () => {
      const state = createRetryState();
      expect(state.attempt).toBe(0);
      expect(state.nextRetryTime).toBeUndefined();
      expect(state.lastError).toBeUndefined();
    });
  });

  describe('recordFailure', () => {
    it('increments attempt and sets next retry time', () => {
      const state = createRetryState();
      const now = 1000000;
      const newState = recordFailure(state, 'Network error', now);

      expect(newState.attempt).toBe(1);
      expect(newState.lastError).toBe('Network error');
      expect(newState.nextRetryTime).toBeGreaterThan(now);
    });

    it('accumulates attempts', () => {
      let state = createRetryState();
      state = recordFailure(state, 'Error 1', 1000);
      state = recordFailure(state, 'Error 2', 2000);
      state = recordFailure(state, 'Error 3', 3000);

      expect(state.attempt).toBe(3);
      expect(state.lastError).toBe('Error 3');
    });
  });

  describe('recordSuccess', () => {
    it('resets state', () => {
      let state = createRetryState();
      state = recordFailure(state, 'Error', 1000);
      state = recordSuccess();

      expect(state.attempt).toBe(0);
      expect(state.nextRetryTime).toBeUndefined();
      expect(state.lastError).toBeUndefined();
    });
  });

  describe('isTimeToRetry', () => {
    it('returns true when no next retry time is set', () => {
      const state = createRetryState();
      expect(isTimeToRetry(state)).toBe(true);
    });

    it('returns true when current time is past retry time', () => {
      const state = { attempt: 1, nextRetryTime: 1000 };
      expect(isTimeToRetry(state, 2000)).toBe(true);
    });

    it('returns false when current time is before retry time', () => {
      const state = { attempt: 1, nextRetryTime: 2000 };
      expect(isTimeToRetry(state, 1000)).toBe(false);
    });
  });

  describe('getRetryStatus', () => {
    it('returns "ready" for initial state', () => {
      expect(getRetryStatus(createRetryState())).toBe('ready');
    });

    it('returns "ready to retry" when time has passed', () => {
      vi.spyOn(Date, 'now').mockReturnValue(2000);
      const state = { attempt: 1, nextRetryTime: 1000 };
      expect(getRetryStatus(state)).toBe('ready to retry');
    });

    it('returns countdown when waiting', () => {
      vi.spyOn(Date, 'now').mockReturnValue(1000);
      const state = { attempt: 1, nextRetryTime: 6000 };
      expect(getRetryStatus(state)).toBe('retrying in 5s');
    });
  });

  describe('isRetryableError', () => {
    it('returns true for TypeError (network error)', () => {
      expect(isRetryableError(new TypeError('Failed to fetch'))).toBe(true);
    });

    it('returns true for timeout errors', () => {
      expect(isRetryableError(new Error('Request timed out'))).toBe(true);
      expect(isRetryableError(new Error('Timeout exceeded'))).toBe(true);
    });

    it('returns true for network errors', () => {
      expect(isRetryableError(new Error('Network error'))).toBe(true);
    });

    it('returns true for 5xx errors', () => {
      expect(isRetryableError(new Error('HTTP 500: Internal Server Error'))).toBe(
        true
      );
      expect(isRetryableError(new Error('HTTP 503: Service Unavailable'))).toBe(
        true
      );
    });

    it('returns true for 429 rate limit', () => {
      expect(isRetryableError(new Error('HTTP 429: Too Many Requests'))).toBe(true);
    });

    it('returns false for 4xx errors (except 429)', () => {
      expect(isRetryableError(new Error('HTTP 400: Bad Request'))).toBe(false);
      expect(isRetryableError(new Error('HTTP 401: Unauthorized'))).toBe(false);
      expect(isRetryableError(new Error('HTTP 404: Not Found'))).toBe(false);
    });

    it('returns true for unknown errors (default)', () => {
      expect(isRetryableError(new Error('Unknown error'))).toBe(true);
      expect(isRetryableError('string error')).toBe(true);
    });
  });
});
