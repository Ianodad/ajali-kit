// Mock mode detection. Every AI route returns a fixture instead of calling the
// Meta Model API when mock mode is on. Mock mode is on when the server env var
// AJALI_MOCK=1, or when the request carries the header x-ajali-mock: 1 (a dev
// toggle). See SPEC section 8.1.

export const MOCK_HEADER = "x-ajali-mock";
export const MOCK_DELAY_MS = 600;

type HeaderLike = { get(name: string): string | null };

export function isMockEnabled(headers?: HeaderLike | null): boolean {
  if (process.env.AJALI_MOCK === "1") {
    return true;
  }
  if (headers) {
    return headers.get(MOCK_HEADER) === "1";
  }
  return false;
}

// Fixtures respond after a short delay so the UI shows its loading states, the
// same as a real call would.
export function mockDelay(ms: number = MOCK_DELAY_MS): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
