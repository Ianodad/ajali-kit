import { useEffect, useRef } from "react";

// The Incident basics page's autosave pattern (a 600ms debounce) loses
// whatever changed in the last 600ms if the user navigates away before the
// timer fires, since the debounce effect's cleanup only clears the pending
// timeout, it never sends it (P4.R finding 1). This hook keeps the latest
// value in a ref and flushes it once, in a second effect's cleanup that only
// runs on an actual unmount (empty dependency array), so an in-app navigation
// right after an edit still saves it.
//
// A real unmount is not the only way the page goes away, though: a hard
// reload, closing the tab, or the browser putting the page in the
// back/forward cache never runs React's unmount cleanup in time, so the same
// edit made in the last 600ms before one of those is still lost (Phase 7
// gap). `pagehide` fires for all of those, and `visibilitychange` to
// "hidden" additionally covers switching away to another app on a phone, so
// both are wired to the same flush. The flush itself is idempotent (it just
// re-saves whatever is in `latest`), so calling it more than once (unmount
// plus one of these events) is harmless.
export function useFlushOnUnmount<T>(value: T, onUnmount: (value: T) => void): void {
  const latest = useRef(value);
  useEffect(() => {
    latest.current = value;
  }, [value]);
  useEffect(() => {
    const flush = () => onUnmount(latest.current);
    const handleVisibilityChange = () => {
      if (document.visibilityState === "hidden") flush();
    };
    window.addEventListener("pagehide", flush);
    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => {
      window.removeEventListener("pagehide", flush);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      flush();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- must register its listeners and cleanup once, on mount, not on every value change.
  }, []);
}
