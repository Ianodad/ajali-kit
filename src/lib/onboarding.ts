// F1's "Returning user: skip onboarding, land on Home" edge state. A plain
// localStorage flag, not IndexedDB: it is a one-bit UI preference, not data
// to worry about losing or wiping with "Clear all data" in Settings.
const ONBOARDING_DONE_KEY = "ajali-kit:onboarding-done";

export function hasCompletedOnboarding(): boolean {
  try {
    return localStorage.getItem(ONBOARDING_DONE_KEY) === "1";
  } catch {
    // Private mode or storage disabled: fail open so onboarding never blocks
    // Home. F1's own "storage unavailable" banner covers warning the user.
    return true;
  }
}

export function markOnboardingComplete(): void {
  try {
    localStorage.setItem(ONBOARDING_DONE_KEY, "1");
  } catch {
    // Nothing to persist; onboarding just shows again next time.
  }
}
