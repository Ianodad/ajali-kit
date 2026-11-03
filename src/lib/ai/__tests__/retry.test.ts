import { describe, expect, it, vi } from "vitest";

import { backoffDelayMs, retryAfterMs, withRetries } from "../retry";

describe("backoffDelayMs", () => {
  it("grows exponentially within +/-25% jitter of the base", () => {
    for (let attempt = 0; attempt < 4; attempt += 1) {
      const expected = 500 * 2 ** attempt;
      const delay = backoffDelayMs(attempt, 500);
      expect(delay).toBeGreaterThanOrEqual(expected * 0.75);
      expect(delay).toBeLessThanOrEqual(expected * 1.25);
    }
  });

  it("never returns a negative delay", () => {
    for (let i = 0; i < 20; i += 1) {
      expect(backoffDelayMs(0, 500)).toBeGreaterThanOrEqual(0);
    }
  });
});

describe("retryAfterMs", () => {
  function headers(value: string | null) {
    return { get: () => value };
  }

  it("reads a Retry-After in seconds", () => {
    expect(retryAfterMs(headers("2"))).toBe(2000);
  });

  it("returns null when the header is absent", () => {
    expect(retryAfterMs(headers(null))).toBeNull();
    expect(retryAfterMs(null)).toBeNull();
  });

  it("reads an HTTP-date Retry-After as a non-negative delay", () => {
    const future = new Date(Date.now() + 5000).toUTCString();
    const delay = retryAfterMs(headers(future));
    expect(delay).not.toBeNull();
    expect(delay).toBeGreaterThan(0);
  });

  it("returns null for an unparsable value", () => {
    expect(retryAfterMs(headers("not-a-date"))).toBeNull();
  });
});

describe("withRetries", () => {
  const noDelay = () => Promise.resolve();

  it("returns the result on the first success, with no retries", async () => {
    const attempt = vi.fn().mockResolvedValue("ok");
    const result = await withRetries(attempt, { isRetryable: () => true, sleep: noDelay });
    expect(result).toBe("ok");
    expect(attempt).toHaveBeenCalledTimes(1);
  });

  it("retries a retryable failure up to maxRetries, then succeeds", async () => {
    const attempt = vi
      .fn()
      .mockRejectedValueOnce(new Error("boom"))
      .mockRejectedValueOnce(new Error("boom"))
      .mockResolvedValueOnce("ok");
    const onRetry = vi.fn();
    const result = await withRetries(attempt, {
      isRetryable: () => true,
      sleep: noDelay,
      onRetry,
      maxRetries: 3,
    });
    expect(result).toBe("ok");
    expect(attempt).toHaveBeenCalledTimes(3);
    expect(onRetry).toHaveBeenCalledTimes(2);
  });

  it("throws the last error once maxRetries is exhausted", async () => {
    const attempt = vi.fn().mockRejectedValue(new Error("always fails"));
    await expect(
      withRetries(attempt, { isRetryable: () => true, sleep: noDelay, maxRetries: 2 }),
    ).rejects.toThrow("always fails");
    expect(attempt).toHaveBeenCalledTimes(3);
  });

  it("does not retry an error isRetryable rejects", async () => {
    const attempt = vi.fn().mockRejectedValue(new Error("fatal"));
    await expect(withRetries(attempt, { isRetryable: () => false, sleep: noDelay })).rejects.toThrow("fatal");
    expect(attempt).toHaveBeenCalledTimes(1);
  });

  it("uses the suggested Retry-After delay instead of backoff when given", async () => {
    const attempt = vi.fn().mockRejectedValueOnce(new Error("rate limited")).mockResolvedValueOnce("ok");
    const sleep = vi.fn().mockResolvedValue(undefined);
    await withRetries(attempt, {
      isRetryable: () => true,
      sleep,
      retryAfterMsFor: () => 1234,
    });
    expect(sleep).toHaveBeenCalledWith(1234);
  });
});
