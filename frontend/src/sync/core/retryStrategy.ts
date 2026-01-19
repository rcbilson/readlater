// Retry strategy with exponential backoff and jitter

import { RetryConfig, RetryState } from '../types';

export const DEFAULT_RETRY_CONFIG: RetryConfig = {
  maxRetries: 5,
  baseDelayMs: 1000, // 1 second
  maxDelayMs: 60000, // 1 minute
  jitterFactor: 0.3, // 30% jitter
};

/**
 * Calculate the delay before the next retry attempt using exponential backoff with jitter.
 *
 * Formula: baseDelay * 2^attempt + random jitter
 *
 * This prevents thundering herd problems when many clients retry simultaneously.
 */
export function calculateRetryDelay(
  attempt: number,
  config: RetryConfig = DEFAULT_RETRY_CONFIG
): number {
  // Exponential backoff: base * 2^attempt
  const exponentialDelay = config.baseDelayMs * Math.pow(2, attempt);

  // Cap at max delay
  const cappedDelay = Math.min(exponentialDelay, config.maxDelayMs);

  // Add jitter: random value between -jitter% and +jitter%
  const jitterRange = cappedDelay * config.jitterFactor;
  const jitter = (Math.random() * 2 - 1) * jitterRange;

  // Ensure non-negative delay
  return Math.max(0, Math.round(cappedDelay + jitter));
}

/**
 * Check if we should retry based on the current attempt count
 */
export function shouldRetry(
  attempt: number,
  config: RetryConfig = DEFAULT_RETRY_CONFIG
): boolean {
  return attempt < config.maxRetries;
}

/**
 * Create a new retry state for tracking retry attempts
 */
export function createRetryState(): RetryState {
  return { attempt: 0 };
}

/**
 * Update retry state after a failure
 */
export function recordFailure(
  state: RetryState,
  error: string,
  now: number = Date.now(),
  config: RetryConfig = DEFAULT_RETRY_CONFIG
): RetryState {
  const newAttempt = state.attempt + 1;
  const delay = calculateRetryDelay(newAttempt, config);

  return {
    attempt: newAttempt,
    nextRetryTime: now + delay,
    lastError: error,
  };
}

/**
 * Reset retry state after success
 */
export function recordSuccess(): RetryState {
  return { attempt: 0 };
}

/**
 * Check if it's time to retry
 */
export function isTimeToRetry(state: RetryState, now: number = Date.now()): boolean {
  if (!state.nextRetryTime) return true;
  return now >= state.nextRetryTime;
}

/**
 * Get human-readable retry status
 */
export function getRetryStatus(state: RetryState): string {
  if (state.attempt === 0) return 'ready';
  if (!state.nextRetryTime) return 'failed';

  const now = Date.now();
  if (now >= state.nextRetryTime) return 'ready to retry';

  const remainingMs = state.nextRetryTime - now;
  const seconds = Math.ceil(remainingMs / 1000);
  return `retrying in ${seconds}s`;
}

/**
 * Determine if an error is retryable
 * Network errors and 5xx errors are retryable
 * 4xx errors (except 429) are not
 */
export function isRetryableError(error: unknown): boolean {
  if (error instanceof TypeError) {
    // Network errors (fetch failures) are retryable
    return true;
  }

  if (error instanceof Error) {
    const message = error.message.toLowerCase();

    // Timeout errors are retryable
    if (message.includes('timeout') || message.includes('timed out')) {
      return true;
    }

    // Network errors are retryable
    if (message.includes('network') || message.includes('fetch')) {
      return true;
    }

    // Check for HTTP status codes in the message
    const statusMatch = message.match(/\b(4\d{2}|5\d{2})\b/);
    if (statusMatch) {
      const status = parseInt(statusMatch[1], 10);
      // 429 (rate limit) and 5xx are retryable
      return status === 429 || status >= 500;
    }
  }

  // Default to retryable for unknown errors
  return true;
}
