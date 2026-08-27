const CACHE = "pm-cache-v6";

const STATIC_ASSETS = [
  "./css/style.css",
  "./js/common.js",
  "./js/supabase-config.js",
  "./js/dashboard.js",
  "./js/documents.js",
  "./js/maintenance.js",
  "./js/finance.js",
  "./js/login.js",
  "./manifest.json",
  "./icon-192.png",
  "./icon-512.png"
];

const HTML_PAGES = [
  "./",
  "./index.html",
  "./documents.html",
  "./maintenance.html",
  "./finance.html",
  "./login.html"
];

self.addEventListener("install", event => {
  event.waitUntil(
    caches.open(CACHE).then(cache =>
      cache.addAll([...STATIC_ASSETS, ...HTML_PAGES]).catch(() => {})
    )
  );
  self.skipWaiting();
});

self.addEventListener("activate", event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener("fetch", event => {
  const req = event.request;
  if (req.method !== "GET") return;

  const url = new URL(req.url);

  // Never intercept Supabase Storage/API, CDN, fonts, or other cross-origin requests.
  if (url.origin !== self.location.origin) return;

  // HTML: network first so deployments are picked up quickly.
  if (req.mode === "navigate" || req.headers.get("accept")?.includes("text/html")) {
    event.respondWith(
      fetch(req)
        .then(response => {
          const copy = response.clone();
          caches.open(CACHE).then(cache => cache.put(req, copy)).catch(() => {});
          return response;
        })
        .catch(() => caches.match(req).then(cached => cached || caches.match("./index.html")))
    );
    return;
  }

  // Static same-origin files: cache first for fast repeat visits.
  event.respondWith(
    caches.match(req).then(cached => {
      if (cached) return cached;
      return fetch(req).then(response => {
        const copy = response.clone();
        caches.open(CACHE).then(cache => cache.put(req, copy)).catch(() => {});
        return response;
      });
    })
  );
});
