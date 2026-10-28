/*
 * FitCoach service worker (PROMPT §14, ADR-0061). Hand-rolled and deliberately small:
 * - precaches the offline page and icons;
 * - caches hashed build assets (/_next/static) cache-first — their names change on every deploy;
 * - never caches /api/* or pages: those are network-only, so private data never lands in a cache,
 *   and a page that can't load shows the offline page instead.
 * Mutations need a connection (PROMPT D15); there is no offline queue.
 */
const VERSION = "fitcoach-v1";
const OFFLINE_URL = "/offline";
const PRECACHE = [
  OFFLINE_URL,
  "/icons/icon-192.png",
  "/icons/icon-512.png",
  "/icons/maskable-192.png",
  "/icons/apple-touch-icon.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(VERSION)
      .then((cache) => cache.addAll(PRECACHE))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((key) => key !== VERSION).map((key) => caches.delete(key))),
      )
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  // Network-only: API responses are private and must always be fresh.
  if (url.pathname.startsWith("/api/")) return;

  if (request.mode === "navigate") {
    // Network-only for pages (authenticated HTML is never cached); offline fallback on failure.
    event.respondWith(
      fetch(request).catch(() =>
        caches.match(OFFLINE_URL).then((cached) => cached || Response.error()),
      ),
    );
    return;
  }

  if (url.pathname.startsWith("/_next/static/") || url.pathname.startsWith("/icons/")) {
    event.respondWith(
      caches.match(request).then(
        (cached) =>
          cached ||
          fetch(request).then((response) => {
            if (response.ok) {
              const copy = response.clone();
              event.waitUntil(caches.open(VERSION).then((cache) => cache.put(request, copy)));
            }
            return response;
          }),
      ),
    );
  }
});
