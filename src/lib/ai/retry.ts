// Shared retry helper for the AI routes, per SPEC section 8.1: "Retries 429
// and 5xx up to 3 times with exponential backoff and jitter (start 500 ms),
// honouring Retry-After." Also used to retry a parsed-but-invalid model
// response (zod validation failure), which is not an HTTP status but still a
// transient, retry-worthy outcome on the real path.

export const DEFAULT_MAX_RETRIES = 3;
export const BASE_DELAY_MS = 500;

// Exponential backoff with +/-25% jitter: 500, 1000, 2000 ms before jitter.
export function backoffDelayMs(attempt: number, baseDelayMs = BASE_DELAY_MS): number {
  const exponential = baseDelayMs * 2 ** attempt;
  const jitter = exponential * 0.25 * (Math.random() * 2 - 1);
  return Math.max(0, Math.round(exponential + jitter));
}

// Reads a Retry-After header (seconds, or an HTTP date) off anything shaped
// like a fetch Headers object. Returns null when absent or unparsable.
export function retryAfterMs(headers: { get(name: string): string | null } | null | undefined): number | null {
  const value = headers?.get("retry-after");
  if (!value) return null;
  const seconds = Number(value);
  if (Number.isFinite(seconds)) return Math.max(0, seconds * 1000);
  const dateMs = Date.parse(value);
  if (Number.isNaN(dateMs)) return null;
  return Math.max(0, dateMs - Date.now());
}

export interface RetryOptions {
  maxRetries?: number;
  baseDelayMs?: number;
  isRetryable: (error: unknown) => boolean;
  retryAfterMsFor?: (error: unknown) => number | null;
  sleep?: (ms: number) => Promise<void>;
  onRetry?: (error: unknown, attempt: number, delayMs: number) => void;
}

const defaultSleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

// Calls `attempt()`, retrying on failures `isRetryable` accepts, up to
// `maxRetries` extra tries (so at most maxRetries + 1 calls). Rethrows the
// last error once retries are exhausted or the error is not retryable.
export async function withRetries<T>(attempt: () => Promise<T>, options: RetryOptions): Promise<T> {
  const maxRetries = options.maxRetries ?? DEFAULT_MAX_RETRIES;
  const baseDelayMs = options.baseDelayMs ?? BASE_DELAY_MS;
  const sleep = options.sleep ?? defaultSleep;

  for (let attemptIndex = 0; ; attemptIndex += 1) {
    try {
      return await attempt();
    } catch (error) {
      if (attemptIndex >= maxRetries || !options.isRetryable(error)) {
        throw error;
      }
      const suggested = options.retryAfterMsFor?.(error) ?? null;
      const delayMs = suggested ?? backoffDelayMs(attemptIndex, baseDelayMs);
      options.onRetry?.(error, attemptIndex + 1, delayMs);
      await sleep(delayMs);
    }
  }
}
