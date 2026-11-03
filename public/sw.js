// Ajali Kit app-shell service worker.
//
// Navigations: network first, so a new deploy is picked up immediately; falls
// back to the cached page, then to the cached shell ("/"), when offline.
// Other same-origin GET assets: cached at runtime (cache first) so the shell
// can reopen offline after one online visit. The HTML fallback applies only to
// navigation requests, never to asset requests. API routes (/api/*) are never
// cached. Photos and claim data live in IndexedDB, not here.
//
// Bump VERSION on each release so old caches are cleared on activate.

const VERSION = "v2";
const CACHE = `ajali-shell-${VERSION}`;
const OFFLINE_URL = "/";
const PRECACHE = ["/", "/manifest.webmanifest"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) => cache.addAll(PRECACHE))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key))),
      )
      .then(() => self.clients.claim()),
  );
});

function cachePut(request, response) {
  if (response && response.ok && response.type === "basic") {
    const copy = response.clone();
    caches
      .open(CACHE)
      .then((cache) => cache.put(request, copy))
      .catch(() => {});
  }
  return response;
}

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") {
    return;
  }

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) {
    return;
  }
  // Never cache API calls.
  if (url.pathname.startsWith("/api/")) {
    return;
  }

  // Navigations: network first, HTML fallback only here.
  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request)
        .then((response) => cachePut(request, response))
        .catch(() =>
          caches
            .match(request)
            .then((cached) => cached || caches.match(OFFLINE_URL)),
        ),
    );
    return;
  }

  // Other assets: cache first, then network. No HTML fallback.
  event.respondWith(
    caches.match(request).then((cached) => {
      if (cached) {
        return cached;
      }
      return fetch(request).then((response) => cachePut(request, response));
    }),
  );
});
