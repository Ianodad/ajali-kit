"use client";

import { useEffect } from "react";

// Registers the app-shell service worker once in the browser. Kept out of the
// server layout so the registration code never runs on the server.
export function ServiceWorkerRegister() {
  useEffect(() => {
    if (typeof window === "undefined" || !("serviceWorker" in navigator)) {
      return;
    }
    const register = () => {
      navigator.serviceWorker.register("/sw.js").catch(() => {
        // Registration is best effort. The app still works without it.
      });
    };
    // If the page has already loaded by the time this effect runs, the "load"
    // event will never fire again, so register straight away. Otherwise wait
    // for load to avoid competing with the first paint.
    if (document.readyState === "complete") {
      register();
      return;
    }
    window.addEventListener("load", register);
    return () => window.removeEventListener("load", register);
  }, []);

  return null;
}
