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
    window.addEventListener("load", register);
    return () => window.removeEventListener("load", register);
  }, []);

  return null;
}
