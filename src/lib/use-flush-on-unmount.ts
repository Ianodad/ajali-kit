import { useEffect, useRef } from "react";

// The Incident basics page's autosave pattern (a 600ms debounce) loses
// whatever changed in the last 600ms if the user navigates away before the
// timer fires, since the debounce effect's cleanup only clears the pending
// timeout, it never sends it (P4.R finding 1). This hook keeps the latest
// value in a ref and flushes it once, in a second effect's cleanup that only
// runs on an actual unmount (empty dependency array), so leaving the page
// right after an edit still saves it.
export function useFlushOnUnmount<T>(value: T, onUnmount: (value: T) => void): void {
  const latest = useRef(value);
  useEffect(() => {
    latest.current = value;
  }, [value]);
  useEffect(() => {
    return () => {
      onUnmount(latest.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- must register its cleanup once, on mount, so it only fires on unmount, not on every value change.
  }, []);
}
