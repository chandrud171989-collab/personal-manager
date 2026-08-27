const CACHE = "pm-cache-v5";
const APP_SHELL = [
  "./",
  "./index.html",
  "./documents.html",
  "./maintenance.html",
  "./finance.html",
  "./login.html",
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

self.addEventListener("install", event => {
  event.waitUntil(
    caches.open(CACHE)
      .then(cache => cache.addAll(APP_SHELL))
      .catch(() => {})
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

  event.respondWith(
    fetch(req)
      .then(response => {
        const copy = response.clone();
        caches.open(CACHE).then(cache => cache.put(req, copy)).catch(() => {});
        return response;
      })
      .catch(() => caches.match(req).then(cached => cached || caches.match("./")))
  );
});
